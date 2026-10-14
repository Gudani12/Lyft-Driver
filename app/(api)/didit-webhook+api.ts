import { getSupabaseServerClient } from "@/lib/supabase-server";
import crypto from "node:crypto";

// Workflow IDs
const KYC_WORKFLOW_ID = "57368fe7-f4dc-487f-bebe-981305685d81";
const DOCUMENT_AI_WORKFLOW_ID = "ec45a42e-4881-48cc-9f43-37ac551970f2";

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

// Identify which doc kind the extracted fields belong to.
// Didit groups multiple docs into a single Document AI step, so we
// classify based on unique field keys.
function classifyExtractedFields(fields: Record<string, any>): string | null {
  if (!fields || typeof fields !== "object") return null;

  // PrDP — has pdp_category or permit_number
  if ("pdp_category" in fields || "permit_number" in fields) return "pdp";

  // Roadworthy — has test_date
  if ("test_date" in fields) return "roadworthy";

  // Operating Card — has card_number
  if ("card_number" in fields) return "operating_card";

  // Operating Licence — has licence_number
  if ("licence_number" in fields) return "operating_licence";

  // Insurance — has policy_number or insurer
  if ("policy_number" in fields || "insurer" in fields) return "insurance";

  // Police Clearance — has issue_date + certificate_number + full_name
  if (
    "issue_date" in fields &&
    "certificate_number" in fields &&
    "full_name" in fields
  ) {
    return "police_clearance";
  }

  // Vehicle Licence Disc — has plate + vin + expiry_date
  if ("plate" in fields && "vin" in fields && "expiry_date" in fields) {
    return "vehicle_registration";
  }

  // Vehicle Photo — just plate
  if ("plate" in fields && Object.keys(fields).length === 1) {
    return "vehicle_photo";
  }

  return null;
}

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

    console.log(
      `didit-webhook: session=${parsed.session_id} status=${status} workflow=${workflowId} vendor=${clerkId}`,
    );

    if (!clerkId) {
      return new Response("ok");
    }

    const supabase = await getSupabaseServerClient();

    // Route by workflow
    const isDocumentAI =
      workflowId === DOCUMENT_AI_WORKFLOW_ID ||
      // Fallback: if no workflow_id is present, look at the decision shape
      (!workflowId &&
        (decision.document_ai_results || decision.extracted_fields));

    if (isDocumentAI) {
      await handleDocumentAIWebhook({
        supabase,
        clerkId,
        status,
        decision,
      });
    } else {
      await handleKYCWebhook({
        supabase,
        clerkId,
        status,
        decision,
      });
    }

    return new Response("ok");
  } catch (err) {
    console.error("didit-webhook: server error", err);
    return new Response("error", { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC workflow handler (ID + Licence)
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
  const livenessChecks = Array.isArray(decision.liveness_checks)
    ? decision.liveness_checks
    : [];
  const faceMatches = Array.isArray(decision.face_matches)
    ? decision.face_matches
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
        if (firstId.date_of_birth)
          update.date_of_birth = firstId.date_of_birth;
      }

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

      if (
        current?.licence_verified === true &&
        idApproved &&
        allRequired
      ) {
        update.driver_verification_status = "approved";
        update.verified = true;
      }
      break;
    }

    case "Declined": {
      update.driver_verification_status = "rejected";
      update.driver_rejection_reason =
        decision?.reviews?.[0]?.comment ??
        "Identity verification was declined.";
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
// Document AI workflow handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleDocumentAIWebhook({
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
  // Didit may return document AI results in a few possible shapes.
  // Try the most common ones.
  const documentAiResults =
    decision?.document_ai_results ??
    decision?.document_ai ??
    decision?.documents ??
    [];

  const rawResults = Array.isArray(documentAiResults)
    ? documentAiResults
    : [documentAiResults];

  const extractedFields = decision?.extracted_fields ?? decision?.fields ?? null;

  console.log(
    `didit-webhook (DocumentAI): received ${rawResults.length} result(s), status=${status}`,
  );

  // Flatten every extracted-fields bag we can find
  const bags: { fields: Record<string, any>; nodeId?: string }[] = [];

  for (const result of rawResults) {
    if (!result || typeof result !== "object") continue;
    const fields =
      result.extracted_fields ??
      result.fields ??
      result.data ??
      result.extracted_data ??
      null;
    if (fields && typeof fields === "object") {
      bags.push({ fields, nodeId: result.node_id ?? result.step_id });
    }
  }

  if (extractedFields && typeof extractedFields === "object") {
    bags.push({ fields: extractedFields });
  }

  // If nothing useful found, treat the whole decision as fields
  if (bags.length === 0) {
    bags.push({ fields: decision });
  }

  // Build document entries keyed by docKind
  const updates: Record<string, any> = {};

  for (const bag of bags) {
    const fields = bag.fields;
    const kind = classifyExtractedFields(fields);
    if (!kind) continue;

    updates[kind] = {
      status:
        status === "Approved"
          ? "verified"
          : status === "Declined"
            ? "failed"
            : "pending_review",
      extracted_data: fields,
      verified_at: new Date().toISOString(),
      verification_method: "Didit Document AI",
      confidence_score: 0.9,
      failure_reason: status === "Declined" ? "Didit declined the document." : null,
    };
  }

  // Fetch current driver row
  const { data: driver, error: lookupError } = await supabase
    .from("drivers")
    .select(
      "id, profile_data, id_verified, licence_verified, driver_verification_status",
    )
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (lookupError || !driver) {
    console.error(
      "didit-webhook (DocumentAI): driver not found",
      lookupError,
    );
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

  const newDocs = { ...existingDocs };

  for (const [kind, update] of Object.entries(updates)) {
    newDocs[kind] = {
      ...(existingDocs[kind] ?? {}),
      ...update,
    };
  }

  // Recompute overall status
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
    console.error(
      "didit-webhook (DocumentAI): DB update failed",
      updateError,
    );
  }
}