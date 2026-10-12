import { requireClerkUser } from "@/lib/server-auth";

const readCoordinate = (params: URLSearchParams, name: string, min: number, max: number) => {
  const value = Number(params.get(name));
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
};

export async function GET(request: Request) {
  try {
    await requireClerkUser(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const params = new URL(request.url).searchParams;
  const originLatitude = readCoordinate(params, "originLatitude", -90, 90);
  const originLongitude = readCoordinate(params, "originLongitude", -180, 180);
  const destinationLatitude = readCoordinate(params, "destinationLatitude", -90, 90);
  const destinationLongitude = readCoordinate(params, "destinationLongitude", -180, 180);

  if (
    originLatitude == null ||
    originLongitude == null ||
    destinationLatitude == null ||
    destinationLongitude == null
  ) {
    return Response.json({ error: "Valid origin and destination coordinates are required." }, { status: 400 });
  }

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey) {
    const googleUrl = new URL("https://maps.googleapis.com/maps/api/directions/json");
    googleUrl.searchParams.set("origin", `${originLatitude},${originLongitude}`);
    googleUrl.searchParams.set("destination", `${destinationLatitude},${destinationLongitude}`);
    googleUrl.searchParams.set("mode", "driving");
    googleUrl.searchParams.set("key", googleApiKey);

    try {
      const response = await fetch(googleUrl);
      if (response.ok) {
        const body = await response.json();
        const polyline = body?.routes?.[0]?.overview_polyline?.points;
        if (typeof polyline === "string" && polyline) {
          return Response.json({ data: { polyline } });
        }
      } else {
        console.error(`Google Directions failed with status ${response.status}.`);
      }
    } catch (error) {
      console.error("Google Directions request failed:", error);
    }
  }

  const osrmUrl = new URL(
    `https://router.project-osrm.org/route/v1/driving/${originLongitude},${originLatitude};${destinationLongitude},${destinationLatitude}`,
  );
  osrmUrl.searchParams.set("overview", "full");
  osrmUrl.searchParams.set("geometries", "geojson");

  try {
    const response = await fetch(osrmUrl);
    if (!response.ok) {
      console.error(`OSRM directions failed with status ${response.status}.`);
      return Response.json({ error: "Route lookup is temporarily unavailable." }, { status: 502 });
    }
    const body = await response.json();
    const coordinates = body?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) {
      return Response.json({ error: "No driving route was found." }, { status: 404 });
    }
    return Response.json({ data: { coordinates } });
  } catch (error) {
    console.error("OSRM directions request failed:", error);
    return Response.json({ error: "Route lookup is temporarily unavailable." }, { status: 502 });
  }
}
