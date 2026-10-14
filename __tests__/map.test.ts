import { fetchAPI } from "../lib/fetch";
import { fetchRouteCoordinates, getRideMapLocation } from "../lib/map";

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
});
