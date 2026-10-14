import { getSupabaseServerClient } from "@/lib/supabase-server";

// Balance model:
//   gross     = fares of completed trips
//   net       = gross minus 10% commission
//   clearing  = net from trips completed in the last 24 hours
//   available = older net, minus everything already withdrawn or in flight

const COMMISSION = 0.1;
const CLEARING_HOURS = 24;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clerkId = url.searchParams.get("clerkId");

    if (!clerkId) {
      return Response.json({ error: "Missing clerkId" }, { status: 400 });
    }
    const withdrawalMode = "simulation";

    const supabase = await getSupabaseServerClient();

    const { data: userRow } = await supabase
      .from("users")
      .select("profile_data")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    const bankLast4 = userRow?.profile_data?.bank_account?.last4 ?? null;

    const empty = {
      summary: {
        available: 0,
        clearing: 0,
        lifetime: 0,
        trips_this_week: 0,
        earned_this_week: 0,
        bank_account_last4: bankLast4,
        withdrawal_mode: withdrawalMode,
      },
      payouts: [],
    };

    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("clerk_id", clerkId)
      .maybeSingle();

    if (!driver) return Response.json({ data: empty });

    const cutoff = new Date(Date.now() - CLEARING_HOURS * 3600_000).toISOString();
    const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    const [completed, payoutRows] = await Promise.all([
      supabase
        .from("rides")
        .select("fare_price, completed_at")
        .eq("driver_id", driver.id)
        .eq("status", "completed"),
      supabase
        .from("payouts")
        .select("id, amount, status, created_at, bank_last4, is_mock")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const net = (cents: number) => (cents * (1 - COMMISSION)) / 100;

    let cleared = 0;
    let clearing = 0;
    let lifetime = 0;
    let earnedThisWeek = 0;
    let tripsThisWeek = 0;

    for (const ride of completed.data ?? []) {
      const value = net(ride.fare_price ?? 0);
      lifetime += value;

      if (ride.completed_at && ride.completed_at > cutoff) clearing += value;
      else cleared += value;

      if (ride.completed_at && ride.completed_at > weekStart) {
        earnedThisWeek += value;
        tripsThisWeek += 1;
      }
    }

    // Failed payouts return the money; pending and paid both count as gone.
    const withdrawn = (payoutRows.data ?? [])
      .filter((p: any) => p.status !== "failed")
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    return Response.json({
      data: {
        summary: {
          available: Math.max(0, cleared - withdrawn),
          clearing,
          lifetime,
          trips_this_week: tripsThisWeek,
          earned_this_week: earnedThisWeek,
          bank_account_last4: bankLast4,
          withdrawal_mode: withdrawalMode,
        },
        payouts: payoutRows.data ?? [],
      },
    });
  } catch (error) {
    console.error("Error computing earnings:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}