import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type IoniconName = keyof typeof Ionicons.glyphMap;

type SectionCardProps = {
  title: string;
  value?: string;
  icon?: IoniconName;
  onPress?: () => void;
  status?: "verified" | "pending" | "rejected" | "required";
  tone?: "default" | "danger";
};

const STATUS_PILL = {
  verified: { bg: "bg-[#F0E6FA]", text: "text-[#5A189A]", label: "Verified" },
  pending:  { bg: "bg-[#FFF6E5]", text: "text-[#D99A1B]", label: "In review" },
  rejected: { bg: "bg-[#FEF3F3]", text: "text-[#B02A2A]", label: "Rejected" },
  required: { bg: "bg-[#F0E6FA]", text: "text-[#746A7E]", label: "Required" },
};

export const SectionCard = ({
  title,
  value,
  icon = "ellipse-outline",
  onPress,
  status,
  tone = "default",
}: SectionCardProps) => {
  const danger = tone === "danger";
  const pill = status ? STATUS_PILL[status] : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mb-2.5 flex-row items-center justify-between rounded-2xl border border-[#E9E2F0] bg-white px-4 py-3.5 active:opacity-70"
    >
      <View className="flex-1 flex-row items-center gap-3">
        <View
          className={`h-10 w-10 items-center justify-center rounded-xl ${
            danger ? "bg-[#FEF3F3]" : "bg-[#F0E6FA]"
          }`}
        >
          <Ionicons
            name={icon}
            size={18}
            color={danger ? "#E0575B" : "#5A189A"}
          />
        </View>

        <View className="flex-1">
          <Text
            className={`text-[14px] font-JakartaSemiBold ${
              danger ? "text-[#E0575B]" : "text-[#21152F]"
            }`}
          >
            {title}
          </Text>
          {!!value && (
            <Text
              className="mt-0.5 text-[12px] font-Jakarta leading-[18px] text-[#746A7E]"
            >
              {value}
            </Text>
          )}
        </View>
      </View>

      {pill ? (
        <View className={`mr-1.5 rounded-full px-2.5 py-1 ${pill.bg}`}>
          <Text className={`text-[10.5px] font-JakartaBold ${pill.text}`}>
            {pill.label}
          </Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={18} color="#A69BAF" />
    </Pressable>
  );
};

type StatCardProps = {
  icon: IoniconName;
  label: string;
  value: string;
  delta?: string;
};

export const StatCard = ({ icon, label, value, delta }: StatCardProps) => (
  <View className="flex-1 rounded-2xl border border-[#E9E2F0] bg-white px-3.5 py-4">
    <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#F0E6FA]">
      <Ionicons name={icon} size={17} color="#5A189A" />
    </View>

    <Text className="mt-3 text-[20px] font-JakartaExtraBold text-[#21152F]">
      {value}
    </Text>

    <View className="mt-0.5 flex-row items-center gap-1.5">
      <Text className="text-[11.5px] font-Jakarta text-[#746A7E]">{label}</Text>
      {!!delta && (
        <Text className="text-[11px] font-JakartaBold text-[#9D4EDD]">
          {delta}
        </Text>
      )}
    </View>
  </View>
);

type EmptyStateProps = {
  icon?: IoniconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const EmptyState = ({
  icon = "car-outline",
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) => (
  <View className="items-center px-8 py-14">
    <View className="h-20 w-20 items-center justify-center rounded-3xl bg-[#F0E6FA]">
      <Ionicons name={icon} size={34} color="#5A189A" />
    </View>

    <Text className="mt-5 text-center text-[17px] font-JakartaExtraBold text-[#21152F]">
      {title}
    </Text>
    <Text className="mt-2 text-center text-[13.5px] font-Jakarta leading-5 text-[#746A7E]">
      {message}
    </Text>

    {!!actionLabel && !!onAction && (
      <Pressable
        onPress={onAction}
        className="mt-6 rounded-2xl bg-[#5A189A] px-6 py-3.5 active:opacity-80"
      >
        <Text className="text-[14px] font-JakartaBold text-white">
          {actionLabel}
        </Text>
      </Pressable>
    )}
  </View>
);

type BadgeProps = {
  label: string;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  icon?: IoniconName;
};

const TONES = {
  brand:   { bg: "bg-[#F0E6FA]", text: "text-[#5A189A]", icon: "#5A189A" },
  success: { bg: "bg-[#F0E6FA]", text: "text-[#5A189A]", icon: "#9D4EDD" },
  warning: { bg: "bg-[#FFF6E5]", text: "text-[#D99A1B]", icon: "#D99A1B" },
  danger:  { bg: "bg-[#FEF3F3]", text: "text-[#B02A2A]", icon: "#E0575B" },
  neutral: { bg: "bg-[#F7F4FB]", text: "text-[#746A7E]", icon: "#746A7E" },
};

export const Badge = ({ label, tone = "brand", icon }: BadgeProps) => {
  const t = TONES[tone];
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${t.bg}`}>
      {!!icon && <Ionicons name={icon} size={12} color={t.icon} />}
      <Text className={`text-[11px] font-JakartaBold ${t.text}`}>{label}</Text>
    </View>
  );
};
