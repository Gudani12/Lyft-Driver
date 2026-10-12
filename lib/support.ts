export type SupportCategory =
  | "trips"
  | "requests"
  | "earnings"
  | "payouts"
  | "verification"
  | "vehicle"
  | "account"
  | "safety";

export type SupportMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  safety?: boolean;
};

export const SUPPORT_TOPICS: {
  category: SupportCategory;
  title: string;
  description: string;
  icon: string;
  prompt: string;
}[] = [
  {
    category: "trips",
    title: "Trips",
    description: "Create or manage a trip",
    icon: "car-outline",
    prompt: "I need help creating or managing a trip.",
  },
  {
    category: "requests",
    title: "Passenger requests",
    description: "Bookings and passenger communication",
    icon: "people-outline",
    prompt: "I need help with a passenger booking or request.",
  },
  {
    category: "earnings",
    title: "Earnings",
    description: "Trip earnings and balances",
    icon: "cash-outline",
    prompt: "I have a question about my earnings.",
  },
  {
    category: "payouts",
    title: "Payouts",
    description: "Bank details and withdrawals",
    icon: "card-outline",
    prompt: "I need help with a payout or my bank details.",
  },
  {
    category: "verification",
    title: "Verification",
    description: "Identity and driver documents",
    icon: "shield-checkmark-outline",
    prompt: "I need help with driver verification or documents.",
  },
  {
    category: "vehicle",
    title: "Vehicle",
    description: "Vehicle details and profile",
    icon: "construct-outline",
    prompt: "I need help with my vehicle details.",
  },
  {
    category: "account",
    title: "App & account",
    description: "Sign-in or app issues",
    icon: "phone-portrait-outline",
    prompt: "I'm having trouble with my account or the app.",
  },
  {
    category: "safety",
    title: "Safety",
    description: "Get help with a safety concern",
    icon: "warning-outline",
    prompt: "I have a safety concern.",
  },
];

export const INITIAL_SUPPORT_MESSAGE =
  "Hi! I'm Lyft Driver Support 👋\n\nI can help with trips, passenger requests, earnings, payouts, verification, vehicle details, your account, and safety.\n\nWhat can I help you with?";

export function supportErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/AI_SUPPORT_NOT_CONFIGURED/i.test(message)) {
    return "AI Support is not configured on Render yet. Please contact Driver Support. The server needs GEMINI_API_KEY.";
  }
  if (/AI_SUPPORT_CONFIG_ERROR/i.test(message)) {
    return "Render could not authenticate with Gemini. Check that GEMINI_API_KEY is valid and enabled for the Gemini API.";
  }
  if (/AI_SUPPORT_MODEL_UNAVAILABLE/i.test(message)) {
    return "The configured Gemini model is unavailable. Please contact the server owner to update the support model.";
  }
  if (/AI_SUPPORT_RATE_LIMITED|429/i.test(message)) {
    return "AI Support has reached its Gemini request limit. Please try again later or contact Driver Support.";
  }
  if (/endpoint not found|404/i.test(message)) {
    return "The support chat endpoint is not available yet. Please contact Driver Support.";
  }
  if (/401|403|authentication|required|unauthorized/i.test(message)) {
    return "Please sign in again to contact Driver Support.";
  }
  if (/network request failed|failed to fetch|networkerror|offline|timed out/i.test(message)) {
    return "You're offline. Check your internet connection and try again.";
  }
  if (/AI_SUPPORT_UPSTREAM_ERROR|temporarily unavailable|502|503|504|500/i.test(message)) {
    return "Lyft Driver AI Support could not reach its AI service. Please try again shortly or contact human support.";
  }
  return "Sorry, we're having trouble connecting to Driver Support. Please try again.";
}
