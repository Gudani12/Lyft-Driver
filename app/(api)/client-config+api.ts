export function GET() {
  const clerkPublishableKey =
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY;
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const supabasePublishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!clerkPublishableKey) {
    console.error("No Clerk publishable key is configured on the API server.");
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
