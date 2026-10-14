import { Driver, MarkerData } from "@/types/type";
import { fetchAPI } from "@/lib/fetch";

export const generateMarkersFromData = ({
  data,
  userLatitude,
  userLongitude,
}: {
  data: Driver[];
  userLatitude: number;
  userLongitude: number;
}): MarkerData[] => {
  return data.map((driver, index) => {
    const offsets = [
      { lat: 0.005, lng: 0.003 },
      { lat: -0.004, lng: 0.004 },
      { lat: 0.006, lng: -0.005 },
      { lat: -0.003, lng: -0.004 },
      { lat: 0.008, lng: 0.006 },
      { lat: -0.006, lng: 0.002 },
      { lat: 0.002, lng: -0.008 },
    ];

    const offset = offsets[index % offsets.length];

    return {
      ...driver,
      latitude: userLatitude + offset.lat,
      longitude: userLongitude + offset.lng,
      title: `${driver.first_name} ${driver.last_name}`,
    };
  });
};

export const calculateRegion = ({
  userLatitude,
  userLongitude,
  destinationLatitude,
  destinationLongitude,
}: {
  userLatitude: number | null;
  userLongitude: number | null;
  destinationLatitude?: number | null;
  destinationLongitude?: number | null;
}) => {
  // Default Johannesburg
  if (userLatitude == null || userLongitude == null) {
    return {
      latitude: -26.2041,
      longitude: 28.0473,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }

  // Only user location
  if (destinationLatitude == null || destinationLongitude == null) {
    return {
      latitude: userLatitude,
      longitude: userLongitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  const minLat = Math.min(userLatitude, destinationLatitude);
  const maxLat = Math.max(userLatitude, destinationLatitude);
  const minLng = Math.min(userLongitude, destinationLongitude);
  const maxLng = Math.max(userLongitude, destinationLongitude);

  return {
    latitude: (userLatitude + destinationLatitude) / 2,
    longitude: (userLongitude + destinationLongitude) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
  };
};

export const calculateRegionForCoordinates = (
  coordinates: Array<{ latitude: number; longitude: number }>,
) => {
  if (coordinates.length === 0) {
    return calculateRegion({
      userLatitude: null,
      userLongitude: null,
    });
  }

  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates.map(({ longitude }) => longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.02),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.02),
  };
};

export const getRideMapLocation = (ride: Record<string, unknown>) => {
  const readCoordinate = (
    value: unknown,
    minimum: number,
    maximum: number,
  ): number | null => {
    if (value == null || value === "") return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) &&
      coordinate >= minimum &&
      coordinate <= maximum
      ? coordinate
      : null;
  };
  const latitude = readCoordinate(ride.origin_latitude, -90, 90);
  const longitude = readCoordinate(ride.origin_longitude, -180, 180);

  if (latitude == null || longitude == null) return null;

  const destinationLatitude = readCoordinate(
    ride.destination_latitude,
    -90,
    90,
  );
  const destinationLongitude = readCoordinate(
    ride.destination_longitude,
    -180,
    180,
  );
  const hasDestination =
    destinationLatitude != null && destinationLongitude != null;

  return {
    pickup: {
      latitude,
      longitude,
      address:
        typeof ride.origin_address === "string" ? ride.origin_address : null,
    },
    destination: {
      latitude: hasDestination ? destinationLatitude : latitude,
      longitude: hasDestination ? destinationLongitude : longitude,
      address:
        typeof ride.destination_address === "string"
          ? ride.destination_address
          : null,
    },
  };
};

export const decodePolyline = (encoded: string): Array<{ latitude: number; longitude: number }> => {
  if (!encoded) return [];

  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let result = 0;
    let shift = 0;
    let b = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
};

const getPublicRoadRoute = async ({
  originLatitude,
  originLongitude,
  destinationLatitude,
  destinationLongitude,
}: {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
}) => {
  const coordinates =
    `${originLongitude},${originLatitude};${destinationLongitude},${destinationLatitude}`;
  const providers = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car",
  ];
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const url = new URL(`${provider}/route/v1/driving/${coordinates}`);
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");
      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const body = await response.json();
      const routeCoordinates = body?.routes?.[0]?.geometry?.coordinates;
      if (body?.code !== "Ok" || !Array.isArray(routeCoordinates)) continue;

      const route = routeCoordinates
        .filter(
          (coordinate: unknown) =>
            Array.isArray(coordinate) &&
            coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1]) &&
            coordinate[0] >= -180 &&
            coordinate[0] <= 180 &&
            coordinate[1] >= -90 &&
            coordinate[1] <= 90,
        )
        .map(([longitude, latitude]: [number, number]) => ({
          latitude,
          longitude,
        }));

      if (route.length > 1) return route;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("Public road-routing fallback failed", lastError);
  }

  return [];
};

export const fetchRouteCoordinates = async ({
  originLatitude,
  originLongitude,
  destinationLatitude,
  destinationLongitude,
  token,
}: {
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  token: string;
}) => {
  try {
    const params = new URLSearchParams({
      originLatitude: String(originLatitude),
      originLongitude: String(originLongitude),
      destinationLatitude: String(destinationLatitude),
      destinationLongitude: String(destinationLongitude),
    });
    const response = await fetchAPI(
      `/(api)/directions?${params.toString()}`,
      {
      headers: { Authorization: `Bearer ${token}` },
      },
      { logErrors: false },
    );
    if (typeof response?.data?.polyline === "string") {
      return decodePolyline(response.data.polyline);
    }
    const routeCoordinates = response?.data?.coordinates;
    if (!Array.isArray(routeCoordinates)) {
      throw new Error("Render returned no route coordinates.");
    }
    return routeCoordinates.map(([longitude, latitude]: [number, number]) => ({
      latitude,
      longitude,
    }));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Route lookup is temporarily unavailable." ||
        error.message === "No driving route was found." ||
        error.message === "Network request failed" ||
        error.message === "Failed to fetch")
    ) {
      const fallbackRoute = await getPublicRoadRoute({
        originLatitude,
        originLongitude,
        destinationLatitude,
        destinationLongitude,
      });
      if (fallbackRoute.length > 1) return fallbackRoute;
      return [];
    }

    console.warn("Unable to load route polyline", error);
    return [];
  }
};

export const calculateDriverTimes = async ({
  markers,
}: {
  markers: MarkerData[];
  userLatitude: number | null;
  userLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
}) => {
  // Mock values so Google Directions API isn't required
  return markers.map((marker, index) => ({
    ...marker,
    time: 3 + index * 2,
    price: (45 + index * 10).toFixed(2),
  }));
};