import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, StatCard } from "@/components/Cards";
import CustomButton from "@/components/CustomButton";
import { brand, ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";

const CLEARING_HOURS = 24;
const MIN_WITHDRAWAL = 50;

type Payout = {
  id: string | number;
  amount: number;
  status: "pending" | "paid" | "failed";
  created_at: string;
  bank_last4?: string;
  is_mock?: boolean;
};

type Summary = {
  available: number;
  clearing: number;
  lifetime: number;
  trips_this_week: number;
  earned_this_week: number;
  bank_account_last4?: string | null;
  withdrawal_mode?: "request" | "simulation";
};

const STATUS = {
  pending: { bg: "bg-[#FFF6E5]", text: "text-[#D99A1B]", label: "Processing" },
  paid: { bg: "bg-[#F0E6FA]", text: "text-[#5A189A]", label: "Paid out" },
  failed: { bg: "bg-[#FEF3F3]", text: "text-[#B02A2A]", label: "Failed" },
};

const Earnings = () => {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const result = await fetchAPI(
        `/(api)/driver/earnings?clerkId=${encodeURIComponent(user.id)}`,
      );
      setSummary(result?.data?.summary ?? null);
      setPayouts(result?.data?.payouts ?? []);
    } catch (error) {
      console.warn("Could not load earnings", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const available = summary?.available ?? 0;
  const hasBank = Boolean(summary?.bank_account_last4);
  const isMockWithdrawal = summary?.withdrawal_mode === "simulation";

  const requested = Number(amount) || 0;
  const amountError = useMemo(() => {
    if (!amount) return null;
    if (requested < MIN_WITHDRAWAL) return `Minimum withdrawal is R${MIN_WITHDRAWAL}`;
    if (requested > available) return "That's more than your available balance";
    return null;
  }, [amount, requested, available]);

  const canWithdraw =
    (hasBank || isMockWithdrawal) && !amountError && requested >= MIN_WITHDRAWAL;

  const withdraw = async () => {
    if (!canWithdraw || !user?.id) return;
    setSubmitting(true);

    try {
      const token = await getToken();
      const isMock = isMockWithdrawal;
      await fetchAPI(
        isMock ? "/(api)/driver/mock-withdraw" : "/(api)/driver/withdraw",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ clerkId: user.id, amount: requested }),
        },
      );

      setSheetOpen(false);
      setAmount("");
      await load();

      Alert.alert(
        isMock ? "Withdrawal recorded" : "Withdrawal requested",
        isMock
          ? `R${requested} was recorded. No bank transfer was made.`
          : `Your request for R${requested} to your bank account ending ${summary?.bank_account_last4} is pending processing. You can track it in withdrawal history.`,
      );
    } catch (error: any) {
      Alert.alert(
        "Couldn't process that",
        error?.message ?? "Please try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F4FB]">
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#5A189A"
            colors={["#5A189A"]}
          />
        }
      >
        <Text className="my-5 text-2xl font-JakartaExtraBold text-[#21152F]">
          Earnings
        </Text>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="#5A189A" />
          </View>
        ) : (
          <>
            {/* Balance Hero Card */}
            <View className="overflow-hidden rounded-3xl bg-[#1D1135] p-6 shadow-xl shadow-black/20">
              <Text className="text-[11.5px] font-JakartaBold uppercase tracking-wider text-white/50">
                Available to withdraw
              </Text>
              <Text className="mt-2 text-[40px] font-JakartaExtraBold leading-tight text-white">
                R{available.toFixed(2)}
              </Text>

              {(summary?.clearing ?? 0) > 0 && (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Ionicons name="time-outline" size={13} color="#C77DFF" />
                  <Text className="text-[12px] font-Jakarta text-white/60">
                    R{summary?.clearing.toFixed(2)} clearing — released{" "}
                    {CLEARING_HOURS} hours after each trip
                  </Text>
                </View>
              )}

              <Pressable
                onPress={() => setSheetOpen(true)}
                disabled={available < MIN_WITHDRAWAL}
                className={`mt-5 h-[52px] flex-row items-center justify-center gap-2 rounded-2xl bg-[#5A189A] ${
                  available < MIN_WITHDRAWAL ? "opacity-40" : "active:opacity-85"
                }`}
              >
                <Ionicons name="arrow-down-circle-outline" size={19} color="#fff" />
                <Text className="text-[15px] font-JakartaBold text-white">
                  Withdraw
                </Text>
              </Pressable>

              {available < MIN_WITHDRAWAL && (
                <Text className="mt-2.5 text-center text-[11.5px] font-Jakarta text-white/50">
                  You can withdraw once you have R{MIN_WITHDRAWAL}
                </Text>
              )}
            </View>

            {/* This week */}
            <Text className="mb-3 mt-6 text-[15px] font-JakartaExtraBold text-[#21152F]">
              This week
            </Text>
            <View className="mb-2 flex-row gap-3">
              <StatCard
                icon="cash-outline"
                label="Earned"
                value={`R${(summary?.earned_this_week ?? 0).toFixed(0)}`}
              />
              <StatCard
                icon="car-sport-outline"
                label="Trips"
                value={String(summary?.trips_this_week ?? 0)}
              />
              <StatCard
                icon="trending-up-outline"
                label="All time"
                value={`R${(summary?.lifetime ?? 0).toFixed(0)}`}
              />
            </View>

            {/* Bank account */}
            <Text className="mb-3 mt-5 text-[15px] font-JakartaExtraBold text-[#21152F]">
              Payout account
            </Text>

            <Pressable
              onPress={() => router.push("/(root)/bank-details")}
              className="mb-2.5 flex-row items-center rounded-2xl border border-[#E9E2F0] bg-white px-4 py-4 active:opacity-80"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#F0E6FA]">
                <Ionicons name="business-outline" size={18} color="#5A189A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-JakartaSemiBold text-[#21152F]">
                  {hasBank
                    ? `Account ending ${summary?.bank_account_last4}`
                    : "No bank account added"}
                </Text>
                <Text className="mt-0.5 text-[12px] font-Jakarta text-[#746A7E]">
                  {isMockWithdrawal
                    ? "Bank account not needed for test withdrawals"
                    : hasBank
                      ? "Payouts are sent here"
                      : "Add one to receive your earnings"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A69BAF" />
            </Pressable>

            {/* History */}
            <Text className="mb-3 mt-5 text-[15px] font-JakartaExtraBold text-[#21152F]">
              Withdrawal history
            </Text>

            {payouts.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="No withdrawals yet"
                message="Once you've completed trips and withdrawn your earnings, every payout appears here."
              />
            ) : (
              payouts.map((payout) => {
                const s = payout.is_mock
                  ? { bg: "bg-[#F0E6FA]", text: "text-[#5A189A]", label: "Recorded" }
                  : STATUS[payout.status] ?? STATUS.pending;
                return (
                  <View
                    key={payout.id}
                    className="mb-2.5 flex-row items-center rounded-2xl border border-[#E9E2F0] bg-white px-4 py-3.5"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#F7F4FB]">
                      <Ionicons name="arrow-down" size={17} color="#5A189A" />
                    </View>

                    <View className="ml-3 flex-1">
                      <Text className="text-[15px] font-JakartaBold text-[#21152F]">
                        R{Number(payout.amount).toFixed(2)}
                      </Text>
                      <Text className="mt-0.5 text-[11.5px] font-Jakarta text-[#746A7E]">
                        {new Date(payout.created_at).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {payout.bank_last4 ? ` · ending ${payout.bank_last4}` : ""}
                      </Text>
                    </View>

                    <View className={`rounded-full px-2.5 py-1 ${s.bg}`}>
                      <Text className={`text-[10.5px] font-JakartaBold ${s.text}`}>
                        {s.label}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Withdraw sheet */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            className="absolute inset-0 bg-black/40"
            onPress={() => setSheetOpen(false)}
          />

          <View
            className="rounded-t-3xl bg-white px-6 pt-3"
            style={{ maxHeight: "90%" }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 36 }}
            >
              <View className="mb-5 items-center">
                <View className="h-1 w-11 rounded-full bg-[#E9E2F0]" />
              </View>

              <Text className="text-[20px] font-JakartaExtraBold text-[#21152F]">
                Withdraw earnings
              </Text>
              <Text className="mt-1 text-[13px] font-Jakarta text-[#746A7E]">
                R{available.toFixed(2)} available
                {isMockWithdrawal
                  ? " · test withdrawals"
                  : hasBank
                    ? ` · account ending ${summary?.bank_account_last4}`
                    : ""}
              </Text>

              {isMockWithdrawal && (
                <Text className="mt-2 text-[12px] font-JakartaMedium text-[#D99A1B]">
                  Test withdrawals only. No bank transfer will be made.
                </Text>
              )}

              <View
                className={`mt-5 flex-row items-center rounded-2xl border-[1.5px] px-4 ${
                  amountError
                    ? "border-[#E0575B] bg-[#FEF3F3]"
                    : "border-[#E9E2F0] bg-[#F7F4FB]"
                }`}
              >
                <Text className="text-[24px] font-JakartaExtraBold text-[#746A7E]">R</Text>
                <TextInput
                  value={amount}
                  onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  placeholderTextColor={ui.faint}
                  keyboardType="number-pad"
                  autoFocus
                  className="ml-2 h-[62px] flex-1 text-[24px] font-JakartaExtraBold text-[#21152F]"
                />
                <Pressable
                  onPress={() => setAmount(String(Math.floor(available)))}
                  className="rounded-full bg-[#F0E6FA] px-3 py-1.5 active:opacity-70"
                >
                  <Text className="text-[12px] font-JakartaBold text-[#5A189A]">All</Text>
                </Pressable>
              </View>

              {!!amountError && (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Ionicons name="alert-circle-outline" size={14} color="#E0575B" />
                  <Text className="text-[12px] font-JakartaMedium text-[#E0575B]">
                    {amountError}
                  </Text>
                </View>
              )}

              {!hasBank && !isMockWithdrawal && (
                <View className="mt-3 flex-row gap-2 rounded-2xl bg-[#FFF6E5] p-3.5">
                  <Ionicons name="warning-outline" size={15} color="#D99A1B" />
                  <Text className="flex-1 text-[11.5px] font-Jakarta leading-4 text-[#D99A1B]">
                    Add a bank account before withdrawing. You&apos;ll find it under
                    driver verification.
                  </Text>
                </View>
              )}

              <View className="mt-4 flex-row gap-2.5 rounded-2xl border border-[#E9E2F0] p-4">
                <Ionicons name="time-outline" size={15} color="#5A189A" />
                <Text className="flex-1 text-[11.5px] font-Jakarta leading-4 text-[#746A7E]">
                  {isMockWithdrawal
                    ? "This records the withdrawal in your account balance. No bank transfer is made."
                    : "Your request will be reviewed before payout and will appear in your withdrawal history."}
                </Text>
              </View>

              <View className="mt-5">
                <CustomButton
                  title={
                    submitting
                      ? isMockWithdrawal
                        ? "Recording…"
                        : "Requesting…"
                      : `Withdraw R${requested || 0}`
                  }
                  loading={submitting}
                  disabled={!canWithdraw}
                  onPress={withdraw}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

export default Earnings;
