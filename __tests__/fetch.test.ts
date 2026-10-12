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
});
