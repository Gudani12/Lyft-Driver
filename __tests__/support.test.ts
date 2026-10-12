import {
  INITIAL_SUPPORT_MESSAGE,
  SUPPORT_TOPICS,
  supportErrorMessage,
} from "../lib/support";

describe("driver support helpers", () => {
  it("provides driver-specific help topics", () => {
    expect(SUPPORT_TOPICS.map((topic) => topic.category)).toEqual([
      "trips",
      "requests",
      "earnings",
      "payouts",
      "verification",
      "vehicle",
      "account",
      "safety",
    ]);
    expect(INITIAL_SUPPORT_MESSAGE).toContain("Lyft Driver Support");
  });

  it("explains a missing Gemini key and unavailable support endpoint", () => {
    expect(supportErrorMessage(new Error("AI_SUPPORT_NOT_CONFIGURED"))).toMatch(
      /GEMINI_API_KEY/,
    );
    expect(supportErrorMessage(new Error("Endpoint not found"))).toMatch(
      /endpoint is not available/i,
    );
    expect(supportErrorMessage(new Error("AI_SUPPORT_CONFIG_ERROR"))).toMatch(
      /GEMINI_API_KEY/i,
    );
    expect(supportErrorMessage(new Error("AI_SUPPORT_MODEL_UNAVAILABLE"))).toMatch(
      /model is unavailable/i,
    );
  });

  it("distinguishes rate limits, auth failures, and offline errors", () => {
    expect(supportErrorMessage(new Error("AI_SUPPORT_RATE_LIMITED"))).toMatch(
      /request limit/i,
    );
    expect(supportErrorMessage(new Error("Authentication required"))).toMatch(
      /sign in again/i,
    );
    expect(supportErrorMessage(new Error("Network request failed"))).toMatch(
      /offline/i,
    );
  });
});
