import { requireClerkUser } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    await requireClerkUser(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const apiKey =
    process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY ?? process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.error("No Geoapify API key is configured on the API server.");
    return Response.json(
      { error: "Place search is not configured on the API server." },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const text = params.get("text")?.trim();
  if (!text || text.length < 3 || text.length > 200) {
    return Response.json({ error: "Search text must be between 3 and 200 characters." }, { status: 400 });
  }

  const upstreamUrl = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  upstreamUrl.searchParams.set("text", text);
  upstreamUrl.searchParams.set("limit", "5");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      console.error(`Geoapify autocomplete failed with status ${upstream.status}.`);
      return Response.json({ error: "Place search is temporarily unavailable." }, { status: 502 });
    }
    return Response.json({ data: await upstream.json() });
  } catch (error) {
    console.error("Geoapify autocomplete request failed:", error);
    return Response.json({ error: "Place search is temporarily unavailable." }, { status: 502 });
  }
}
