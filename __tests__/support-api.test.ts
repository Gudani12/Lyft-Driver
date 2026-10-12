describe("driver support chat API", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("../lib/server-auth", () => ({
      requireClerkUser: jest.fn().mockResolvedValue("driver_test"),
    }));
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  const makeRequest = (body: unknown) =>
    new Request("https://example.test/support/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify(body),
    });

  it("responds to safety emergencies without calling Gemini", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    process.env.GEMINI_API_KEY = "server-only-test-key";

    const { POST } = require("../app/(api)/support/chat+api");
    const response = await POST(makeRequest({ message: "I am in immediate danger" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { safety: true },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a clear configuration error when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const { POST } = require("../app/(api)/support/chat+api");
    const response = await POST(makeRequest({ message: "How do payouts work?" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI_SUPPORT_NOT_CONFIGURED",
    });
  });

  it("rejects invalid messages before requesting Gemini", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    process.env.GEMINI_API_KEY = "server-only-test-key";

    const { POST } = require("../app/(api)/support/chat+api");
    const response = await POST(makeRequest({ message: "  " }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Gemini using the Render-only API key and returns the reply", async () => {
    process.env.GEMINI_API_KEY = "server-only-test-key";
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "Check the Earnings screen." }],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const { POST } = require("../app/(api)/support/chat+api");
    const response = await POST(
      makeRequest({
        message: "Where can I see my payout?",
        category: "payouts",
        history: [{ role: "user", text: "I drive for Lyft Driver." }],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        success: true,
        reply: "Check the Earnings screen.",
        safety: false,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1beta/interactions");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-goog-api-key": "server-only-test-key",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: "gemini-3.1-flash-lite",
      system_instruction: expect.any(String),
      generation_config: { thinking_level: "low" },
    });
  });

  it("returns a clear message when Render has an invalid Gemini key", async () => {
    process.env.GEMINI_API_KEY = "server-only-test-key";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    const { POST } = require("../app/(api)/support/chat+api");
    const response = await POST(makeRequest({ message: "How do payouts work?" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "AI_SUPPORT_CONFIG_ERROR",
    });
  });
});
