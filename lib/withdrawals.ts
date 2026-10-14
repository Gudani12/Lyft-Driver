const MOCK_WITHDRAWAL_CLERK_IDS = "MOCK_WITHDRAWAL_CLERK_IDS";

export const isMockWithdrawalEnabled = (clerkId: string) => {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const allowedClerkIds = (process.env[MOCK_WITHDRAWAL_CLERK_IDS] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return allowedClerkIds.includes(clerkId);
};

export const getWithdrawalMode = (clerkId: string) =>
  isMockWithdrawalEnabled(clerkId) ? "simulation" : "request";
