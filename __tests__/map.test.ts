import { fetchAPI } from "../lib/fetch";
import { fetchRouteCoordinates } from "../lib/map";

jest.mock("../lib/fetch", () => ({
  fetchAPI: jest.fn(),
}));

const mockedFetchAPI = jest.mocked(fetchAPI);

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
