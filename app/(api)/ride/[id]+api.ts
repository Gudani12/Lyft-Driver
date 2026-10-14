import { requireClerkUser } from "@/lib/server-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// GET  — one ride
// PATCH — move it through the trip lifecycle:
//   accept   booked      → accepted
//   decline  booked      → cancelled
//   start    accepted    → in_progress
//   complete in_progress → completed
//
// Transitions are validated server-side. Without that, a stale screen could
// complete a trip that was never accepted.

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  accept: { from: ["booked"], to: "accepted" },
  decline: { from: ["booked", "accepted"], to: "cancelled" },
  start: { from: ["accepted"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "completed" },
};

export async function GET(request: Request, { id }: { id: string }) {
  if (!id) {
    return Response.json({ error: "Missing ride id" }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("ride_id", id)
      .maybeSingle();

    if (error) throw error;
    return Response.json({ data });
  } catch (error) {
    console.error("Error fetching ride:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { id }: { id: string }) {
  if (!id) {
    return Response.json({ error: "Missing ride id" }, { status: 400 });
  }

  try {
    const clerkId = await requireClerkUser(request);
    const { action, reason, rating, comment } = await request.json();
    const transition = TRANSITIONS[action];

    if (!transition && action !== "rate") {
      return Response.json(
        { error: `Unknown action "${action}"` },
        { status: 400 },
      );
    }

    if (
      action === "rate" &&
      (!Number.isInteger(rating) || rating < 1 || rating > 5)
    ) {
      return Response.json(
        { error: "Rating must be a whole number from 1 to 5" },
        { status: 400 },
      );
    }
    if (
      action === "rate" &&
      comment != null &&
      (typeof comment !== "string" || comment.length > 500)
    ) {
      return Response.json(
        { error: "Comment must be text no longer than 500 characters" },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServerClient();

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driver) {
      return Response.json({ error: "Driver not found" }, { status: 404 });
    }

    const { data: existing, error: readError } = await supabase
      .from("rides")
      .select("ride_id, driver_id, user_id, status")
      .eq("ride_id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!existing) {
      return Response.json({ error: "Ride not found" }, { status: 404 });
    }

    if (existing.driver_id !== driver.id) {
      return Response.json(
        { error: "Ride does not belong to this driver" },
        { status: 403 },
      );
    }

    if (action === "rate") {
      if (existing.status !== "completed") {
        return Response.json(
          { error: "Only completed rides can be rated" },
          { status: 409 },
        );
      }
      const { data: savedRating, error: ratingError } = await supabase
        .from("passenger_ratings")
        .insert({
          ride_id: String(existing.ride_id),
          driver_id: driver.id,
          passenger_clerk_id: existing.user_id,
          rating,
          comment:
            typeof comment === "string" && comment.trim()
              ? comment.trim()
              : null,
        })
        .select("id, ride_id, rating, comment, created_at")
        .single();

      if (ratingError?.code === "23505") {
        return Response.json(
          { error: "This passenger has already been rated for this ride" },
          { status: 409 },
        );
      }
      if (ratingError) throw ratingError;

      const { data: ratedRides, error: ratingsError } = await supabase
        .from("passenger_ratings")
        .select("rating")
        .eq("passenger_clerk_id", existing.user_id);

      if (ratingsError) throw ratingsError;

      const ratings = (ratedRides ?? []).map(
        (ride: { rating: number }) => ride.rating,
      );
      const averageRating =
        ratings.reduce((sum: number, value: number) => sum + value, 0) /
        ratings.length;

      const { error: passengerUpdateError } = await supabase
        .from("users")
        .update({ rating: Number(averageRating.toFixed(2)) })
        .eq("clerk_id", existing.user_id);

      if (passengerUpdateError) throw passengerUpdateError;

      return Response.json({ data: savedRating });
    }

    const current = existing.status ?? "booked";

    if (current === transition.to) {
      return Response.json({ data: existing });
    }

    if (!transition.from.includes(current)) {
      return Response.json(
        {
          error: `Can't ${action} a ride that is "${current}"`,
          status: current,
        },
        { status: 409 },
      );
    }

    const payload: Record<string, unknown> = { status: transition.to };

    if (transition.to === "completed") {
      payload.completed_at = new Date().toISOString();
    }
    if (transition.to === "cancelled") {
      payload.cancelled_at = new Date().toISOString();
      if (reason) payload.cancel_reason = reason;
    }

    const { data, error } = await supabase
      .from("rides")
      .update(payload)
      .eq("ride_id", id)
      .select()
      .single();

    if (error) throw error;

    return Response.json({ data });
  } catch (error) {
    if (error instanceof Response) return error;
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error.code))
    ) {
      console.error("Passenger ratings table is missing; apply passenger-rating.sql:", error);
      return Response.json(
        {
          error:
            "Passenger ratings are not set up yet. Run passenger-rating.sql in the Supabase SQL Editor and try again.",
        },
        { status: 503 },
      );
    }
    console.error("Error updating ride:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}