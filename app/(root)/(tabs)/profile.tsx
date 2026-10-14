import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { SectionCard } from "@/components/Cards";
import { fetchAPI } from "@/lib/fetch";
import {
  AutomatedDocStatus,
  DOC_LABELS,
  DocKind,
  REQUIRED_DRIVER_DOCUMENTS,
  captureImage,
  getSignedUrl,
  pickFromLibrary,
  uploadAvatar,
  uploadDocument,
  verifyDocumentAutomated,
} from "@/lib/verification";

const SUPPORT_EMAIL = "drivers@lyftcarpool.co.za";
const SUPPORT_WHATSAPP = "27110000000";

type IoniconName = keyof typeof Ionicons.glyphMap;
type ProfileDocStatus = AutomatedDocStatus | "unverified";

type SavedDocument = {
  path?: string;
  status?: AutomatedDocStatus;
  expires_on?: string | null;
  failure_reason?: string | null;
};

type DriverVehicle = {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  colour?: string | null;
  plate?: string | null;
  seats?: number | null;
};

type DriverProfileData = {
  driver_documents?: Partial<Record<DocKind, SavedDocument>>;
  vehicle_photo_url?: string | null;
  vehicle?: DriverVehicle | null;
  amenities?: Record<string, boolean>;
  bank?: { account_number?: string | null };
  emergency_contact?: string | null;
  [key: string]: unknown;
};

type DriverProfile = {
  name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  profile_image_url?: string | null;
  rating?: number | null;
  total_trips?: number | null;
  car_seats?: number | null;
  verified?: boolean | null;
  driver_verification_status?: string | null;
  driver_rejection_reason?: string | null;
  id_verified?: boolean | null;
  passport_verified?: boolean | null;
  licence_verified?: boolean | null;
  id_number?: string | null;
  passport_number?: string | null;
  date_of_birth?: string | null;
  profile_data?: DriverProfileData;
  vehicle?: DriverVehicle | null;
};

const DOCUMENT_ICONS: Record<DocKind, IoniconName> = {
  id_front: "card-outline",
  id_back: "card-outline",
  selfie: "person-circle-outline",
  licence: "car-outline",
  pdp: "ribbon-outline",
  vehicle_registration: "disc-outline",
  roadworthy: "construct-outline",
  insurance: "shield-outline",
  vehicle_photo: "image-outline",
};

// Driver amenities
const AMENITY_ITEMS = [
  { key: "ac", label: "Air Conditioning", icon: "snow-outline" },
  { key: "luggage", label: "Boot Space", icon: "briefcase-outline" },
  { key: "music", label: "Music Allowed", icon: "musical-notes-outline" },
  { key: "no_smoking", label: "Non-Smoking", icon: "flame-outline" },
  { key: "pets", label: "Pet Friendly", icon: "paw-outline" },
];

const STATUS_PILL_CONFIG: Record<
  ProfileDocStatus,
  { bg: string; text: string; color: string; icon: IoniconName; label: string }
> = {
  verified: {
    bg: "bg-[#F0E6FA]",
    text: "text-[#5A189A]",
    color: "#5A189A",
    icon: "checkmark-circle",
    label: "Approved",
  },
  pending_review: {
    bg: "bg-[#FFF6E5]",
    text: "text-[#D99A1B]",
    color: "#D99A1B",
    icon: "time-outline",
    label: "Pending Review",
  },
  expired: {
    bg: "bg-[#FEF3F3]",
    text: "text-[#B02A2A]",
    color: "#B02A2A",
    icon: "alert-circle",
    label: "Expired",
  },
  mismatch: {
    bg: "bg-[#FFF1F2]",
    text: "text-[#E11D48]",
    color: "#E11D48",
    icon: "warning-outline",
    label: "Rejected",
  },
  failed: {
    bg: "bg-[#FEF3F3]",
    text: "text-[#B02A2A]",
    color: "#B02A2A",
    icon: "close-circle",
    label: "Rejected",
  },
  unverified: {
    bg: "bg-[#F7F4FB]",
    text: "text-[#746A7E]",
    color: "#746A7E",
    icon: "add-circle-outline",
    label: "Upload Required",
  },
};

function getDocumentStatus(docEntry?: SavedDocument): ProfileDocStatus {
  if (!docEntry?.path) return "unverified";
  return docEntry.status && docEntry.status in STATUS_PILL_CONFIG
    ? docEntry.status
    : "pending_review";
}

