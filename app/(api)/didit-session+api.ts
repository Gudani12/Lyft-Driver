import { getSupabaseServerClient } from "@/lib/supabase-server";

// Per-session config, NOT a secret, NOT an env var.
// From Didit Console → Workflows ("KYC + AML").
const WORKFLOW_ID = "57368fe7-f4dc-487f-bebe-981305685d81";

interface StartSessionPayload {
  clerkId: string;
  docType?: string;
  callbackUrl?: string;
}

export async function POST(request: Request) {
  try {
    const body: StartSessionPayload = await request.json();
    const { clerkId, callbackUrl } = body;

    if (!clerkId) {
      return Response.json(
        { error: "missing_clerk_id", message: "clerkId is required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.DIDIT_API_KEY;
    if (!apiKey) {
      console.error("didit-session: DIDIT_API_KEY is not configured");
      return Response.json(
        {
          error: "server_error",
          message: "Verification service is not configured.",
        },
        { status: 500 },
      );
    }

    const payload: Record<string, unknown> = {
      workflow_id: WORKFLOW_ID,
      vendor_data: clerkId,
    };

    if (callbackUrl) {
      payload.callback = callbackUrl;
    }

    console.log(
      `didit-session: creating session for ${clerkId} with workflow ${WORKFLOW_ID}`,
    );

    const res = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();

    if (!res.ok) {
      console.error("didit-session: Didit API error", res.status, raw);
      return Response.json(
        {
          error: "server_error",
          message: "Could not start identity verification session.",
          detail: raw,
        },
        { status: 502 },
      );
    }

    let session: any;
    try {
      session = JSON.parse(raw);
    } catch {
      return Response.json(
        {
          error: "server_error",
          message: "Verification service returned an invalid response.",
        },
        { status: 502 },
      );
    }

    // Persist session id on driver row (create if missing).
    const supabase = await getSupabaseServerClient();
    const { data: existing } = await supabase
      .from("drivers")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("drivers")
        .update({ didit_session_id: session.session_id })
        .eq("clerk_id", clerkId);
    } else {
      await supabase.from("drivers").insert({
        clerk_id: clerkId,
        status: "pending",
        verified: false,
        driver_verification_status: "pending",
        id_verified: false,
        passport_verified: false,
        licence_verified: false,
        didit_session_id: session.session_id,
        profile_data: {},
      });
    }

    return Response.json({
      data: {
        session_id: session.session_id,
        session_token: session.session_token,
        url: session.url,
      },
    });
  } catch (err: any) {
    console.error("didit-session: server error", err);
    return Response.json(
      {
        error: "server_error",
        message: err?.message ?? "Internal error starting session.",
      },
      { status: 500 },
    );
  }
}