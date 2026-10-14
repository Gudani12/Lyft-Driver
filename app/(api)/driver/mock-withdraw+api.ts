import { requireClerkUser } from "@/lib/server-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const MIN_WITHDRAWAL = 50;
const COMMISSION = 0.1;
const CLEARING_HOURS = 24;

export async function POST(request: Request) {
  try {
    const clerkId = await requireClerkUser(request);
    const body = await request.json();
    const amount = Number(body?.amount);

    if (!Number.isFinite(amount) || amount < MIN_WITHDRAWAL) {
      return Response.json(
        { error: `Minimum withdrawal is R${MIN_WITHDRAWAL}` },
        { status: 400 },
      );
    }
    if (Math.round(amount * 100) !== amount * 100) {
      return Response.json(
        { error: "Withdrawal amount must have no more than two decimal places" },
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
      return Response.json({ error: "Driver record not found" }, { status: 404 });
    }

    const cutoff = new Date(Date.now() - CLEARING_HOURS * 3600_000).toISOString();
    const [completed, payouts] = await Promise.all([
      supabase
        .from("rides")
        .select("fare_price")
        .eq("driver_id", driver.id)
        .eq("status", "completed")
        .lte("completed_at", cutoff),
      supabase
        .from("payouts")
        .select("amount, status")
        .eq("driver_id", driver.id),
    ]);

    if (completed.error) throw completed.error;
    if (payouts.error) throw payouts.error;

    const cleared = (completed.data ?? []).reduce(
      (total: number, ride: { fare_price: number | null }) =>
        total + ((ride.fare_price ?? 0) * (1 - COMMISSION)) / 100,
      0,
    );
    const withdrawn = (payouts.data ?? [])
      .filter((payout: { status: string }) => payout.status !== "failed")
      .reduce(
        (total: number, payout: { amount: number | string | null }) =>
          total + Number(payout.amount ?? 0),
        0,
      );
    const available = Math.max(0, cleared - withdrawn);

    if (amount > available) {
      return Response.json(
        { error: `Only R${available.toFixed(2)} is available` },
        { status: 409 },
      );
    }

    const { data, error } = await supabase
      .from("payouts")
      .insert({
        driver_id: driver.id,
        amount,
        status: "paid",
        bank_last4: null,
        is_mock: true,
      })
      .select()
      .single();

    if (error) throw error;
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Error creating mock withdrawal:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
