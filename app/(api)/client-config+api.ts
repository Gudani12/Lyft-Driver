export function GET() {
  const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!clerkPublishableKey) {
    console.error("CLERK_PUBLISHABLE_KEY is not configured on the API server.");
    return Response.json(
      { error: "Clerk authentication is not configured on the API server." },
      { status: 503 },
    );
  }

  return Response.json({
    data: {
      clerkPublishableKey,
      supabaseUrl: supabaseUrl ?? null,
      supabasePublishableKey: supabasePublishableKey ?? null,
    },
  });
}
