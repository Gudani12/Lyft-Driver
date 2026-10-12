describe("client config API route", () => {
  const originalEnvironment = {
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    expoClerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    clerkSecretKey: process.env.CLERK_SECRET_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    expoSupabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    expoSupabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };

  afterEach(() => {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("CLERK_PUBLISHABLE_KEY", originalEnvironment.clerkPublishableKey);
    restore("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", originalEnvironment.expoClerkPublishableKey);
    restore("CLERK_SECRET_KEY", originalEnvironment.clerkSecretKey);
    restore("SUPABASE_URL", originalEnvironment.supabaseUrl);
    restore("EXPO_PUBLIC_SUPABASE_URL", originalEnvironment.expoSupabaseUrl);
    restore("SUPABASE_PUBLISHABLE_KEY", originalEnvironment.supabasePublishableKey);
    restore(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      originalEnvironment.expoSupabasePublishableKey,
    );
    jest.resetModules();
  });

  it("returns only the public Clerk publishable key", async () => {
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_example";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    process.env.CLERK_SECRET_KEY = "sk_test_do_not_return";

    const { GET } = require("../app/(api)/client-config+api");
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        clerkPublishableKey: "pk_test_example",
        supabaseUrl: "https://supabase.example",
        supabasePublishableKey: "sb_publishable_example",
      },
    });
  });

  it("returns an explicit error when the Render key is not configured", async () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

    const { GET } = require("../app/(api)/client-config+api");
    const response = GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Clerk authentication is not configured on the API server.",
    });
  });
});
