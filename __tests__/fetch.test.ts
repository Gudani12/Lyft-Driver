import { fetchAPI } from "../lib/fetch";

describe("fetchAPI", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends Expo API route group paths to the Render API endpoint", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: null }), {
          headers: { "Content-Type": "application/json" },
        }),
      );

    await fetchAPI("/(api)/profile?clerkId=driver_123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lyft-driver.onrender.com/profile?clerkId=driver_123",
      undefined,
    );
  });

  it("sends ordinary relative paths to the Render API endpoint", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      );

    await fetchAPI("/profile");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lyft-driver.onrender.com/profile",
      undefined,
    );
  });

  it("can leave expected request failures to the caller without logging", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Can\'t start a ride that is "in_progress"' }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      fetchAPI("/(api)/ride/ride_123", { method: "PATCH" }, { logErrors: false }),
    ).rejects.toThrow('Can\'t start a ride that is "in_progress"');

    expect(warn).not.toHaveBeenCalled();
  });
});
