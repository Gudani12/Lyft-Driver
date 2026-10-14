import { fetchAPI } from "../lib/fetch";
import {
  calculateRegionForCoordinates,
  fetchRouteCoordinates,
  getRideMapLocation,
} from "../lib/map";

jest.mock("../lib/fetch", () => ({
  fetchAPI: jest.fn(),
}));

const mockedFetchAPI = jest.mocked(fetchAPI);

describe("getRideMapLocation", () => {
  it("restores pickup and destination points from an active ride", () => {
    expect(
      getRideMapLocation({
        origin_latitude: "-26.2",
        origin_longitude: "28.0",
        origin_address: "Pickup",
        destination_latitude: -26.1,
        destination_longitude: 28.1,
        destination_address: "Drop-off",
      }),
    ).toEqual({
      pickup: {
        latitude: -26.2,
        longitude: 28,
        address: "Pickup",
      },
      destination: {
        latitude: -26.1,
        longitude: 28.1,
        address: "Drop-off",
      },
    });
  });

  it("falls back to the pickup when a ride has no drop-off coordinates", () => {
    expect(
      getRideMapLocation({
        origin_latitude: -26.2,
        origin_longitude: 28,
      }),
    ).toEqual({
      pickup: { latitude: -26.2, longitude: 28, address: null },
      destination: { latitude: -26.2, longitude: 28, address: null },
    });
  });

  it("rejects missing or invalid pickup coordinates", () => {
    expect(getRideMapLocation({ origin_latitude: null, origin_longitude: 28 })).toBeNull();
    expect(getRideMapLocation({ origin_latitude: 100, origin_longitude: 28 })).toBeNull();
  });
});

describe("calculateRegionForCoordinates", () => {
  it("fits the driver, pickup, and drop-off in the map region", () => {
    const region = calculateRegionForCoordinates([
      { latitude: -26.2, longitude: 28.0 },
      { latitude: -26.1, longitude: 28.1 },
      { latitude: -26.3, longitude: 28.2 },
    ]);

    expect(region.latitude).toBeCloseTo(-26.2);
    expect(region.longitude).toBeCloseTo(28.1);
    expect(region.latitudeDelta).toBeCloseTo(0.28);
    expect(region.longitudeDelta).toBeCloseTo(0.28);
  });
});

describe("fetchRouteCoordinates", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("omits the route overlay quietly when the routing service is unavailable", async () => {
    mockedFetchAPI.mockRejectedValue(
      new Error("Route lookup is temporarily unavailable."),
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const route = await fetchRouteCoordinates({
      originLatitude: -26.2,
      originLongitude: 28.0,
      destinationLatitude: -26.1,
      destinationLongitude: 28.1,
      token: "token",
    });

    expect(route).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(mockedFetchAPI).toHaveBeenCalledWith(
      expect.stringContaining("/(api)/directions?"),
      expect.any(Object),
      { logErrors: false },
    );
  });

  it("still warns for unexpected route response errors", async () => {
    mockedFetchAPI.mockRejectedValue(new Error("Invalid route response."));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const route = await fetchRouteCoordinates({
      originLatitude: -26.2,
      originLongitude: 28.0,
      destinationLatitude: -26.1,
      destinationLongitude: 28.1,
      token: "token",
    });

    expect(route).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "Unable to load route polyline",
      expect.any(Error),
    );
  });

  it("falls back to a public road router when the API route lookup is unavailable", async () => {
    mockedFetchAPI.mockRejectedValue(
      new Error("Route lookup is temporarily unavailable."),
    );
    const coordinates = [
      [28.0, -26.2],
      [28.1, -26.1],
    ];
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "Ok",
          routes: [{ geometry: { coordinates } }],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );

    const route = await fetchRouteCoordinates({
      originLatitude: -26.2,
      originLongitude: 28.0,
      destinationLatitude: -26.1,
      destinationLongitude: 28.1,
      token: "token",
    });

    expect(route).toEqual([
      { latitude: -26.2, longitude: 28.0 },
      { latitude: -26.1, longitude: 28.1 },
    ]);
  });
});
