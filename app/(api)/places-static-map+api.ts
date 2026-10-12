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
      { error: "Map previews are not configured on the API server." },
      { status: 503 },
    );
  }

  const params = new URL(request.url).searchParams;
  const latitude = Number(params.get("latitude"));
  const longitude = Number(params.get("longitude"));
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return Response.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  const upstreamUrl = new URL("https://maps.geoapify.com/v1/staticmap");
  upstreamUrl.searchParams.set("style", "osm-bright");
  upstreamUrl.searchParams.set("width", "600");
  upstreamUrl.searchParams.set("height", "400");
  upstreamUrl.searchParams.set("center", `lonlat:${longitude},${latitude}`);
  upstreamUrl.searchParams.set("zoom", "14");
  upstreamUrl.searchParams.set("apiKey", apiKey);

  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      console.error(`Geoapify static map request failed with status ${upstream.status}.`);
      return Response.json({ error: "Map preview is temporarily unavailable." }, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Geoapify static map request failed:", error);
    return Response.json({ error: "Map preview is temporarily unavailable." }, { status: 502 });
  }
}