function ProfileMetricCard({
  icon,
  value,
  label,
}: {
  icon: IoniconName;
  value: string;
  label: string;
}) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-[#E9E2F0] bg-white px-3 py-3.5">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-[#F0E6FA]">
        <Ionicons name={icon} size={17} color="#5A189A" />
      </View>
      <Text className="mt-2.5 text-[19px] font-JakartaExtraBold text-[#21152F]">
        {value}
      </Text>
      <Text className="mt-0.5 text-[11px] font-JakartaMedium leading-4 text-[#746A7E]">
        {label}
      </Text>
    </View>
  );
}

function ProfileDocRow({
  kind,
  docEntry,
  isBusy,
  onManage,
}: {
  kind: DocKind;
  docEntry?: SavedDocument;
  isBusy: boolean;
  onManage: () => void;
}) {
  const hasDocument = Boolean(docEntry?.path);
  const status: ProfileDocStatus = hasDocument
    ? docEntry?.status ?? "pending_review"
    : "unverified";
  const pill = STATUS_PILL_CONFIG[status];
  const required = REQUIRED_DRIVER_DOCUMENTS.includes(kind);
  const label = DOC_LABELS[kind];

  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-[#E9E2F0] bg-white p-4 shadow-sm">
      <View className="flex-row items-start">
        <View
          className={`mr-3 h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            hasDocument ? "bg-[#F0E6FA]" : "bg-[#F7F4FB]"
          }`}
        >
          <Ionicons name={DOCUMENT_ICONS[kind]} size={20} color={hasDocument ? "#5A189A" : "#746A7E"} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-JakartaBold leading-5 text-[#21152F]">
            {label.title}
            {!required ? " (optional)" : ""}
          </Text>
          <View className={`mt-1 self-start flex-row items-center gap-1 rounded-full px-2 py-1 ${pill.bg}`}>
            <Ionicons name={pill.icon} size={12} color={pill.color} />
            <Text className={`text-[10px] font-JakartaBold ${pill.text}`}>
              {pill.label}
            </Text>
          </View>
          <Text className="mt-1 text-[12px] font-Jakarta leading-[18px] text-[#746A7E]">
            {label.help}
          </Text>
        </View>
      </View>

      {docEntry?.expires_on ? (
        <Text className="mt-2 text-[11.5px] font-JakartaMedium text-[#746A7E]">
          Expires: {docEntry.expires_on}
        </Text>
      ) : null}
      {docEntry?.failure_reason ? (
        <Text className="mt-2 rounded-xl bg-[#FEF3F3] px-3 py-2 text-[12px] font-JakartaMedium leading-[18px] text-[#B02A2A]">
          {docEntry.failure_reason}
        </Text>
      ) : null}

      <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-[#F0E6FA] pt-3">
        <Text className="min-w-0 flex-1 text-[11px] font-Jakarta text-[#746A7E]">
          {hasDocument ? "Document on file" : required ? "Required for approval" : "Optional document"}
        </Text>
        <TouchableOpacity
          onPress={onManage}
          disabled={isBusy}
          accessibilityRole="button"
          className="min-h-10 shrink-0 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#5A189A] px-3.5 py-2 active:opacity-70"
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name={hasDocument ? "create-outline" : "cloud-upload-outline"} size={15} color="#FFFFFF" />
              <Text className="text-[11.5px] font-JakartaBold text-white">
                {hasDocument ? "Manage document" : "Upload document"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VerificationChecklistRow({
  title,
  status,
}: {
  title: string;
  status: ProfileDocStatus;
}) {
  const pill = STATUS_PILL_CONFIG[status];

  return (
    <View className="flex-row items-center justify-between gap-2 border-b border-[#F0E6FA] py-3 last:border-b-0">
      <Text className="min-w-0 flex-1 text-[13px] font-JakartaSemiBold leading-5 text-[#21152F]">
        {title}
      </Text>
      <View className={`shrink-0 flex-row items-center gap-1 rounded-full px-2.5 py-1 ${pill.bg}`}>
        <Ionicons name={pill.icon} size={12} color={pill.color} />
        <Text className={`text-[10.5px] font-JakartaBold ${pill.text}`}>
          {pill.label}
        </Text>
      </View>
    </View>
  );
}

const Profile = () => {
  const { user } = useUser();
  const { getToken, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingDocKind, setSavingDocKind] = useState<string | null>(null);

  // Modals & Sheets
  const [activePhotoType, setActivePhotoType] = useState<"avatar" | "vehicle" | null>(null);
  const [activeDocKind, setActiveDocKind] = useState<DocKind | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchAPI(
        `/(api)/profile?clerkId=${encodeURIComponent(userId)}`,
      );
      setProfile(result?.data ?? null);
    } catch (error) {
      console.warn("Could not load profile", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Derived records
  const vehicle = profile?.vehicle ?? {};
  const driverStatus = profile?.driver_verification_status ?? "not_submitted";
  const approved = driverStatus === "approved";

  // Documents uploaded
  const savedDocs = profile?.profile_data?.driver_documents ?? {};

  const vehiclePhotoUrl =
    profile?.profile_data?.vehicle_photo_url ??
    savedDocs?.vehicle_photo?.path ??
    null;

  const amenities: Record<string, boolean> =
    profile?.profile_data?.amenities ?? {
      ac: true,
      luggage: true,
      music: true,
      no_smoking: true,
      pets: false,
    };

  const identityVerified =
    profile?.id_verified === true || profile?.passport_verified === true;
  const licenceVerified = profile?.licence_verified === true;
  const verificationItems = [
    {
      title: "Identity document (ID or passport)",
      status: identityVerified ? "verified" : "unverified",
    },
    {
      title: "Driving licence (NATIS)",
      status: licenceVerified ? "verified" : "unverified",
    },
    ...REQUIRED_DRIVER_DOCUMENTS.map((kind) => ({
      title: DOC_LABELS[kind].title,
      status: getDocumentStatus(savedDocs[kind]),
    })),
  ] satisfies { title: string; status: ProfileDocStatus }[];
  const verifiedRequirements = verificationItems.filter(
    (item) => item.status === "verified",
  ).length;
  const verificationProgress = Math.round(
    (verifiedRequirements / verificationItems.length) * 100,
  );
  const displayName =
    profile?.name?.trim() ||
    profile?.full_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user?.fullName?.trim() ||
    "Name not added";
  const phoneNumber =
    profile?.phone_number?.trim() ||
    user?.primaryPhoneNumber?.phoneNumber ||
    "No phone added";
  const emailAddress =
    profile?.email?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    "No email added";
  const ratingValue =
    typeof profile?.rating === "number" && Number.isFinite(profile.rating)
      ? profile.rating.toFixed(1)
      : "—";
  const tripsValue =
    typeof profile?.total_trips === "number" && Number.isFinite(profile.total_trips)
      ? String(profile.total_trips)
      : "—";
  const seatsValue =
    typeof (vehicle?.seats ?? profile?.car_seats) === "number"
      ? `${vehicle?.seats ?? profile?.car_seats} seats`
      : "Not set";

  // Avatar / Car photo upload
  const handlePhotoUpload = async (target: "avatar" | "vehicle", source: "camera" | "library") => {
    setActivePhotoType(null);
    if (!user?.id) return;

    const fn = source === "camera"
      ? () => captureImage(target === "avatar")
      : pickFromLibrary;

    try {
      setSavingPhoto(true);
      const image = await fn();
      if (!image) return;

      const token = await getToken();
      if (!token) throw new Error("Your sign-in has expired. Sign in again to upload files.");
      const url = await uploadAvatar(user.id, image, token);

      if (target === "avatar") {
        await fetchAPI("/(api)/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clerkId: user.id, profile_image_url: url }),
        });
        Alert.alert("Success", "Profile photo updated successfully!");
      } else {
        const currentData = profile?.profile_data ?? {};
        await fetchAPI("/(api)/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clerkId: user.id,
            profile_data: {
              ...currentData,
              vehicle_photo_url: url,
            },
          }),
        });
        Alert.alert("Success", "Vehicle photo updated successfully!");
      }

      await load();
    } catch (error: any) {
      Alert.alert("Upload error", error?.message ?? "Please try again.");
    } finally {
      setSavingPhoto(false);
    }
  };

  // Upload Permit or Vehicle Document with automated validation
  const handleDocumentUpload = async (kind: DocKind, source: "camera" | "library") => {
    setActiveDocKind(null);
    if (!user?.id) return;

    const fn = source === "camera" ? () => captureImage(false) : pickFromLibrary;

    try {
      setSavingDocKind(kind);
      const image = await fn();
      if (!image) return;

      // 1. Upload to secure private storage
      const token = await getToken();
      if (!token) throw new Error("Your sign-in has expired. Sign in again to upload files.");
      const path = await uploadDocument(user.id, kind, image, token);

      // 2. Automated verification & registry check
      const result = await verifyDocumentAutomated({
        clerkId: user.id,
        docKind: kind,
        filePath: path,
      });

      // 3. User feedback
      if (result?.status === "verified") {
        Alert.alert(
          "Automated Verification Passed",
          `${DOC_LABELS[kind]?.title ?? "Document"} has been verified against official records.`,
        );
      } else if (result?.status === "expired") {
        Alert.alert(
          "Document Expired",
          result?.failureReason ?? "This document is expired. Please upload a valid document.",
        );
      } else if (result?.status === "mismatch") {
        Alert.alert(
          "Information Mismatch",
          result?.failureReason ?? "The details on this document do not match your registered profile.",
        );
      } else {
        Alert.alert(
          "Document Uploaded",
          `${DOC_LABELS[kind]?.title ?? "Document"} submitted for compliance review.`,
        );
      }

      await load();
    } catch (err: any) {
      Alert.alert("Upload error", err?.message ?? "Failed to upload document.");
    } finally {
      setSavingDocKind(null);
    }
  };

  // View existing document using short-lived signed URL (Least Privilege)
  const handleViewSavedDoc = async (kind: DocKind) => {
    setActiveDocKind(null);
    const docPath = savedDocs?.[kind]?.path;
    if (!docPath) {
      Alert.alert("No Document", "Please upload this document first.");
      return;
    }

    try {
      const token = await getToken();
      if (!token) throw new Error("Your sign-in has expired. Sign in again to view files.");
      const url = await getSignedUrl(docPath, token, 60);
      if (url) {
        setPreviewImageUri(url);
      } else {
        Alert.alert("Document", "Could not generate secure view link.");
      }
    } catch {
      Alert.alert("Document", "Could not load document preview.");
    }
  };

  // Toggle Amenity
  const handleToggleAmenity = async (key: string) => {
    if (!user?.id) return;
    const nextAmenities = { ...amenities, [key]: !amenities[key] };

    setProfile((prev: any) => ({
      ...prev,
      profile_data: {
        ...(prev?.profile_data ?? {}),
        amenities: nextAmenities,
      },
    }));

    try {
      const currentData = profile?.profile_data ?? {};
      await fetchAPI("/(api)/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkId: user.id,
          profile_data: {
            ...currentData,
            amenities: nextAmenities,
          },
        }),
      });
    } catch (err) {
      console.warn("Could not save amenity", err);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out of your driver account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F4FB]">
      <ScrollView
        className="px-4 sm:px-6"
        contentContainerStyle={{
          paddingBottom: Math.max(128, insets.bottom + 112),
          paddingTop: 4,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5A189A" />
        }
      >
        <View className="mb-4 flex-row items-start justify-between pt-2">
          <View className="min-w-0 flex-1">
            <Text className="text-[25px] font-JakartaExtraBold leading-8 tracking-tight text-[#21152F]">
              Driver Profile
            </Text>
            <Text className="mt-0.5 text-[12.5px] font-JakartaMedium leading-[18px] text-[#746A7E]">
              Account, vehicle and transport compliance
            </Text>
          </View>
        </View>

        {loading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color="#5A189A" />
            <Text className="mt-3 text-[13px] font-JakartaMedium text-[#746A7E]">
              Loading driver profile…
            </Text>
          </View>
        ) : (
          <>
            <View className="mb-5 items-center rounded-[32px] border border-[#E9E2F0] bg-white px-5 py-7 shadow-sm">
              <View className="relative mb-5">
                <Pressable
                  onPress={() =>
                    profile?.profile_image_url
                      ? setPreviewImageUri(profile.profile_image_url)
                      : setActivePhotoType("avatar")
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    profile?.profile_image_url ? "View profile photo" : "Add profile photo"
                  }
                  className="active:opacity-90"
                >
                  {profile?.profile_image_url ? (
                    <Image
                      source={{ uri: profile.profile_image_url }}
                      accessibilityLabel="Driver profile photo"
                      className="h-28 w-28 rounded-full border-4 border-[#F0E6FA] bg-[#F0E6FA]"
                    />
                  ) : (
                    <View className="h-28 w-28 items-center justify-center rounded-full border-4 border-[#F0E6FA] bg-[#6C3BFF]">
                      <Ionicons name="person" size={56} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
                <TouchableOpacity
                  onPress={() => setActivePhotoType("avatar")}
                  disabled={savingPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  className="absolute bottom-0 right-0 h-10 w-10 items-center justify-center rounded-full border-4 border-white bg-[#9D4EDD] shadow-sm"
                >
                  {savingPhoto ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="camera" size={17} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>

              <View className="w-full items-center">
                <View className="flex-row items-center justify-center gap-1.5">
                  <Text className="shrink text-center text-[21px] font-JakartaExtraBold leading-7 text-[#21152F]">
                    {displayName}
                  </Text>
                  {approved && (
                    <Ionicons name="checkmark-circle" size={18} color="#5A189A" />
                  )}
                </View>
                <Text className="mt-1 text-center text-[14px] font-JakartaMedium leading-5 text-[#746A7E]">
                  {emailAddress}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/(root)/edit-profile",
                      params: { field: "phone_number", label: "Phone Number" },
                    })
                  }
                  accessibilityRole="button"
                  className="mt-1 items-center"
                >
                  <Text className="text-center text-[13px] font-JakartaMedium leading-5 text-[#746A7E]">
                    {phoneNumber}
                  </Text>
                </TouchableOpacity>
                <View
                  className={`mt-3 flex-row items-center gap-1.5 rounded-full px-3 py-1 ${
                    approved
                      ? "bg-[#F0E6FA]"
                      : driverStatus === "pending"
                        ? "bg-[#FFF6E5]"
                        : driverStatus === "rejected"
                          ? "bg-[#FEF3F3]"
                          : "bg-[#F7F4FB]"
                  }`}
                >
                  <Ionicons
                    name={
                      approved
                        ? "shield-checkmark"
                        : driverStatus === "pending"
                          ? "time-outline"
                          : "alert-circle"
                    }
                    size={13}
                    color={
                      approved
                        ? "#5A189A"
                        : driverStatus === "pending"
                          ? "#D99A1B"
                          : driverStatus === "rejected"
                            ? "#B02A2A"
                            : "#746A7E"
                    }
                  />
                  <Text
                    className={`text-[11.5px] font-JakartaBold ${
                      approved
                        ? "text-[#5A189A]"
                        : driverStatus === "pending"
                          ? "text-[#D99A1B]"
                          : driverStatus === "rejected"
                            ? "text-[#B02A2A]"
                            : "text-[#746A7E]"
                    }`}
                  >
                    {approved
                      ? "Approved Partner"
                      : driverStatus === "pending"
                        ? "Approval pending"
                        : driverStatus === "rejected"
                          ? "Approval rejected"
                          : "Approval required"}
                  </Text>
                </View>
              </View>
            </View>

            <View className="mb-6 flex-row gap-2.5">
              <ProfileMetricCard
                icon="star-outline"
                label="Rating"
                value={ratingValue}
              />
              <ProfileMetricCard
                icon="car-sport-outline"
                label="Completed trips"
                value={tripsValue}
              />
              <ProfileMetricCard
                icon="shield-checkmark-outline"
                label="Verification progress"
                value={`${verificationProgress}%`}
              />
            </View>

            <View className="mb-7 rounded-3xl border border-[#E9E2F0] bg-white p-5 shadow-sm">
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-[17px] font-JakartaExtraBold leading-6 text-[#21152F]">
                    Verification progress
                  </Text>
                  <Text className="mt-1 text-[12px] font-Jakarta leading-[18px] text-[#746A7E]">
                    {verifiedRequirements} of {verificationItems.length} required checks verified
                  </Text>
                </View>
                <Text className="shrink-0 text-[18px] font-JakartaExtraBold text-[#5A189A]">
                  {verificationProgress}%
                </Text>
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: verificationProgress }}
                className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#F0E6FA]"
              >
                <View
                  className="h-full rounded-full bg-[#5A189A]"
                  style={{ width: `${verificationProgress}%` }}
                />
              </View>
              <View className="mt-2">
                {verificationItems.slice(0, 2).map((item) => (
                  <VerificationChecklistRow
                    key={item.title}
                    title={item.title}
                    status={item.status}
                  />
                ))}
              </View>
              <View className="mt-4">
                <Text className="text-[15px] font-JakartaExtraBold leading-5 text-[#21152F]">
                  Permits & vehicle documents
                </Text>
                <Text className="mt-0.5 text-[12px] font-JakartaMedium leading-[18px] text-[#746A7E]">
                  Document review status is separate from partner approval.
                </Text>
              </View>
              <View className="mt-3">
                {[...REQUIRED_DRIVER_DOCUMENTS, "roadworthy" as const].map((kind) => (
                  <ProfileDocRow
                    key={kind}
                    kind={kind}
                    docEntry={savedDocs[kind]}
                    isBusy={savingDocKind === kind}
                    onManage={() => setActiveDocKind(kind)}
                  />
                ))}
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(root)/verification")}
                accessibilityRole="button"
                className="mt-1 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#F0E6FA] px-4 py-3 active:opacity-70"
              >
                <Text className="text-[13px] font-JakartaBold text-[#5A189A]">
                  Continue verification
                </Text>
                <Ionicons name="arrow-forward" size={15} color="#5A189A" />
              </TouchableOpacity>
            </View>

            <View className="mb-3 flex-row items-start justify-between gap-3">
              <Text className="min-w-0 flex-1 text-[17px] font-JakartaExtraBold leading-6 text-[#21152F]">
                Vehicle information
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(root)/vehicle-details")}
                accessibilityRole="button"
                className="flex-row items-center gap-1 active:opacity-70"
              >
                <Text className="text-[12.5px] font-JakartaBold text-[#5A189A]">
                  Edit Details
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#5A189A" />
              </TouchableOpacity>
            </View>

            <View className="mb-5 rounded-3xl border border-[#E9E2F0] bg-white p-4 shadow-sm">
              <View className="flex-row items-center gap-3">
                <View className="relative h-[82px] w-[104px] shrink-0 overflow-hidden rounded-2xl bg-[#F0E6FA]">
                  {vehiclePhotoUrl ? (
                    <Image
                      source={{ uri: vehiclePhotoUrl }}
                      accessibilityLabel="Vehicle photo"
                      className="h-full w-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-full w-full items-center justify-center border-2 border-dashed border-[#C77DFF] bg-[#F7F4FB]">
                      <Ionicons name="car-outline" size={26} color="#5A189A" />
                      <Text className="mt-1 text-[10.5px] font-JakartaBold text-[#746A7E]">
                        No photo
                      </Text>
                    </View>
                  )}

                  {vehiclePhotoUrl && (
                    <Pressable
                      onPress={() => setPreviewImageUri(vehiclePhotoUrl)}
                      accessibilityRole="button"
                      accessibilityLabel="Preview vehicle photo"
                      className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1.5"
                    >
                      <Ionicons name="expand" size={12} color="#fff" />
                    </Pressable>
                  )}
                </View>

                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-JakartaExtraBold leading-5 text-[#21152F]">
                    {[vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle details not added"}
                  </Text>
                  <Text className="mt-1 text-[12px] font-JakartaMedium leading-[18px] text-[#746A7E]">
                    {[vehicle?.colour, vehicle?.year, seatsValue !== "Not set" ? seatsValue : null]
                      .filter(Boolean)
                      .join(" · ") || "Colour, year and seating not added"}
                  </Text>

                  <Text className="mt-2 text-[11.5px] font-JakartaBold text-[#21152F]">
                    {vehicle?.plate ? vehicle.plate.toUpperCase() : "Registration not added"}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-between gap-3 border-t border-[#F0E6FA] pt-3.5">
                <Text className="min-w-0 flex-1 text-[12px] font-Jakarta leading-[18px] text-[#746A7E]">
                  {vehiclePhotoUrl ? "Vehicle photo saved" : "A clear photo helps passengers find your car."}
                </Text>
                <TouchableOpacity
                  onPress={() => setActivePhotoType("vehicle")}
                  accessibilityRole="button"
                  className="min-h-10 shrink-0 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#F0E6FA] px-3 py-2 active:opacity-70"
                >
                  <Ionicons name="camera" size={13} color="#5A189A" />
                  <Text className="text-[11px] font-JakartaBold text-[#5A189A]">
                    {vehiclePhotoUrl ? "Change photo" : "Add photo"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* RIDE AMENITIES */}
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[17px] font-JakartaExtraBold text-[#21152F]">
                Ride Amenities
              </Text>
              <Text className="text-[11.5px] font-JakartaMedium text-[#A69BAF]">
                Tap to toggle
              </Text>
            </View>

            <View className="mb-7 flex-row flex-wrap gap-2.5 rounded-3xl border border-[#E9E2F0] bg-white p-4 shadow-sm">
              {AMENITY_ITEMS.map((item) => {
                const active = Boolean(amenities[item.key]);
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => handleToggleAmenity(item.key)}
                    activeOpacity={0.7}
                    className={`flex-row items-center gap-2 rounded-2xl border px-3.5 py-2.5 ${
                      active
                        ? "border-[#5A189A] bg-[#F0E6FA]"
                        : "border-[#E9E2F0] bg-[#F7F4FB]"
                    }`}
                  >
                    <Ionicons
                      name={item.icon as any}
                      size={15}
                      color={active ? "#5A189A" : "#746A7E"}
                    />
                    <Text
                      className={`text-[12.5px] font-JakartaBold ${
                        active ? "text-[#5A189A]" : "text-[#746A7E]"
                      }`}
                    >
                      {item.label}
                    </Text>
                    <Ionicons
                      name={active ? "checkmark" : "add"}
                      size={13}
                      color={active ? "#5A189A" : "#A69BAF"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Driving, earnings & payouts
            </Text>
            <View className="mb-7">
              <SectionCard
                title="Offer a Trip"
                value="Publish available seats for passengers"
                icon="add-circle-outline"
                onPress={() => router.push("/(root)/create-trip")}
              />
              <SectionCard
                title="Earnings & Payouts"
                value="Balance, payouts and transaction history"
                icon="wallet-outline"
                onPress={() => router.push("/(root)/(tabs)/earnings")}
              />
              <SectionCard
                title="Payout Bank Account"
                value={
                  profile?.profile_data?.bank?.account_number
                    ? `Paid to •••• ${profile.profile_data.bank.account_number.slice(-4)}`
                    : "Add South African bank account for payouts"
                }
                icon="business-outline"
                onPress={() => router.push("/(root)/bank-details")}
              />
            </View>

            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Driver support
            </Text>
            <View className="mb-7">
              <SectionCard
                title="Help & Support"
                value="Browse driver help topics or chat with AI support"
                icon="help-circle-outline"
                onPress={() => router.push("/(root)/help-support")}
              />
              <SectionCard
                title="WhatsApp Driver Line"
                value="Direct support via WhatsApp"
                icon="logo-whatsapp"
                onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}
              />
              <SectionCard
                title="Email Us"
                value={SUPPORT_EMAIL}
                icon="mail-outline"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              />
            </View>

            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Account & personal information
            </Text>
            <View className="mb-7">
              <SectionCard
                title="Full Name"
                value={displayName}
                icon="person-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "name", label: "Full Name" },
                  })
                }
              />
              <SectionCard
                title="Email"
                value={emailAddress}
                icon="mail-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "email", label: "Email" },
                  })
                }
              />
              <SectionCard
                title="Emergency Contact (ICE)"
                value={
                  profile?.profile_data?.emergency_contact?.trim() ||
                  "Not added"
                }
                icon="heart-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "emergency_contact", label: "Emergency Contact" },
                  })
                }
              />
              <SectionCard
                title="Sign Out"
                value="Log out of driver account"
                icon="log-out-outline"
                tone="danger"
                onPress={handleSignOut}
              />
            </View>

            <View className="mb-8 items-center">
              <Text className="text-[12px] font-JakartaBold text-[#A69BAF]">
                Lyft Driver Platform • v1.0.0
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* DOCUMENT ACTION SHEET MODAL */}
      <Modal
        visible={Boolean(activeDocKind)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveDocKind(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/60"
          onPress={() => setActiveDocKind(null)}
        >
          <ScrollView
            className="max-h-[85%] rounded-t-3xl bg-white px-6 pt-5"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center pb-4">
              <View className="h-1.5 w-12 rounded-full bg-[#E9E2F0]" />
            </View>

            <Text className="text-center text-[19px] font-JakartaExtraBold text-[#21152F]">
              {activeDocKind ? DOC_LABELS[activeDocKind].title : "Document"}
            </Text>
            <Text className="mt-1.5 text-center text-[13px] font-Jakarta leading-5 text-[#746A7E]">
              {activeDocKind ? DOC_LABELS[activeDocKind].help : ""}
            </Text>

            <View className="mt-6 gap-3">
              <TouchableOpacity
                onPress={() => activeDocKind && handleDocumentUpload(activeDocKind, "camera")}
                className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-[#5A189A] px-4 py-3 active:opacity-80"
              >
                <Ionicons name="camera" size={20} color="#fff" />
                <Text className="min-w-0 flex-1 text-[15px] font-JakartaBold leading-5 text-white">
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => activeDocKind && handleDocumentUpload(activeDocKind, "library")}
                className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 py-3 active:opacity-70"
              >
                <Ionicons name="images-outline" size={20} color="#5A189A" />
                <Text className="min-w-0 flex-1 text-[15px] font-JakartaBold leading-5 text-[#5A189A]">
                  Choose from Photo Library
                </Text>
              </TouchableOpacity>

              {activeDocKind && Boolean(savedDocs?.[activeDocKind]?.path) && (
                <TouchableOpacity
                  onPress={() => handleViewSavedDoc(activeDocKind)}
                  className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-[#E9E2F0] bg-white px-4 py-3 active:opacity-70"
                >
                  <Ionicons name="eye-outline" size={20} color="#21152F" />
                  <Text className="min-w-0 flex-1 text-[15px] font-JakartaSemiBold leading-5 text-[#21152F]">
                    View Current Document
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => setActiveDocKind(null)}
                className="mt-1 items-center py-2 active:opacity-70"
              >
                <Text className="text-[14px] font-JakartaSemiBold text-[#746A7E]">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* AVATAR / VEHICLE PHOTO MODAL */}
      <Modal
        visible={Boolean(activePhotoType)}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePhotoType(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/60"
          onPress={() => setActivePhotoType(null)}
        >
          <ScrollView
            className="max-h-[85%] rounded-t-3xl bg-white px-6 pt-5"
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 20 }}
            showsVerticalScrollIndicator={false}
          >
            <View className="items-center pb-4">
              <View className="h-1.5 w-12 rounded-full bg-[#E9E2F0]" />
            </View>

            <Text className="text-center text-[19px] font-JakartaExtraBold text-[#21152F]">
              {activePhotoType === "avatar" ? "Profile Photo" : "Vehicle Photo"}
            </Text>
            <Text className="mt-1.5 text-center text-[13px] font-Jakarta leading-5 text-[#746A7E]">
              {activePhotoType === "avatar"
                ? "Passengers verify your face when boarding."
                : "A clear photo helps passengers spot your car at pickup."}
            </Text>

            <View className="mt-6 gap-3">
              <TouchableOpacity
                onPress={() => activePhotoType && handlePhotoUpload(activePhotoType, "camera")}
                className="min-h-12 flex-row items-center gap-3 rounded-2xl bg-[#5A189A] px-4 py-3 active:opacity-80"
              >
                <Ionicons name="camera" size={20} color="#fff" />
                <Text className="min-w-0 flex-1 text-[15px] font-JakartaBold leading-5 text-white">
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => activePhotoType && handlePhotoUpload(activePhotoType, "library")}
                className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 py-3 active:opacity-70"
              >
                <Ionicons name="images-outline" size={20} color="#5A189A" />
                <Text className="min-w-0 flex-1 text-[15px] font-JakartaBold leading-5 text-[#5A189A]">
                  Choose from Photo Library
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActivePhotoType(null)}
                className="mt-2 items-center py-2 active:opacity-70"
              >
                <Text className="text-[14px] font-JakartaSemiBold text-[#746A7E]">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Modal>

      {/* FULLSCREEN PREVIEW MODAL */}
      <Modal
        visible={Boolean(previewImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
      >
        <View className="flex-1 bg-black">
          <SafeAreaView className="flex-1">
            <View className="flex-row items-center justify-between px-6 py-4">
              <Text className="text-[16px] font-JakartaBold text-white">
                Photo Preview
              </Text>
              <TouchableOpacity
                onPress={() => setPreviewImageUri(null)}
                className="h-10 w-10 items-center justify-center rounded-full bg-white/20 active:opacity-70"
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View className="flex-1 items-center justify-center px-4">
              {previewImageUri && (
                <Image
                  source={{ uri: previewImageUri }}
                  className="h-4/5 w-full rounded-2xl"
                  resizeMode="contain"
                />
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default Profile;
