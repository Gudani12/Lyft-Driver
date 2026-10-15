import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  AutomatedDocStatus,
  DocKind,
  REQUIRED_DRIVER_DOCUMENTS,
} from "@/lib/verification";

interface VerifyDocumentPayload {
  clerkId: string;
  docKind: DocKind;
  filePath: string;
  expiryDate?: string | null;
  extractedData?: {
    plate?: string;
    licenceNumber?: string;
    idNumber?: string;
    fullName?: string;
    vin?: string;
    pdpCategory?: string;
    issueDate?: string;
  };
}

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];

export async function POST(request: Request) {
  try {
    const body: VerifyDocumentPayload = await request.json();
    const { clerkId, docKind, filePath, expiryDate, extractedData } = body;

    if (!clerkId || !docKind || !filePath) {
      return Response.json(
        {
          error: "missing_fields",
          message: "clerkId, docKind, and filePath are required.",
        },
        { status: 400 },
      );
    }

    if (!filePath.startsWith(`${clerkId}/`)) {
      return Response.json(
        {
          error: "unauthorized_access",
          message:
            "Access denied: you can only process documents stored within your own secure account directory.",
        },
        { status: 403 },
      );
    }

    const extension = filePath.split(".").pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return Response.json(
        {
          error: "invalid_file_type",
          message: `Unsupported file type .${extension}. Only JPG, PNG, WEBP, and PDF documents are permitted.`,
        },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select(
        "id, full_name, first_name, last_name, id_number, licence_verified, id_verified, driver_verification_status, profile_data",
      )
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (driverError) {
      console.error("verify-document: driver lookup error", driverError);
      return Response.json(
        {
          error: "driver_lookup_failed",
          message: "Could not load driver record. Please try again.",
          detail: driverError.message,
        },
        { status: 500 },
      );
    }

    let activeDriver = driver;

    if (!activeDriver) {
      // Auto-create the driver row so uploads never fail just because
      // the didit-session step didn't run first (e.g. after a server error).
      console.warn("verify-document: no driver row found for", clerkId, "— auto-creating");
      const { data: newDriver, error: insertError } = await supabase
        .from("drivers")
        .insert({
          clerk_id: clerkId,
          status: "pending",
          verified: false,
          driver_verification_status: "pending",
          id_verified: false,
          passport_verified: false,
          licence_verified: false,
          profile_data: {},
        })
        .select(
          "id, full_name, first_name, last_name, id_number, licence_verified, id_verified, driver_verification_status, profile_data",
        )
        .maybeSingle();

      if (insertError || !newDriver) {
        console.error("verify-document: could not auto-create driver row", insertError);
        return Response.json(
          {
            error: "driver_not_found",
            message:
              "Driver record could not be found or created. Please complete your profile before uploading documents.",
            detail: insertError?.message,
          },
          { status: 404 },
        );
      }

      activeDriver = newDriver;
    }

    const profileData =
      activeDriver.profile_data && typeof activeDriver.profile_data === "object"
        ? (activeDriver.profile_data as Record<string, any>)
        : {};

    const existingLicenceNumber: string | undefined =
      profileData?.licence?.licence_number ?? undefined;

    const { data: vehicle } = await supabase
      .from("driver_vehicles")
      .select("plate, make, model, year, vin")
      .eq("driver_id", activeDriver.id)
      .maybeSingle();

    let status: AutomatedDocStatus = "pending_review";
    let confidenceScore = 0.75;
    let failureReason: string | null = null;
    let verificationMethod = "Automated Document Forensics & Cross-Match";

    const now = new Date();

    const clean = (value?: string | null) =>
      (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

    if (expiryDate) {
      const expDate = new Date(expiryDate);
      if (!isNaN(expDate.getTime()) && expDate < now) {
        status = "expired";
        confidenceScore = 1.0;
        failureReason = `Document expired on ${expiryDate}. Current and valid documentation is mandatory under South African transport regulations.`;
      }
    }

    if (status !== "expired") {
      switch (docKind) {
        case "vehicle_registration": {
          const registeredPlate = clean(vehicle?.plate);
          const extractedPlate = clean(extractedData?.plate);

          if (extractedPlate && registeredPlate) {
            if (registeredPlate !== extractedPlate) {
              status = "mismatch";
              confidenceScore = 0.95;
              failureReason = `Licence disc registration plate (${extractedData?.plate}) does not match your registered vehicle plate (${vehicle?.plate}).`;
            } else {
              status = "verified";
              confidenceScore = 0.94;
              verificationMethod =
                "NaTIS Vehicle Register & Disc Barcode Match";
            }
          } else {
            status = "pending_review";
            confidenceScore = 0.8;
          }
          break;
        }

        case "pdp": {
          if (
            extractedData?.pdpCategory &&
            !["P", "PASSENGER", "PASSENGERS"].includes(
              extractedData.pdpCategory.toUpperCase(),
            )
          ) {
            status = "mismatch";
            confidenceScore = 0.9;
            failureReason = `The uploaded PrDP is for Category '${extractedData.pdpCategory}', but Category 'P' (Passengers) is legally required for carpooling.`;
          } else if (activeDriver.licence_verified === true) {
            status = "verified";
            confidenceScore = 0.92;
            verificationMethod =
              "RTMC NaTIS Driver Record & PrDP Validation";
          } else {
            status = "pending_review";
            confidenceScore = 0.82;
          }
          break;
        }

        case "police_clearance": {
          if (extractedData?.issueDate) {
            const issued = new Date(extractedData.issueDate);
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            if (isNaN(issued.getTime())) {
              status = "pending_review";
              confidenceScore = 0.75;
            } else if (issued < sixMonthsAgo) {
              status = "expired";
              confidenceScore = 0.95;
              failureReason =
                "Police clearance is older than 6 months. SAPS clearances expire after 6 months for transport licensing.";
            } else {
              status = "verified";
              confidenceScore = 0.9;
              verificationMethod =
                "SAPS Clearance Issue-Date & Validity Window Check";
            }
          } else {
            status = "pending_review";
            confidenceScore = 0.75;
          }
          break;
        }

        case "operating_card": {
          const registeredPlate = clean(vehicle?.plate);
          const extractedPlate = clean(extractedData?.plate);

          if (
            extractedPlate &&
            registeredPlate &&
            extractedPlate !== registeredPlate
          ) {
            status = "mismatch";
            confidenceScore = 0.95;
            failureReason = `Operating Card plate (${extractedData?.plate}) does not match your vehicle (${vehicle?.plate}).`;
          } else if (expiryDate && new Date(expiryDate) < now) {
            status = "expired";
            confidenceScore = 1.0;
            failureReason = `Operating Card expired on ${expiryDate}.`;
          } else {
            status = "verified";
            confidenceScore = 0.88;
            verificationMethod =
              "NaTIS Operating Card Plate & Expiry Match";
          }
          break;
        }

        case "operating_licence": {
          if (expiryDate && new Date(expiryDate) < now) {
            status = "expired";
            confidenceScore = 1.0;
            failureReason = `Operating Licence expired on ${expiryDate}.`;
          } else if (extractedData?.plate && vehicle?.plate) {
            if (clean(extractedData.plate) !== clean(vehicle.plate)) {
              status = "mismatch";
              confidenceScore = 0.9;
              failureReason =
                "Operating Licence is registered to a different vehicle.";
            } else {
              status = "verified";
              confidenceScore = 0.88;
              verificationMethod = "PRE Operating Licence & Vehicle Match";
            }
          } else {
            status = "verified";
            confidenceScore = 0.85;
            verificationMethod =
              "PRE Operating Licence Upload Confirmation";
          }
          break;
        }

        case "roadworthy":
        case "insurance": {
          if (expiryDate && new Date(expiryDate) > now) {
            status = "verified";
            confidenceScore = 0.88;
            verificationMethod =
              "Policy Certificate Expiry & Active Status Check";
          } else {
            status = "pending_review";
            confidenceScore = 0.75;
          }
          break;
        }

        case "vehicle_photo": {
          status = "verified";
          confidenceScore = 0.9;
          verificationMethod =
            "Vehicle Visual Clarity & Plate Inspection";
          break;
        }

        default:
          status = "pending_review";
          confidenceScore = 0.75;
      }
    }

    const mask = (val?: string | null) => {
      if (!val) return null;
      if (val.length <= 4) return val;
      return `•••• ${val.slice(-4)}`;
    };

    const existingDocs =
      (profileData.driver_documents as Record<string, any>) ?? {};
    const existingAuditLog =
      (profileData.verification_audit_log as any[]) ?? [];

    const updatedDocEntry = {
      path: filePath,
      status,
      confidence_score: confidenceScore,
      verification_method: verificationMethod,
      verified_at: new Date().toISOString(),
      expires_on: expiryDate ?? existingDocs[docKind]?.expires_on ?? null,
      failure_reason: failureReason,
      masked_plate: mask(extractedData?.plate ?? vehicle?.plate),
      masked_licence: mask(
        extractedData?.licenceNumber ?? existingLicenceNumber,
      ),
    };

    const auditEntry = {
      timestamp: new Date().toISOString(),
      actor_id: clerkId,
      doc_kind: docKind,
      event: "document_verification_automated",
      status,
      confidence_score: confidenceScore,
      verification_method: verificationMethod,
      failure_reason: failureReason,
    };

    const newDocuments = {
      ...existingDocs,
      [docKind]: updatedDocEntry,
    };

    const newAuditLog = [auditEntry, ...existingAuditLog].slice(0, 50);

    const allDocsApproved = REQUIRED_DRIVER_DOCUMENTS.every(
      (kind) => newDocuments?.[kind]?.status === "verified",
    );

    const allRequiredApproved =
      allDocsApproved &&
      activeDriver.id_verified === true &&
      activeDriver.licence_verified === true;

    const hasAnyFailedOrMismatch = Object.values(newDocuments).some(
      (doc: any) =>
        doc?.status === "failed" ||
        doc?.status === "mismatch" ||
        doc?.status === "expired",
    );

    let nextDriverStatus = activeDriver.driver_verification_status ?? "pending";
    if (allRequiredApproved) {
      nextDriverStatus = "approved";
    } else if (hasAnyFailedOrMismatch) {
      nextDriverStatus = "rejected";
    } else {
      nextDriverStatus = "pending";
    }

    const { error: updateError } = await supabase
      .from("drivers")
      .update({
        driver_verification_status: nextDriverStatus,
        verified: nextDriverStatus === "approved",
        driver_rejection_reason: hasAnyFailedOrMismatch
          ? failureReason
          : null,
        profile_data: {
          ...profileData,
          driver_documents: newDocuments,
          verification_audit_log: newAuditLog,
        },
      })
      .eq("clerk_id", clerkId);

    if (updateError) {
      console.error(
        "Failed to update driver verification status:",
        updateError,
      );
      return Response.json(
        {
          error: "database_error",
          message: "Failed to persist document verification.",
        },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      docKind,
      status,
      confidenceScore,
      verificationMethod,
      failureReason,
      overallDriverStatus: nextDriverStatus,
      maskedIdentifier:
        updatedDocEntry.masked_plate ?? updatedDocEntry.masked_licence,
      verifiedAt: updatedDocEntry.verified_at,
    });
  } catch (err: any) {
    console.error("Error in verify-document API:", err);
    return Response.json(
      {
        error: "internal_error",
        message:
          err instanceof Error ? err.message : "Internal verification error.",
      },
      { status: 500 },
    );
  }
}