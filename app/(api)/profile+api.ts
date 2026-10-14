import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveDriverVerificationStatus } from "@/lib/business-rules";

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized === "") return null;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function splitFullName(value: unknown) {
  const fullName = typeof value === "string" ? value.trim() : "";
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? null,
    last_name: parts.slice(1).join(" ") || null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clerkId = url.searchParams.get("clerkId");

    if (!clerkId) {
      return Response.json({ error: "Missing clerkId" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: profile, error } = await supabase
      .from("drivers")
      .select(
        "id, first_name, last_name, full_name, email, phone_number, clerk_id, profile_image_url, rating, total_trips, verification_percentage, profile_data, car_seats, is_online, latitude, longitude, last_location_update, status, verified, driver_verification_status, driver_rejection_reason, driver_submitted_at, id_verified, passport_verified, licence_verified, didit_session_id, didit_decision, didit_verified_at, id_number, passport_number, date_of_birth, id_citizenship, aml_hits, liveness_score, face_match_score",
      )
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const driverVerificationStatus = resolveDriverVerificationStatus(profile);
    let vehicle = profile?.profile_data?.vehicle ?? null;
    let completedTrips = profile?.total_trips ?? 0;

    if (profile) {
      const [vehicleResult, completedTripsResult] = await Promise.all([
        supabase
          .from("driver_vehicles")
          .select("make, model, year, colour, plate, seats")
          .eq("driver_id", profile.id)
          .maybeSingle(),
        supabase
          .from("rides")
          .select("ride_id", { count: "exact", head: true })
          .eq("driver_id", profile.id)
          .eq("status", "completed"),
      ]);

      if (
        vehicleResult.error &&
        ["42P01", "PGRST205"].includes(String(vehicleResult.error.code))
      ) {
        console.warn(
          "Driver vehicles table is not installed yet; using legacy vehicle data.",
        );
      } else if (vehicleResult.error) {
        throw vehicleResult.error;
      }
      if (vehicleResult.data) vehicle = vehicleResult.data;

      if (completedTripsResult.error) {
        throw completedTripsResult.error;
      }
      completedTrips = completedTripsResult.count ?? 0;
    }

    if (
      profile &&
      typeof profile.full_name === "string" &&
      (!profile.first_name || !profile.last_name)
    ) {
      const { first_name, last_name } = splitFullName(profile.full_name);
      if (first_name || last_name) {
        const { error: updateError } = await supabase
          .from("drivers")
          .update({ first_name, last_name })
          .eq("clerk_id", clerkId);

        if (updateError) {
          throw updateError;
        }

        profile.first_name = first_name;
        profile.last_name = last_name;
      }
    }

    let driverRating = parseNumber(profile?.rating);
    if (profile) {
      const { data: ratings, error: ratingsError } = await supabase
        .from("driver_ratings")
        .select("rating")
        .eq("driver_id", profile.id);

      if (
        ratingsError &&
        ["42P01", "PGRST205"].includes(String(ratingsError.code))
      ) {
        console.warn(
          "Driver ratings table is not installed yet; using the saved driver rating.",
        );
      } else if (ratingsError) {
        throw ratingsError;
      } else if (ratings?.length) {
        const recordedRatings = ratings
          .map((entry: { rating: number }) => parseNumber(entry.rating))
          .filter((rating: number | null): rating is number => rating !== null);
        if (recordedRatings.length) {
          driverRating =
            recordedRatings.reduce((total: number, rating: number) => total + rating, 0) /
            recordedRatings.length;
        }
      }
    }

    return Response.json({
      data: profile
        ? {
            ...profile,
            rating: driverRating === null ? null : Number(driverRating.toFixed(2)),
            total_trips: completedTrips,
            vehicle,
            name:
              profile.full_name ||
              [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
              null,
            profile_data: profile.profile_data ?? {},
            driver_verification_status: driverVerificationStatus,
          }
        : null,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clerkId, profile_data, vehicle, ...updates } = body;

    if (!clerkId) {
      return Response.json({ error: "Missing clerkId" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();

    const profilePayload =
      profile_data && typeof profile_data === "object" ? { ...profile_data } : undefined;

    if (profilePayload && "vehicle" in profilePayload) {
      delete profilePayload.vehicle;
    }

    const updatePayload: Record<string, unknown> = {};

    if (vehicle != null) {
      if (
        typeof vehicle !== "object" ||
        typeof vehicle.make !== "string" ||
        typeof vehicle.model !== "string" ||
        typeof vehicle.year !== "string" ||
        typeof vehicle.colour !== "string" ||
        typeof vehicle.plate !== "string" ||
        !Number.isInteger(Number(vehicle.seats)) ||
        Number(vehicle.seats) < 1
      ) {
        return Response.json({ error: "Invalid vehicle details" }, { status: 400 });
      }
      updatePayload.car_seats = Number(vehicle.seats);
    }

    if (profilePayload) {
      updatePayload.profile_data = {
        ...profilePayload,
      };
    }

    // ─── Names ────────────────────────────────────────────────────────────
    if (typeof updates.full_name !== "undefined") {
      updatePayload.full_name = updates.full_name;
      if (
        typeof updates.first_name === "undefined" &&
        typeof updates.last_name === "undefined"
      ) {
        const split = splitFullName(updates.full_name);
        updatePayload.first_name = split.first_name;
        updatePayload.last_name = split.last_name;
      }
    }

    if (typeof updates.first_name !== "undefined") {
      updatePayload.first_name = updates.first_name;
    }

    if (typeof updates.last_name !== "undefined") {
      updatePayload.last_name = updates.last_name;
    }

    if (typeof updates.name !== "undefined") {
      updatePayload.full_name = updates.name;
      if (
        typeof updates.first_name === "undefined" &&
        typeof updates.last_name === "undefined"
      ) {
        const split = splitFullName(updates.name);
        updatePayload.first_name = split.first_name;
        updatePayload.last_name = split.last_name;
      }
    }

    // ─── Contact / profile ────────────────────────────────────────────────
    if (typeof updates.email !== "undefined") {
      updatePayload.email = updates.email;
    }

    if (typeof updates.profile_image_url !== "undefined") {
      updatePayload.profile_image_url = updates.profile_image_url;
    }

    if (typeof updates.phone_number !== "undefined") {
      updatePayload.phone_number = updates.phone_number;
    }

    // ─── Stats ────────────────────────────────────────────────────────────
    if (typeof updates.rating !== "undefined") {
      updatePayload.rating = parseNumber(updates.rating);
    }

    if (typeof updates.total_trips !== "undefined") {
      updatePayload.total_trips = parseNumber(updates.total_trips);
    }

    if (typeof updates.verification_percentage !== "undefined") {
      updatePayload.verification_percentage = parseNumber(
        updates.verification_percentage,
      );
    }

    if (typeof updates.car_seats !== "undefined") {
      updatePayload.car_seats = parseNumber(updates.car_seats);
    }

    // ─── Online status (gated by verification) ────────────────────────────
    if (typeof updates.is_online !== "undefined") {
      const currentDriver = await supabase
        .from("drivers")
        .select("status, verified, driver_verification_status")
        .eq("clerk_id", clerkId)
        .maybeSingle();

      const verificationStatus =
        currentDriver?.data?.driver_verification_status ??
        currentDriver?.data?.status ??
        "not_submitted";
      const isApproved =
        verificationStatus === "approved" ||
        currentDriver?.data?.verified === true;

      if (updates.is_online === true && !isApproved) {
        updatePayload.is_online = false;
      } else {
        updatePayload.is_online = updates.is_online;
      }
    }

    // ─── Location ─────────────────────────────────────────────────────────
    if (typeof updates.latitude !== "undefined") {
      updatePayload.latitude = parseNumber(updates.latitude);
    }

    if (typeof updates.longitude !== "undefined") {
      updatePayload.longitude = parseNumber(updates.longitude);
    }

    if (typeof updates.last_location_update !== "undefined") {
      updatePayload.last_location_update = updates.last_location_update;
    }

    // ─── Driver verification status ───────────────────────────────────────
    if (typeof updates.status !== "undefined") {
      updatePayload.status = updates.status;
    }

    if (typeof updates.verified !== "undefined") {
      updatePayload.verified = updates.verified;
    }

    if (typeof updates.driver_verification_status !== "undefined") {
      updatePayload.driver_verification_status =
        updates.driver_verification_status;
    }

    if (typeof updates.driver_rejection_reason !== "undefined") {
      updatePayload.driver_rejection_reason = updates.driver_rejection_reason;
    }

    if (typeof updates.driver_submitted_at !== "undefined") {
      updatePayload.driver_submitted_at = updates.driver_submitted_at;
    }

    // ─── Per-document verification flags (set by Didit webhook) ───────────
    if (typeof updates.id_verified !== "undefined") {
      updatePayload.id_verified = updates.id_verified;
    }

    if (typeof updates.passport_verified !== "undefined") {
      updatePayload.passport_verified = updates.passport_verified;
    }

    if (typeof updates.licence_verified !== "undefined") {
      updatePayload.licence_verified = updates.licence_verified;
    }

    // ─── Didit metadata ───────────────────────────────────────────────────
    if (typeof updates.didit_session_id !== "undefined") {
      updatePayload.didit_session_id = updates.didit_session_id;
    }

    if (typeof updates.didit_decision !== "undefined") {
      updatePayload.didit_decision = updates.didit_decision;
    }

    if (typeof updates.didit_verified_at !== "undefined") {
      updatePayload.didit_verified_at = updates.didit_verified_at;
    }

    // ─── ID extraction fields ─────────────────────────────────────────────
    if (typeof updates.id_number !== "undefined") {
      updatePayload.id_number = updates.id_number;
    }

    if (typeof updates.passport_number !== "undefined") {
      updatePayload.passport_number = updates.passport_number;
    }

    if (typeof updates.date_of_birth !== "undefined") {
      updatePayload.date_of_birth = updates.date_of_birth;
    }

    if (typeof updates.id_citizenship !== "undefined") {
      updatePayload.id_citizenship = updates.id_citizenship;
    }

    // ─── Scores ───────────────────────────────────────────────────────────
    if (typeof updates.aml_hits !== "undefined") {
      updatePayload.aml_hits = parseNumber(updates.aml_hits);
    }

    if (typeof updates.liveness_score !== "undefined") {
      updatePayload.liveness_score = parseNumber(updates.liveness_score);
    }

    if (typeof updates.face_match_score !== "undefined") {
      updatePayload.face_match_score = parseNumber(updates.face_match_score);
    }

    // ─── Apply the update ─────────────────────────────────────────────────
    const { data: updatedDriver, error: updateError } = await supabase
      .from("drivers")
      .update(updatePayload)
      .eq("clerk_id", clerkId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    // ─── Insert if the driver row doesn't exist yet ───────────────────────
    const splitName = splitFullName(
      typeof updates.full_name === "string"
        ? updates.full_name
        : typeof updates.name === "string"
          ? updates.name
          : null,
    );

    const resultData = updatedDriver
      ? updatedDriver
      : (
          await supabase
            .from("drivers")
            .insert({
              clerk_id: clerkId,
              first_name:
                typeof updates.first_name === "string"
                  ? updates.first_name
                  : splitName.first_name,
              last_name:
                typeof updates.last_name === "string"
                  ? updates.last_name
                  : splitName.last_name,
              full_name:
                typeof updates.full_name === "string"
                  ? updates.full_name
                  : typeof updates.name === "string"
                    ? updates.name
                    : null,
              email: typeof updates.email === "string" ? updates.email : null,
              phone_number:
                typeof updates.phone_number === "string"
                  ? updates.phone_number
                  : null,
              profile_image_url:
                typeof updates.profile_image_url === "string"
                  ? updates.profile_image_url
                  : null,
              rating: parseNumber(updates.rating),
              total_trips: parseNumber(updates.total_trips),
              verification_percentage: parseNumber(
                updates.verification_percentage,
              ),
              car_seats:
                vehicle != null
                  ? Number(vehicle.seats)
                  : parseNumber(updates.car_seats),
              is_online:
                typeof updates.is_online === "boolean"
                  ? updates.is_online
                  : false,
              latitude: parseNumber(updates.latitude),
              longitude: parseNumber(updates.longitude),
              last_location_update:
                typeof updates.last_location_update === "string"
                  ? updates.last_location_update
                  : null,
              status:
                typeof updates.status === "string" ? updates.status : "pending",
              verified:
                typeof updates.verified === "boolean" ? updates.verified : false,
              driver_verification_status:
                typeof updates.driver_verification_status === "string"
                  ? updates.driver_verification_status
                  : null,
              driver_rejection_reason:
                typeof updates.driver_rejection_reason === "string"
                  ? updates.driver_rejection_reason
                  : null,
              driver_submitted_at:
                typeof updates.driver_submitted_at === "string"
                  ? updates.driver_submitted_at
                  : null,
              id_verified:
                typeof updates.id_verified === "boolean"
                  ? updates.id_verified
                  : false,
              passport_verified:
                typeof updates.passport_verified === "boolean"
                  ? updates.passport_verified
                  : false,
              licence_verified:
                typeof updates.licence_verified === "boolean"
                  ? updates.licence_verified
                  : false,
              didit_session_id:
                typeof updates.didit_session_id === "string"
                  ? updates.didit_session_id
                  : null,
              didit_decision:
                typeof updates.didit_decision === "object"
                  ? updates.didit_decision
                  : null,
              didit_verified_at:
                typeof updates.didit_verified_at === "string"
                  ? updates.didit_verified_at
                  : null,
              id_number:
                typeof updates.id_number === "string"
                  ? updates.id_number
                  : null,
              passport_number:
                typeof updates.passport_number === "string"
                  ? updates.passport_number
                  : null,
              date_of_birth:
                typeof updates.date_of_birth === "string"
                  ? updates.date_of_birth
                  : null,
              id_citizenship:
                typeof updates.id_citizenship === "string"
                  ? updates.id_citizenship
                  : null,
              aml_hits: parseNumber(updates.aml_hits),
              liveness_score: parseNumber(updates.liveness_score),
              face_match_score: parseNumber(updates.face_match_score),
              profile_data: profilePayload ?? {},
            })
            .select()
            .single()
        ).data;

    if (vehicle != null && resultData?.id) {
      const { error: vehicleError } = await supabase
        .from("driver_vehicles")
        .upsert(
          {
            driver_id: resultData.id,
            make: vehicle.make.trim(),
            model: vehicle.model.trim(),
            year: vehicle.year.trim(),
            colour: vehicle.colour.trim(),
            plate: vehicle.plate.trim().toUpperCase(),
            seats: Number(vehicle.seats),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "driver_id" },
        );

      if (vehicleError) throw vehicleError;
    }

    return Response.json({
      data: resultData
        ? {
            ...resultData,
            ...(vehicle ? { vehicle } : {}),
            name: resultData.full_name ?? null,
          }
        : null,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return Response.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}