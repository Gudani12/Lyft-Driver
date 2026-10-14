import { getSupabaseServerClient } from "@/lib/supabase-server";
import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Workflow IDs
// ─────────────────────────────────────────────────────────────────────────────
const KYC_WORKFLOW_ID = "57368fe7-f4dc-487f-bebe-981305685d81";

// Document AI workflows (one per document kind)
const DOCUMENT_AI_WORKFLOW_IDS: Record<string, string> = {
  pdp: "REPLACE_WITH_PDP_WORKFLOW_ID",
  police_clearance: "REPLACE_WITH_POLICE_CLEARANCE_WORKFLOW_ID",
  vehicle_registration: "REPLACE_WITH_VEHICLE_REGISTRATION_WORKFLOW_ID",
  operating_card: "REPLACE_WITH_OPERATING_CARD_WORKFLOW_ID",
  operating_licence: "REPLACE_WITH_OPERATING_LICENCE_WORKFLOW_ID",
  roadworthy: "REPLACE_WITH_ROADWORTHY_WORKFLOW_ID",
  insurance: "REPLACE_WITH_INSURANCE_WORKFLOW_ID",
};

// Reverse map: workflow ID → doc kind
const WORKFLOW_ID_TO_DOC_KIND: Record<string, string> = Object.fromEntries(
  Object.entries(DOCUMENT_AI_WORKFLOW_IDS).map(([kind, id]) => [id, kind]),
);

