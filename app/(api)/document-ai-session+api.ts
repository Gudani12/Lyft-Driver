import { getSupabaseServerClient } from "@/lib/supabase-server";

// One workflow per document type.
// From Didit Console → Workflows.
const WORKFLOW_IDS: Record<string, string> = {
    pdp: "612dcc07-670a-4488-9e9b-c890e011d1a1",
    police_clearance: "177437aa-f884-4cf0-a9fd-d8ff8da4c612",
    vehicle_registration: "f5c186c0-5626-4630-b9aa-72abb08a2a55",
    operating_card: "9dc415f5-e338-457e-a4e4-9c1406466d64",
    operating_licence: "114a3641-1cc8-48c3-bce6-c6723a710725",
    roadworthy: "a9476bdf-b029-47b0-babd-0d57b1911102",
    insurance: "e271301f-ebed-4a01-8f33-837bddb40037",
};

interface StartPayload {
    clerkId: string;
    docKind: string;
    callbackUrl?: string;
}

export async function POST(request: Request) {
    try {
        const body: StartPayload = await request.json();
        const { clerkId, docKind, callbackUrl } = body;

        if (!clerkId || !docKind) {
            return Response.json(
                {
                    error: "missing_fields",
                    message: "clerkId and docKind are required.",
                },
                { status: 400 },
            );
        }

        const workflowId = WORKFLOW_IDS[docKind];
        if (!workflowId) {
            console.error(
                `document-ai-session: no workflow configured for docKind=${docKind}`,
            );
            return Response.json(
                {
                    error: "workflow_not_configured",
                    message: `No Document AI workflow configured for document type: ${docKind}`,
                },
                { status: 400 },
            );
        }

        const apiKey = process.env.DIDIT_API_KEY;
        if (!apiKey) {
            console.error("document-ai-session: DIDIT_API_KEY is missing");
            return Response.json(
                {
                    error: "server_error",
                    message: "Verification service not configured.",
                },
                { status: 500 },
            );
        }

        const payload: Record<string, unknown> = {
            workflow_id: workflowId,
            vendor_data: clerkId,
            metadata: { docKind },
        };

        if (callbackUrl) {
            payload.callback = callbackUrl;
        }

        console.log(
            `document-ai-session: creating session for ${clerkId} docKind=${docKind} workflow=${workflowId}`,
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
            console.error("document-ai-session: Didit error", res.status, raw);
            return Response.json(
                {
                    error: "server_error",
                    message: "Could not start Document AI session.",
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
                { error: "server_error", message: "Invalid response from Didit." },
                { status: 502 },
            );
        }

        const supabase = await getSupabaseServerClient();
        const { data: driver } = await supabase
            .from("drivers")
            .select("id, profile_data")
            .eq("clerk_id", clerkId)
            .maybeSingle();

        if (driver) {
            const profileData =
                driver.profile_data && typeof driver.profile_data === "object"
                    ? (driver.profile_data as Record<string, any>)
                    : {};

            const docSessions =
                profileData.document_ai_sessions &&
                    typeof profileData.document_ai_sessions === "object"
                    ? profileData.document_ai_sessions
                    : {};

            await supabase
                .from("drivers")
                .update({
                    profile_data: {
                        ...profileData,
                        document_ai_sessions: {
                            ...docSessions,
                            [session.session_id]: {
                                docKind,
                                started_at: new Date().toISOString(),
                            },
                        },
                    },
                })
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
                profile_data: {
                    document_ai_sessions: {
                        [session.session_id]: {
                            docKind,
                            started_at: new Date().toISOString(),
                        },
                    },
                },
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
        console.error("document-ai-session: server error", err);
        return Response.json(
            {
                error: "server_error",
                message: err?.message ?? "Unexpected error.",
            },
            { status: 500 },
        );
    }
}