import { getSupabaseServerClient } from "@/lib/supabase-server";

interface DecidePayload {
    clerkId: string;
    docKind: string;
    decision: "verified" | "failed";
    reason?: string | null;
    decidedBy?: string;
}

const ALLOWED_DECISIONS = ["verified", "failed"] as const;

const REQUIRED_DOC_KEYS = [
    "pdp",
    "police_clearance",
    "vehicle_registration",
    "operating_card",
    "insurance",
    "operating_licence",
];

export async function POST(request: Request) {
    try {
        const body: DecidePayload = await request.json();
        const { clerkId, docKind, decision, reason, decidedBy } = body;

        if (!clerkId || !docKind || !decision) {
            return Response.json(
                {
                    error: "missing_fields",
                    message: "clerkId, docKind, and decision are required.",
                },
                { status: 400 },
            );
        }

        if (!ALLOWED_DECISIONS.includes(decision as any)) {
            return Response.json(
                {
                    error: "invalid_decision",
                    message: `Decision must be one of: ${ALLOWED_DECISIONS.join(", ")}`,
                },
                { status: 400 },
            );
        }

        const supabase = await getSupabaseServerClient();

        const { data: driver, error: lookupError } = await supabase
            .from("drivers")
            .select("id, profile_data, id_verified, licence_verified")
            .eq("clerk_id", clerkId)
            .maybeSingle();

        if (lookupError) {
            console.error("admin-decide-document: lookup error", lookupError);
            return Response.json(
                { error: "lookup_failed", message: lookupError.message },
                { status: 500 },
            );
        }

        if (!driver) {
            return Response.json(
                { error: "driver_not_found", message: "Driver row not found." },
                { status: 404 },
            );
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

        const existingDoc = existingDocs[docKind];
        if (!existingDoc?.path) {
            return Response.json(
                {
                    error: "document_not_found",
                    message: `No uploaded document for kind: ${docKind}`,
                },
                { status: 404 },
            );
        }

        const now = new Date().toISOString();

        const updatedDocEntry = {
            ...existingDoc,
            status: decision,
            failure_reason:
                decision === "failed" ? reason ?? "Rejected by admin" : null,
            admin_decided_at: now,
            admin_decided_by: decidedBy ?? "admin",
            verification_method: "Admin manual review",
        };

        const existingAuditLog = Array.isArray(profileData.verification_audit_log)
            ? profileData.verification_audit_log
            : [];

        const auditEntry = {
            timestamp: now,
            actor_id: decidedBy ?? "admin",
            doc_kind: docKind,
            event: "document_verification_manual",
            status: decision,
            confidence_score: 1,
            verification_method: "Admin manual review",
            failure_reason:
                decision === "failed" ? reason ?? "Rejected by admin" : null,
        };

        const newDocuments = { ...existingDocs, [docKind]: updatedDocEntry };
        const newAuditLog = [auditEntry, ...existingAuditLog].slice(0, 50);

        const allRequiredApproved = REQUIRED_DOC_KEYS.every(
            (kind) => newDocuments?.[kind]?.status === "verified",
        );

        const hasAnyFailed = Object.values(newDocuments).some(
            (doc: any) =>
                doc?.status === "failed" ||
                doc?.status === "mismatch" ||
                doc?.status === "expired",
        );

        const nextDriverStatus =
            allRequiredApproved &&
                driver.id_verified === true &&
                driver.licence_verified === true
                ? "approved"
                : hasAnyFailed
                    ? "rejected"
                    : "pending";

        const { error: updateError } = await supabase
            .from("drivers")
            .update({
                driver_verification_status: nextDriverStatus,
                verified: nextDriverStatus === "approved",
                driver_rejection_reason: hasAnyFailed
                    ? reason ?? updatedDocEntry.failure_reason
                    : null,
                profile_data: {
                    ...profileData,
                    driver_documents: newDocuments,
                    verification_audit_log: newAuditLog,
                },
            })
            .eq("clerk_id", clerkId);

        if (updateError) {
            console.error("admin-decide-document: update error", updateError);
            return Response.json(
                { error: "update_failed", message: updateError.message },
                { status: 500 },
            );
        }

        return Response.json({
            success: true,
            docKind,
            status: decision,
            overallDriverStatus: nextDriverStatus,
            decidedAt: now,
        });
    } catch (err: any) {
        console.error("admin-decide-document: server error", err);
        return Response.json(
            {
                error: "internal_error",
                message: err?.message ?? "Unexpected error.",
            },
            { status: 500 },
        );
    }
}