describe("directions API route", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const loadRoute = async () => {
    jest.doMock("../../lib/server-auth", () => ({
      requireClerkUser: jest.fn().mockResolvedValue("clerk_driver"),
    }));
    const { GET } = require("../../app/(api)/directions+api");
    const request = new Request(
      "https://example.com/api/directions?originLatitude=-26.2041&originLongitude=28.0473&destinationLatitude=-26.2&destinationLongitude=28.05",
    );
    return GET(request);
  };

  it("uses the alternate road router when the primary provider is unavailable", async () => {
    const coordinates = [
      [28.0473, -26.2041],
      [28.05, -26.2],
    ];
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "Ok",
            routes: [{ geometry: { coordinates } }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await loadRoute();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.coordinates).toEqual(coordinates);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "routing.openstreetmap.de/routed-car",
    );
  });

  it("returns a temporary error only after both routing providers fail", async () => {
    jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("upstream unavailable"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await loadRoute();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("Route lookup is temporarily unavailable.");
  });
});
