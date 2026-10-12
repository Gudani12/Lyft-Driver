import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SectionCard, StatCard } from "@/components/Cards";
import { brand, ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";
import {
  AutomatedDocStatus,
  DOC_LABELS,
  DocKind,
  PickedImage,
  captureImage,
  getSignedUrl,
  pickFromLibrary,
  uploadAvatar,
  uploadDocument,
  verifyDocumentAutomated,
} from "@/lib/verification";

const SUPPORT_EMAIL = "drivers@lyftcarpool.co.za";
const SUPPORT_WHATSAPP = "27110000000";

// Driver amenities
const AMENITY_ITEMS = [
  { key: "ac", label: "Air Conditioning", icon: "snow-outline" },
  { key: "luggage", label: "Boot Space", icon: "briefcase-outline" },
  { key: "music", label: "Music Allowed", icon: "musical-notes-outline" },
  { key: "no_smoking", label: "Non-Smoking", icon: "flame-outline" },
  { key: "pets", label: "Pet Friendly", icon: "paw-outline" },
];

const STATUS_PILL_CONFIG: Record<
  AutomatedDocStatus | "unverified",
  { bg: string; text: string; icon: any; label: string }
> = {
  verified: {
    bg: "bg-[#F0E6FA]",
    text: "text-[#5A189A]",
    icon: "checkmark-circle",
    label: "Verified",
  },
  pending_review: {
    bg: "bg-[#FFF6E5]",
    text: "text-[#D99A1B]",
    icon: "time-outline",
    label: "In Review",
  },
  expired: {
    bg: "bg-[#FEF3F3]",
    text: "text-[#B02A2A]",
    icon: "alert-circle",
    label: "Expired",
  },
  mismatch: {
    bg: "bg-[#FFF1F2]",
    text: "text-[#E11D48]",
    icon: "warning-outline",
    label: "Mismatch",
  },
  failed: {
    bg: "bg-[#FEF3F3]",
    text: "text-[#B02A2A]",
    icon: "close-circle",
    label: "Failed",
  },
  unverified: {
    bg: "bg-[#F7F4FB]",
    text: "text-[#746A7E]",
    icon: "add-circle-outline",
    label: "Upload Required",
  },
};

const Profile = () => {
  const { user } = useUser();
  const { getToken, signOut } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingDocKind, setSavingDocKind] = useState<string | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);

  // Modals & Sheets
  const [activePhotoType, setActivePhotoType] = useState<"avatar" | "vehicle" | null>(null);
  const [activeDocKind, setActiveDocKind] = useState<DocKind | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const result = await fetchAPI(
        `/(api)/profile?clerkId=${encodeURIComponent(user.id)}`,
      );
      setProfile(result?.data ?? null);
    } catch (error) {
      console.warn("Could not load profile", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

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
  const approved = driverStatus === "approved" || profile?.verified === true;
  const isOnline = Boolean(profile?.is_online);

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

  // Toggle Driver Availability
  const handleToggleOnline = async () => {
    if (!user?.id) return;

    if (!approved && !isOnline) {
      Alert.alert(
        "Verification Required",
        "Your driver documents must be approved before you can go online to accept ride requests.",
        [
          { text: "View Verification", onPress: () => router.push("/(root)/verification") },
          { text: "Dismiss", style: "cancel" },
        ],
      );
      return;
    }

    const nextState = !isOnline;
    setTogglingOnline(true);
    try {
      await fetchAPI("/(api)/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkId: user.id, is_online: nextState }),
      });
      setProfile((prev: any) => (prev ? { ...prev, is_online: nextState } : prev));
    } catch (error: any) {
      Alert.alert("Status error", error?.message ?? "Could not update online status.");
    } finally {
      setTogglingOnline(false);
    }
  };

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
    } catch (err) {
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

  // Spacious Document Row Component
  const ProfileDocRow = ({ kind, title, subtitle, icon }: { kind: DocKind; title: string; subtitle: string; icon: any }) => {
    const docEntry = savedDocs?.[kind];
    const isUploaded = Boolean(docEntry?.path);
    const docStatus: AutomatedDocStatus | "unverified" =
      isUploaded ? docEntry?.status ?? "pending_review" : "unverified";
    const pill = STATUS_PILL_CONFIG[docStatus];
    const isBusy = savingDocKind === kind;

    return (
      <View className="mb-3.5 overflow-hidden rounded-2xl border border-[#E9E2F0] bg-white p-4 shadow-sm">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3.5 pr-2">
            <View
              className={`h-11 w-11 items-center justify-center rounded-xl ${
                isUploaded ? "bg-[#F0E6FA]" : "bg-[#F7F4FB]"
              }`}
            >
              <Ionicons
                name={icon}
                size={22}
                color={isUploaded ? "#5A189A" : "#746A7E"}
              />
            </View>
            <View className="flex-1">
              <Text className="text-[14.5px] font-JakartaBold text-[#21152F]">
                {title}
              </Text>
              <Text className="mt-0.5 text-[11.5px] font-Jakarta text-[#746A7E]" numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>

          <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${pill.bg}`}>
            <Ionicons name={pill.icon} size={12} color={pill.text.replace("text-", "").replace("[", "").replace("]", "")} />
            <Text className={`text-[11px] font-JakartaBold ${pill.text}`}>
              {pill.label}
            </Text>
          </View>
        </View>

        <View className="mt-3.5 flex-row items-center justify-between border-t border-[#F0E6FA] pt-3">
          <Text className="text-[11px] font-Jakarta text-[#746A7E]">
            {isUploaded ? "Document on file" : "Legal transport requirement"}
          </Text>

          <TouchableOpacity
            onPress={() => setActiveDocKind(kind)}
            disabled={isBusy}
            activeOpacity={0.7}
            className="flex-row items-center gap-1 rounded-xl bg-[#5A189A] px-3.5 py-2"
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={isUploaded ? "sync-outline" : "add"} size={13} color="#fff" />
                <Text className="text-[11.5px] font-JakartaBold text-white">
                  {isUploaded ? "Update / View" : "Upload"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#F7F4FB]">
      <ScrollView
        className="px-6"
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 6 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5A189A" />
        }
      >
        {/* Top Header with Generous Padding */}
        <View className="mb-5 flex-row items-center justify-between pt-3">
          <View>
            <Text className="text-[25px] font-JakartaExtraBold tracking-tight text-[#21152F]">
              Driver Profile
            </Text>
            <Text className="mt-0.5 text-[12.5px] font-JakartaMedium text-[#746A7E]">
              Account credentials, vehicle & transport compliance
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/(root)/edit-profile",
                params: { field: "name", label: "Full Name" },
              })
            }
            activeOpacity={0.7}
            className="h-11 w-11 items-center justify-center rounded-2xl border border-[#E9E2F0] bg-white shadow-sm"
          >
            <Ionicons name="pencil-outline" size={18} color="#5A189A" />
          </TouchableOpacity>
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
            {/* HERO EXECUTIVE CARD (Spacious, Clean & Breathable) */}
            <View className="mb-6 rounded-3xl border border-[#E9E2F0] bg-white p-6 shadow-sm">
              {/* Driver Identity Row: Avatar + Details */}
              <View className="flex-row items-center gap-4">
                {/* Avatar with Camera Overlay */}
                <Pressable
                  onPress={() => setActivePhotoType("avatar")}
                  className="relative active:opacity-90"
                >
                  {profile?.profile_image_url ? (
                    <Image
                      source={{ uri: profile.profile_image_url }}
                      className="h-20 w-20 rounded-full border-2 border-[#5A189A]/20 bg-[#F0E6FA]"
                    />
                  ) : (
                    <View className="h-20 w-20 items-center justify-center rounded-full border-2 border-[#5A189A]/20 bg-[#F0E6FA]">
                      <Ionicons name="person" size={36} color="#5A189A" />
                    </View>
                  )}
                  <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#5A189A] shadow-sm">
                    {savingPhoto ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={13} color="#fff" />
                    )}
                  </View>
                </Pressable>

                {/* Name, Contact & Verification Pill */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-[20px] font-JakartaExtraBold text-[#21152F]" numberOfLines={1}>
                      {profile?.name ?? user?.fullName ?? "Driver"}
                    </Text>
                    {approved && (
                      <Ionicons name="checkmark-circle" size={18} color="#5A189A" />
                    )}
                  </View>

                  <Text className="mt-0.5 text-[13px] font-JakartaMedium text-[#746A7E]">
                    {profile?.phone_number ?? user?.primaryPhoneNumber?.phoneNumber ?? "No phone added"}
                  </Text>

                  {/* Compliance Pill */}
                  <View className="mt-2 flex-row items-center gap-2">
                    <View
                      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${
                        approved
                          ? "bg-[#F0E6FA]"
                          : driverStatus === "pending"
                            ? "bg-[#FFF6E5]"
                            : "bg-[#FEF3F3]"
                      }`}
                    >
                      <Ionicons
                        name={approved ? "shield-checkmark" : driverStatus === "pending" ? "time-outline" : "alert-circle"}
                        size={13}
                        color={approved ? "#5A189A" : driverStatus === "pending" ? "#D99A1B" : "#B02A2A"}
                      />
                      <Text
                        className={`text-[11.5px] font-JakartaBold ${
                          approved
                            ? "text-[#5A189A]"
                            : driverStatus === "pending"
                              ? "text-[#D99A1B]"
                              : "text-[#B02A2A]"
                        }`}
                      >
                        {approved
                          ? "Approved Partner"
                          : driverStatus === "pending"
                            ? "In Review"
                            : "Action Required"}
                      </Text>
                    </View>

                    {profile?.profile_image_url && (
                      <TouchableOpacity
                        onPress={() => setPreviewImageUri(profile.profile_image_url)}
                        className="rounded-full border border-[#E9E2F0] bg-[#F7F4FB] px-2.5 py-1 active:opacity-70"
                      >
                        <Text className="text-[11px] font-JakartaMedium text-[#5A189A]">
                          View
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Thin Separator */}
              <View className="my-5 h-[1px] bg-[#F0EBF5]" />

              {/* Driver Online / Availability Controller (Dedicated Full-Width Bar) */}
              <View
                className={`flex-row items-center justify-between rounded-2xl p-4 border ${
                  isOnline
                    ? "bg-[#ECFDF5] border-[#A7F3D0]"
                    : "bg-[#F7F4FB] border-[#E9E2F0]"
                }`}
              >
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`h-2.5 w-2.5 rounded-full ${
                        isOnline ? "bg-[#10B981]" : "bg-[#9CA3AF]"
                      }`}
                    />
                    <Text
                      className={`text-[13.5px] font-JakartaBold ${
                        isOnline ? "text-[#065F46]" : "text-[#21152F]"
                      }`}
                    >
                      {isOnline ? "DRIVER STATUS: ONLINE" : "DRIVER STATUS: OFFLINE"}
                    </Text>
                  </View>
                  <Text
                    className={`mt-1 text-[12px] font-Jakarta ${
                      isOnline ? "text-[#047857]" : "text-[#746A7E]"
                    }`}
                  >
                    {isOnline
                      ? "Ready and receiving passenger ride requests"
                      : approved
                        ? "Toggle switch to go on-duty and receive trips"
                        : "Requires document approval before going online"}
                  </Text>
                </View>

                {togglingOnline ? (
                  <ActivityIndicator size="small" color="#5A189A" />
                ) : (
                  <Switch
                    value={isOnline}
                    onValueChange={handleToggleOnline}
                    trackColor={{ false: "#D1D5DB", true: "#10B981" }}
                    thumbColor="#FFFFFF"
                  />
                )}
              </View>
            </View>

            {/* PERFORMANCE STATS */}
            <View className="mb-7 flex-row gap-3.5">
              <StatCard
                icon="star-outline"
                label="Rating"
                value={Number(profile?.rating ?? 5).toFixed(1)}
              />
              <StatCard
                icon="car-sport-outline"
                label="Trips"
                value={String(profile?.total_trips ?? 0)}
              />
              <StatCard
                icon="people-outline"
                label="Seats"
                value={String(vehicle?.seats ?? profile?.car_seats ?? 3)}
              />
            </View>

            {/* PERMITS & VEHICLE DOCUMENTATION SECTION (Spacious & Distinct) */}
            <View className="mb-3.5 flex-row items-center justify-between">
              <View>
                <Text className="text-[17px] font-JakartaExtraBold text-[#21152F]">
                  Permits & Vehicle Documents
                </Text>
                <Text className="mt-0.5 text-[12px] font-JakartaMedium text-[#746A7E]">
                  Verified against official South African transport registers
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(root)/verification")}
                className="flex-row items-center gap-1 active:opacity-70"
              >
                <Text className="text-[12.5px] font-JakartaBold text-[#5A189A]">
                  All Status
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#5A189A" />
              </TouchableOpacity>
            </View>

            <View className="mb-7">
              <ProfileDocRow
                kind="pdp"
                title="Driver Permit (PrDP Category P)"
                subtitle="Professional Driving Permit for passenger transport"
                icon="ribbon-outline"
              />

              <ProfileDocRow
                kind="vehicle_registration"
                title="Vehicle Licence Disc"
                subtitle="Windscreen disc matching vehicle registration plate"
                icon="disc-outline"
              />

              <ProfileDocRow
                kind="insurance"
                title="Passenger Insurance Policy"
                subtitle="Active policy schedule with passenger liability"
                icon="shield-outline"
              />
            </View>

            {/* MY VEHICLE CARD */}
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[17px] font-JakartaExtraBold text-[#21152F]">
                My Vehicle & Photo
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(root)/vehicle-details")}
                className="flex-row items-center gap-1 active:opacity-70"
              >
                <Text className="text-[12.5px] font-JakartaBold text-[#5A189A]">
                  Edit Details
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#5A189A" />
              </TouchableOpacity>
            </View>

            <View className="mb-7 rounded-3xl border border-[#E9E2F0] bg-white p-5 shadow-sm">
              <View className="flex-row items-center gap-4">
                <Pressable
                  onPress={() => {
                    if (vehiclePhotoUrl) {
                      setPreviewImageUri(vehiclePhotoUrl);
                    } else {
                      setActivePhotoType("vehicle");
                    }
                  }}
                  className="relative active:opacity-80"
                >
                  {vehiclePhotoUrl ? (
                    <Image
                      source={{ uri: vehiclePhotoUrl }}
                      className="h-22 w-26 rounded-2xl bg-[#F0E6FA]"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-22 w-26 items-center justify-center rounded-2xl border-2 border-dashed border-[#C77DFF] bg-[#F7F4FB]">
                      <Ionicons name="car-outline" size={26} color="#5A189A" />
                      <Text className="mt-1 text-[10.5px] font-JakartaBold text-[#5A189A]">
                        Add Photo
                      </Text>
                    </View>
                  )}

                  {vehiclePhotoUrl && (
                    <View className="absolute bottom-1 right-1 rounded-full bg-black/60 p-1">
                      <Ionicons name="expand" size={12} color="#fff" />
                    </View>
                  )}
                </Pressable>

                <View className="flex-1">
                  <Text className="text-[16px] font-JakartaExtraBold text-[#21152F]">
                    {vehicle?.make ? `${vehicle.make} ${vehicle.model}` : "Add Vehicle Details"}
                  </Text>
                  <Text className="mt-0.5 text-[12.5px] font-JakartaMedium text-[#746A7E]">
                    {vehicle?.colour ? `${vehicle.colour} · ` : ""}
                    {vehicle?.year ? `${vehicle.year} · ` : ""}
                    {vehicle?.seats ? `${vehicle.seats} seats` : "3 seats"}
                  </Text>

                  <View className="mt-2.5 self-start rounded-lg border border-[#21152F] bg-[#FFFBEA] px-3 py-1">
                    <Text className="text-[12.5px] font-JakartaExtraBold tracking-wider text-[#21152F]">
                      {vehicle?.plate ? vehicle.plate.toUpperCase() : "NO PLATE SET"}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-between border-t border-[#F0E6FA] pt-3.5">
                <Text className="text-[12px] font-Jakarta text-[#746A7E]">
                  {vehiclePhotoUrl ? "Vehicle photo verified" : "Helps passengers identify your car"}
                </Text>
                <TouchableOpacity
                  onPress={() => setActivePhotoType("vehicle")}
                  className="flex-row items-center gap-1.5 rounded-xl bg-[#F0E6FA] px-3.5 py-2 active:opacity-70"
                >
                  <Ionicons name="camera" size={13} color="#5A189A" />
                  <Text className="text-[12px] font-JakartaBold text-[#5A189A]">
                    {vehiclePhotoUrl ? "Change Photo" : "Upload Photo"}
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

            {/* DRIVING & FINANCES */}
            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Driving & Finances
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

            {/* ACCOUNT & SAFETY */}
            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Account & Safety
            </Text>
            <View className="mb-7">
              <SectionCard
                title="Full Name"
                value={profile?.name ?? user?.fullName ?? "Not set"}
                icon="person-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "name", label: "Full Name" },
                  })
                }
              />
              <SectionCard
                title="Phone Number"
                value={profile?.phone_number ?? user?.primaryPhoneNumber?.phoneNumber ?? "Not set"}
                icon="call-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "phone_number", label: "Phone Number" },
                  })
                }
              />
              <SectionCard
                title="Emergency Contact (ICE)"
                value={
                  profile?.profile_data?.emergency_contact ??
                  "Add emergency contact for roadside safety"
                }
                icon="heart-outline"
                onPress={() =>
                  router.push({
                    pathname: "/(root)/edit-profile",
                    params: { field: "emergency_contact", label: "Emergency Contact" },
                  })
                }
              />
            </View>

            {/* SUPPORT */}
            <Text className="mb-3 text-[17px] font-JakartaExtraBold text-[#21152F]">
              Driver Support
            </Text>
            <View className="mb-7">
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

            {/* SIGN OUT */}
            <View className="mb-10">
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
          <View className="rounded-t-3xl bg-white px-6 pb-10 pt-5">
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
                className="flex-row items-center gap-3.5 rounded-2xl bg-[#5A189A] px-5 py-4 active:opacity-80"
              >
                <Ionicons name="camera" size={20} color="#fff" />
                <Text className="text-[15px] font-JakartaBold text-white">
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => activeDocKind && handleDocumentUpload(activeDocKind, "library")}
                className="flex-row items-center gap-3.5 rounded-2xl border border-[#E9E2F0] bg-[#F7F4FB] px-5 py-4 active:opacity-70"
              >
                <Ionicons name="images-outline" size={20} color="#5A189A" />
                <Text className="text-[15px] font-JakartaBold text-[#5A189A]">
                  Choose from Photo Library
                </Text>
              </TouchableOpacity>

              {activeDocKind && Boolean(savedDocs?.[activeDocKind]?.path) && (
                <TouchableOpacity
                  onPress={() => handleViewSavedDoc(activeDocKind)}
                  className="flex-row items-center gap-3.5 rounded-2xl border border-[#E9E2F0] bg-white px-5 py-4 active:opacity-70"
                >
                  <Ionicons name="eye-outline" size={20} color="#21152F" />
                  <Text className="text-[15px] font-JakartaSemiBold text-[#21152F]">
                    View Current Document
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setActiveDocKind(null);
                  router.push("/(root)/verification");
                }}
                className="items-center py-2.5 active:opacity-70"
              >
                <Text className="text-[13px] font-JakartaBold text-[#5A189A]">
                  Open Full Verification Screen →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveDocKind(null)}
                className="mt-1 items-center py-2 active:opacity-70"
              >
                <Text className="text-[14px] font-JakartaSemiBold text-[#746A7E]">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
          <View className="rounded-t-3xl bg-white px-6 pb-10 pt-5">
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
                className="flex-row items-center gap-3.5 rounded-2xl bg-[#5A189A] px-5 py-4 active:opacity-80"
              >
                <Ionicons name="camera" size={20} color="#fff" />
                <Text className="text-[15px] font-JakartaBold text-white">
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => activePhotoType && handlePhotoUpload(activePhotoType, "library")}
                className="flex-row items-center gap-3.5 rounded-2xl border border-[#E9E2F0] bg-[#F7F4FB] px-5 py-4 active:opacity-70"
              >
                <Ionicons name="images-outline" size={20} color="#5A189A" />
                <Text className="text-[15px] font-JakartaBold text-[#5A189A]">
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
          </View>
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