// Required number of extracted fields per doc kind.
// If Didit returns fewer fields than this, we refuse to mark the doc verified.
const MIN_FIELD_COUNT: Record<string, number> = {
  pdp: 3,
  police_clearance: 3,
  vehicle_registration: 3,
  operating_card: 2,
  operating_licence: 2,
  roadworthy: 2,
  insurance: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// HMAC canonicalisation helpers
// ─────────────────────────────────────────────────────────────────────────────
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        shortenFloats(x),
      ]),
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0)
    return Math.trunc(v);
  return v;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook entry point
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const sig = request.headers.get("x-signature-v2") ?? "";

    const parsed = JSON.parse(raw);
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));

    const secret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!secret) {
      console.error("didit-webhook: DIDIT_WEBHOOK_SECRET not set");
      return new Response("server not configured", { status: 500 });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(canonical, "utf8")
      .digest("hex");

    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      console.error("didit-webhook: bad signature");
      return new Response("bad sig", { status: 401 });
    }

    const ts = Number(parsed.timestamp);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
      return new Response("stale", { status: 401 });
    }

    const clerkId: string | undefined = parsed.vendor_data;
    const status: string | undefined = parsed.status;
    const decision = parsed.decision ?? {};
    const workflowId: string | undefined = parsed.workflow_id;
    const metadata = parsed.metadata ?? {};

    console.log(
      `didit-webhook: session=${parsed.session_id} status=${status} workflow=${workflowId} vendor=${clerkId} metadata=${JSON.stringify(metadata)}`,
    );

    if (!clerkId) {
      return new Response("ok");
    }

    const supabase = await getSupabaseServerClient();

    // Route based on workflow
    const isKyc = workflowId === KYC_WORKFLOW_ID;
    const isDocumentAI =
      workflowId && workflowId in WORKFLOW_ID_TO_DOC_KIND;

    if (isDocumentAI) {
      await handleDocumentAIWebhook({
        supabase,
        clerkId,
        status,
        decision,
        workflowId: workflowId!,
        metadata,
      });
    } else if (isKyc) {
      await handleKYCWebhook({
        supabase,
        clerkId,
        status,
        decision,
      });
    } else {
      console.warn(`didit-webhook: unknown workflow ${workflowId}`);
    }

    return new Response("ok");
  } catch (err) {
    console.error("didit-webhook: server error", err);
    return new Response("error", { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC handler (ID + Licence)
// ─────────────────────────────────────────────────────────────────────────────
async function handleKYCWebhook({
  supabase,
  clerkId,
  status,
  decision,
}: {
  supabase: any;
  clerkId: string;
  status: string | undefined;
  decision: any;
}) {
  const idVerifications = Array.isArray(decision.id_verifications)
    ? decision.id_verifications
    : [];

  const idApproved = idVerifications.some((v: any) => v?.status === "Approved");

  const update: Record<string, unknown> = {
    didit_decision: decision,
    didit_verified_at: new Date().toISOString(),
  };

  switch (status) {
    case "Approved": {
      if (idApproved) update.id_verified = true;

      const firstId = idVerifications[0];
      if (firstId) {
        if (firstId.document_number) update.id_number = firstId.document_number;
        if (firstId.first_name) update.first_name = firstId.first_name;
        if (firstId.last_name) update.last_name = firstId.last_name;
        if (firstId.date_of_birth) update.date_of_birth = firstId.date_of_birth;
      }

      // Recompute overall driver status
      const { data: current } = await supabase
        .from("drivers")
        .select("licence_verified, profile_data")
        .eq("clerk_id", clerkId)
        .maybeSingle();

      const profileData =
        current?.profile_data && typeof current.profile_data === "object"
          ? current.profile_data
          : {};
      const docs = profileData.driver_documents ?? {};

      const REQUIRED = [
        "pdp",
        "police_clearance",
        "vehicle_registration",
        "operating_card",
        "insurance",
        "operating_licence",
      ];
      const allRequired = REQUIRED.every(
        (k) => docs?.[k]?.status === "verified",
      );

      if (current?.licence_verified === true && idApproved && allRequired) {
        update.driver_verification_status = "approved";
        update.verified = true;
      }
      break;
    }

    case "Declined": {
      update.driver_verification_status = "rejected";
      update.driver_rejection_reason =
        decision?.reviews?.[0]?.comment ?? "Identity verification was declined.";
      break;
    }

    case "In Review":
    case "In Progress":
    case "Awaiting User": {
      update.driver_verification_status = "pending";
      break;
    }

    case "Kyc Expired": {
      update.id_verified = false;
      update.driver_verification_status = "pending";
      break;
    }

    default:
      console.log(`didit-webhook (KYC): no-op status ${status}`);
  }

  const { error } = await supabase
    .from("drivers")
    .update(update)
    .eq("clerk_id", clerkId);

  if (error) console.error("didit-webhook (KYC): DB update failed", error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Document AI handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleDocumentAIWebhook({
  supabase,
  clerkId,
  status,
  decision,
  workflowId,
  metadata,
}: {
  supabase: any;
  clerkId: string;
  status: string | undefined;
  decision: any;
  workflowId: string;
  metadata: any;
}) {
  // Determine doc kind from metadata OR workflow id
  const docKind: string | undefined =
    (typeof metadata?.docKind === "string" ? metadata.docKind : undefined) ??
    WORKFLOW_ID_TO_DOC_KIND[workflowId];

  if (!docKind) {
    console.error(
      `didit-webhook (DocumentAI): could not determine docKind for workflow ${workflowId}`,
    );
    return;
  }

  // ── Extract fields from whatever shape Didit sent ─────────────────────
  const documentAiResults =
    decision?.document_ai_results ??
    decision?.document_ai ??
    decision?.documents ??
    [];

  const rawResults = Array.isArray(documentAiResults)
    ? documentAiResults
    : [documentAiResults];

  // Find the first non-empty fields bag
  let extractedFields: Record<string, any> | null = null;

  for (const result of rawResults) {
    if (!result || typeof result !== "object") continue;
    const fields =
      result.extracted_fields ??
      result.fields ??
      result.data ??
      result.extracted_data ??
      null;
    if (fields && typeof fields === "object" && Object.keys(fields).length > 0) {
      extractedFields = fields;
      break;
    }
  }

  // Fallback: check the top-level decision for a flat fields object
  if (!extractedFields) {
    const topLevel =
      decision?.extracted_fields ?? decision?.fields ?? null;
    if (topLevel && typeof topLevel === "object") {
      extractedFields = topLevel;
    }
  }

  // If still nothing, treat the whole decision as fields for debug purposes
  if (!extractedFields) {
    extractedFields = {};
  }

  const fieldCount = Object.keys(extractedFields).length;
  const minRequired = MIN_FIELD_COUNT[docKind] ?? 2;

  console.log(
    `didit-webhook (DocumentAI): docKind=${docKind} status=${status} fieldCount=${fieldCount} minRequired=${minRequired}`,
  );

  // ── Decide the status ──────────────────────────────────────────────────
  // Only mark verified if:
  //  - Didit returned Approved
  //  - We got at least the minimum number of fields for this document
  let docStatus: string;
  let failureReason: string | null = null;

  if (status === "Approved" && fieldCount >= minRequired) {
    docStatus = "verified";
  } else if (status === "Declined") {
    docStatus = "failed";
    failureReason =
      decision?.reviews?.[0]?.comment ?? "Didit declined the document.";
  } else if (status === "Approved" && fieldCount < minRequired) {
    // Didit said Approved but it extracted almost nothing —
    // likely the wrong image. Treat as failed.
    docStatus = "failed";
    failureReason = `Could not read the required fields from the uploaded image. Please upload a clear photo of your ${docKind.replace(/_/g, " ")}.`;
  } else {
    docStatus = "pending_review";
  }

  // ── Persist ────────────────────────────────────────────────────────────
  const { data: driver, error: lookupError } = await supabase
    .from("drivers")
    .select(
      "id, profile_data, id_verified, licence_verified, driver_verification_status",
    )
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (lookupError || !driver) {
    console.error("didit-webhook (DocumentAI): driver not found", lookupError);
    return;
  }

  const profileData =
    driver.profile_data && typeof driver.profile_data === "object"
      ? (driver.profile_data as Record<string, any>)
      : {};

  const existingDocs =
    profileData.driver_documents &&
      typeof profileData.driver_documents === "object"
      ? (profileData.driver_documents as Record<string, any>)
      : {};

  const newDocs = {
    ...existingDocs,
    [docKind]: {
      ...(existingDocs[docKind] ?? {}),
      status: docStatus,
      extracted_data: extractedFields,
      verified_at: new Date().toISOString(),
      verification_method: "Didit Document AI",
      failure_reason: failureReason,
    },
  };

  // Recompute overall driver verification status
  const REQUIRED = [
    "pdp",
    "police_clearance",
    "vehicle_registration",
    "operating_card",
    "insurance",
    "operating_licence",
  ];

  const allRequired = REQUIRED.every(
    (k) => newDocs?.[k]?.status === "verified",
  );
  const anyFailed = Object.values(newDocs).some(
    (d: any) =>
      d?.status === "failed" ||
      d?.status === "mismatch" ||
      d?.status === "expired",
  );

  let nextDriverStatus = driver.driver_verification_status ?? "pending";
  if (
    allRequired &&
    driver.id_verified === true &&
    driver.licence_verified === true
  ) {
    nextDriverStatus = "approved";
  } else if (anyFailed) {
    nextDriverStatus = "rejected";
  } else {
    nextDriverStatus = "pending";
  }

  const { error: updateError } = await supabase
    .from("drivers")
    .update({
      driver_verification_status: nextDriverStatus,
      verified: nextDriverStatus === "approved",
      profile_data: {
        ...profileData,
        driver_documents: newDocs,
      },
    })
    .eq("clerk_id", clerkId);

  if (updateError) {
    console.error("didit-webhook (DocumentAI): DB update failed", updateError);
  }
}