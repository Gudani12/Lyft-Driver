import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import CustomButton from "@/components/CustomButton";
import { ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";
import {
  AutomatedDocStatus,
  DOC_LABELS,
  DiditDocType,
  DocKind,
  PickedImage,
  REQUIRED_DRIVER_DOCUMENTS,
  VerificationStatus,
  captureImage,
  getSignedUrl,
  pickFromLibrary,
  startDiditVerification,
  uploadDocument,
  verifyDocumentAutomated,
  verifyDrivingLicenceNATIS,
  verifySouthAfricanIdDatabase,
} from "@/lib/verification";

type SavedDoc = {
  path: string;
  status?: AutomatedDocStatus;
  expires_on?: string | null;
  failure_reason?: string | null;
  signedUrl?: string | null;
  confidence_score?: number;
};

const SECTIONS: { title: string; note: string; docs: DocKind[] }[] = [
  {
    title: "Permits & Authorization",
    note: "A Professional Driving Permit (PrDP Category P) and a SAPS Police Clearance are required by law to carry passengers in South Africa.",
    docs: ["pdp", "police_clearance"],
  },
  {
    title: "Vehicle Documentation",
    note: "All vehicle documents must match your registered vehicle plate and remain valid under South African transport laws.",
    docs: [
      "vehicle_registration",
      "operating_card",
      "operating_licence",
      "roadworthy",
      "insurance",
      "vehicle_photo",
    ],
  },
];

const STATUS_BANNER: Record<
  VerificationStatus,
  {
    bg: string;
    icon: any;
    title: string;
    body: string;
    tint: string;
    badge: string;
  }
> = {
  not_submitted: {
    bg: "bg-[#F0E6FA]",
    tint: "#5A189A",
    icon: "shield-outline",
    badge: "Action Required",
    title: "Driver Verification Required",
    body: "Upload your ID, licence, PDP, and vehicle licence disc. Documents are automatically checked against official registers.",
  },
  pending: {
    bg: "bg-[#FFF6E5]",
    tint: "#D99A1B",
    icon: "time-outline",
    badge: "Under Review",
    title: "Compliance Review in Progress",
    body: "Your documents have been submitted. Our compliance team verifies records within 24 to 48 hours.",
  },
  approved: {
    bg: "bg-[#F0E6FA]",
    tint: "#5A189A",
    icon: "shield-checkmark",
    badge: "Approved & Active",
    title: "Approved Driver Partner",
    body: "Your identity and vehicle documents are verified. You are legally cleared to accept passengers.",
  },
  rejected: {
    bg: "bg-[#FEF3F3]",
    tint: "#B02A2A",
    icon: "alert-circle-outline",
    badge: "Attention Needed",
    title: "Verification Could Not Be Completed",
    body: "One or more documents failed automated checks. Please review the details below and upload replacements.",
  },
};

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
    label: "Data Mismatch",
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
    icon: "document-outline",
    label: "Not Uploaded",
  },
};

const DriverVerification = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ focus?: string }>();

  const [status, setStatus] = useState<VerificationStatus>("not_submitted");
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [focusedDoc, setFocusedDoc] = useState<string | null>(null);

  const [savedDocs, setSavedDocs] = useState<Record<string, SavedDoc>>({});
  const [picked, setPicked] = useState<Partial<Record<DocKind, PickedImage>>>(
    {},
  );
  const [expiries, setExpiries] = useState<Partial<Record<DocKind, string>>>(
    {},
  );
  const [uploadingKind, setUploadingKind] = useState<DocKind | null>(null);

  const [activeDocForAction, setActiveDocForAction] = useState<DocKind | null>(
    null,
  );
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const userId = user?.id;

  const [diditDone, setDiditDone] = useState<Record<DiditDocType, boolean>>({
    id: false,
    passport: false,
    licence: false,
  });

  const [verifiedNumbers, setVerifiedNumbers] = useState<{
    id?: string | null;
    passport?: string | null;
    licence?: string | null;
  }>({});

  const [licenceModalVisible, setLicenceModalVisible] = useState(false);
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceNationalId, setLicenceNationalId] = useState("");
  const [licenceLastName, setLicenceLastName] = useState("");
  const [licenceInitials, setLicenceInitials] = useState("");
  const [licenceSubmitting, setLicenceSubmitting] = useState(false);
  const [licenceError, setLicenceError] = useState<string | null>(null);

  const [saIdModalVisible, setSaIdModalVisible] = useState(false);
  const [saIdNumber, setSaIdNumber] = useState("");
  const [saIdFirstName, setSaIdFirstName] = useState("");
  const [saIdLastName, setSaIdLastName] = useState("");
  const [saIdDob, setSaIdDob] = useState("");
  const [saIdSubmitting, setSaIdSubmitting] = useState(false);
  const [saIdError, setSaIdError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const result = await fetchAPI(
        `/(api)/profile?clerkId=${encodeURIComponent(userId)}`,
      );
      const record = result?.data ?? {};
      setStatus(
        (record.driver_verification_status as VerificationStatus) ??
        "not_submitted",
      );
      setReason(record.driver_rejection_reason ?? null);

      const isIdDone = record.id_verified === true;
      const isPassportDone = record.passport_verified === true;
      const isLicenceDone = record.licence_verified === true;

      setDiditDone({
        id: isIdDone,
        passport: isPassportDone,
        licence: isLicenceDone,
      });

      const licenceNum =
        record.profile_data?.licence?.licence_number ??
        record.driver_license_number ??
        null;

      setVerifiedNumbers({
        id: record.id_number ?? null,
        passport: record.passport_number ?? null,
        licence: licenceNum,
      });

      if (record.id_number) {
        setLicenceNationalId(record.id_number);
        setSaIdNumber(record.id_number);
      }
      if (record.first_name) {
        setSaIdFirstName(record.first_name);
        setLicenceInitials(record.first_name.charAt(0).toUpperCase());
      }
      if (record.last_name) {
        setSaIdLastName(record.last_name);
        setLicenceLastName(record.last_name);
      }
      if (record.date_of_birth) {
        setSaIdDob(record.date_of_birth);
      }

      const rawDocs = record.profile_data?.driver_documents ?? {};
      const loadedDocs: Record<string, SavedDoc> = {};
      const loadedExpiries: Partial<Record<DocKind, string>> = {};

      for (const [k, v] of Object.entries(rawDocs)) {
        if (v && typeof v === "object" && (v as any).path) {
          loadedDocs[k] = {
            path: (v as any).path,
            status: (v as any).status ?? "pending_review",
            expires_on: (v as any).expires_on ?? null,
            failure_reason: (v as any).failure_reason ?? null,
            confidence_score: (v as any).confidence_score ?? undefined,
          };
          if ((v as any).expires_on) {
            loadedExpiries[k as DocKind] = (v as any).expires_on;
          }
        }
      }
      setSavedDocs(loadedDocs);
      setExpiries(loadedExpiries);
    } catch (error) {
      console.warn("Could not load driver verification", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
      const focus =
        typeof params.focus === "string" ? params.focus : null;
      if (focus) {
        setFocusedDoc(focus);
        const timer = setTimeout(() => setFocusedDoc(null), 2500);
        return () => clearTimeout(timer);
      }
    }, [load, params.focus]),
  );

  const identityDone = diditDone.id || diditDone.passport ? 1 : 0;
  const licenceDone = diditDone.licence ? 1 : 0;
  const docsDone = REQUIRED_DRIVER_DOCUMENTS.filter(
    (kind) =>
      Boolean(savedDocs[kind]?.path) && savedDocs[kind]?.status === "verified",
  ).length;
  const totalItems = 2 + REQUIRED_DRIVER_DOCUMENTS.length;
  const totalDone = identityDone + licenceDone + docsDone;
  const progress = Math.min(100, Math.round((totalDone / totalItems) * 100));

  const handleUploadSingleDocument = async (
    kind: DocKind,
    image: PickedImage,
  ) => {
    if (!user?.id) return;
    setUploadingKind(kind);

    try {
      const token = await getToken();
      if (!token)
        throw new Error(
          "Your sign-in has expired. Sign in again to upload files.",
        );
      const path = await uploadDocument(user.id, kind, image, token);

      const result = await verifyDocumentAutomated({
        clerkId: user.id,
        docKind: kind,
        filePath: path,
        expiryDate: expiries[kind] ?? null,
      });

      setSavedDocs((prev) => ({
        ...prev,
        [kind]: {
          path,
          status: result?.status ?? "pending_review",
          expires_on: expiries[kind] ?? null,
          failure_reason: result?.failureReason ?? null,
        },
      }));
      setPicked((prev) => ({ ...prev, [kind]: image }));

      if (result?.status === "verified") {
        Alert.alert(
          "Automated Verification Passed",
          `${DOC_LABELS[kind].title} has been verified and confirmed against official records.`,
        );
      } else if (result?.status === "expired") {
        Alert.alert(
          "Document Expired",
          result?.failureReason ??
          "This document is expired. Please upload a valid document.",
        );
      } else if (result?.status === "mismatch") {
        Alert.alert(
          "Information Mismatch",
          result?.failureReason ??
          "The details on this document do not match your registered profile.",
        );
      } else {
        Alert.alert(
          "Document Uploaded",
          `${DOC_LABELS[kind].title} received and routed for compliance verification.`,
        );
      }

      await load();
    } catch (err: any) {
      Alert.alert("Upload Failed", err?.message ?? "Please try again.");
    } finally {
      setUploadingKind(null);
      setActiveDocForAction(null);
    }
  };

  const selectPhotoSource = (kind: DocKind, source: "camera" | "library") => {
    const fn = source === "camera" ? () => captureImage(false) : pickFromLibrary;

    (async () => {
      try {
        const image = await fn();
        if (image) {
          await handleUploadSingleDocument(kind, image);
        }
      } catch (err: any) {
        Alert.alert(
          "Could not select image",
          err?.message ?? "Please try again.",
        );
      }
    })();
  };

  const viewExistingDocument = async (kind: DocKind) => {
    const local = picked[kind]?.uri;
    if (local) {
      setPreviewImageUri(local);
      setActiveDocForAction(null);
      return;
    }

    const saved = savedDocs[kind]?.path;
    if (saved) {
      try {
        const token = await getToken();
        if (!token)
          throw new Error(
            "Your sign-in has expired. Sign in again to view files.",
          );
        const signed = await getSignedUrl(saved, token, 60);
        if (signed) {
          setPreviewImageUri(signed);
        } else {
          Alert.alert(
            "Document",
            "Could not generate secure view link for this document.",
          );
        }
      } catch {
        Alert.alert("Document", "Could not load document preview.");
      }
    }
    setActiveDocForAction(null);
  };

  const launchDiditSession = async (docType: DiditDocType) => {
    if (!user?.id) {
      Alert.alert("Not signed in", "Please sign in again.");
      return;
    }

    try {
      const session = await startDiditVerification(user.id, docType);
      router.push({
        pathname: "/(root)/didit-webview",
        params: {
          url: session.url,
          sessionId: session.session_id,
          docType,
          clerkId: user.id,
        },
      });
    } catch (err: any) {
      Alert.alert("Verification", err?.message ?? "Please try again.");
    }
  };

  const handleIdVerifyPress = () => {
    Alert.alert(
      "Verify South African ID",
      "Choose your preferred verification method:",
      [
        {
          text: "Verify with Home Affairs",
          onPress: () => {
            setSaIdError(null);
            setSaIdModalVisible(true);
          },
        },
        {
          text: "Scan ID Card / Book (Camera)",
          onPress: () => launchDiditSession("id"),
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleSaIdSubmit = async () => {
    if (
      !saIdNumber.trim() ||
      !saIdFirstName.trim() ||
      !saIdLastName.trim() ||
      !saIdDob.trim()
    ) {
      setSaIdError("Please fill in all the required fields.");
      return;
    }

    if (saIdNumber.trim().length !== 13) {
      setSaIdError("South African ID must be exactly 13 digits.");
      return;
    }

    setSaIdSubmitting(true);
    setSaIdError(null);

    try {
      const res = await verifySouthAfricanIdDatabase({
        nationalId: saIdNumber.trim(),
        firstName: saIdFirstName.trim(),
        lastName: saIdLastName.trim(),
        dateOfBirth: saIdDob.trim(),
        clerkId: user!.id,
      });

      if (res?.verified) {
        setSaIdModalVisible(false);
        setDiditDone((prev) => ({ ...prev, id: true }));
        setVerifiedNumbers((prev) => ({ ...prev, id: saIdNumber.trim() }));
        Alert.alert(
          "ID Verified!",
          "Your South African ID has been verified with Home Affairs.",
        );
        load();
      } else {
        setSaIdError(
          res?.message ?? "Could not verify ID details with Home Affairs.",
        );
      }
    } catch (err: any) {
      setSaIdError(
        err?.message ?? "Verification request failed. Please check connection.",
      );
    } finally {
      setSaIdSubmitting(false);
    }
  };

  const handleLicenceSubmit = async () => {
    if (
      !licenceNumber.trim() ||
      !licenceNationalId.trim() ||
      !licenceLastName.trim() ||
      !licenceInitials.trim()
    ) {
      setLicenceError("Please fill in all driving licence fields.");
      return;
    }

    setLicenceSubmitting(true);
    setLicenceError(null);

    try {
      const res = await verifyDrivingLicenceNATIS({
        licenceNumber: licenceNumber.trim(),
        nationalId: licenceNationalId.trim(),
        lastName: licenceLastName.trim(),
        initials: licenceInitials.trim().toUpperCase(),
        clerkId: user!.id,
      });

      if (res?.verified) {
        setLicenceModalVisible(false);
        setDiditDone((prev) => ({ ...prev, licence: true }));
        setVerifiedNumbers((prev) => ({
          ...prev,
          licence: licenceNumber.trim(),
        }));
        Alert.alert(
          "Licence Verified!",
          "Your driving licence was successfully confirmed on the official NATIS register.",
        );
        load();
      } else {
        setLicenceError(
          res?.message ??
          "The licence number, initials, or ID did not match NATIS records.",
        );
      }
    } catch (err: any) {
      setLicenceError(
        err?.message ?? "Failed to connect to NATIS. Please try again.",
      );
    } finally {
      setLicenceSubmitting(false);
    }
  };

  const handleSubmitAllForReview = async () => {
    if (!user?.id) return;
    setSubmitting(true);

    try {
      await fetchAPI("/(api)/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkId: user.id,
          driver_verification_status: "pending",
          driver_submitted_at: new Date().toISOString(),
        }),
      });

      setStatus("pending");
      Alert.alert(
        "Submitted for Review",
        "Your driver documents are now under review. You will receive an update within 24-48 hours.",
      );
      load();
    } catch (err: any) {
      Alert.alert(
        "Submission Error",
        err?.message ?? "Could not submit for review.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const banner = STATUS_BANNER[status];

  const maskNumber = (num?: string | null) => {
    if (!num) return "";
    if (num.length <= 4) return num;
    return `•••• ${num.slice(-4)}`;
  };

  const DocumentCard = ({ kind }: { kind: DocKind }) => {
    const docEntry = savedDocs[kind];
    const isSaved = Boolean(docEntry?.path);
    const isPicked = Boolean(picked[kind]);
    const isUploading = uploadingKind === kind;
    const label = DOC_LABELS[kind];
    const isReady = isSaved || isPicked;

    const docStatus: AutomatedDocStatus | "unverified" = isReady
      ? docEntry?.status ?? "pending_review"
      : "unverified";
    const pill = STATUS_PILL_CONFIG[docStatus];

    return (
      <View className="mb-4 overflow-hidden rounded-3xl border border-[#E9E2F0] bg-white p-5 shadow-sm">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3.5 pr-2">
            <View
              className={`h-12 w-12 items-center justify-center rounded-2xl ${isReady ? "bg-[#F0E6FA]" : "bg-[#F7F4FB]"
                }`}
            >
              <Ionicons
                name={
                  kind === "pdp"
                    ? "ribbon-outline"
                    : kind === "police_clearance"
                      ? "shield-checkmark-outline"
                      : kind === "vehicle_registration"
                        ? "disc-outline"
                        : kind === "operating_card"
                          ? "card-outline"
                          : kind === "operating_licence"
                            ? "document-text-outline"
                            : kind === "roadworthy"
                              ? "construct-outline"
                              : kind === "insurance"
                                ? "shield-outline"
                                : "document-text-outline"
                }
                size={22}
                color={isReady ? "#5A189A" : "#746A7E"}
              />
            </View>

            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-[15px] font-JakartaBold text-[#21152F]">
                  {label.title}
                </Text>
                {REQUIRED_DRIVER_DOCUMENTS.includes(kind) && (
                  <View className="rounded-md bg-[#FEF3F3] px-1.5 py-0.5">
                    <Text className="text-[9.5px] font-JakartaBold text-[#B02A2A]">
                      Required
                    </Text>
                  </View>
                )}
              </View>
              {docEntry?.expires_on && (
                <Text className="mt-0.5 text-[11px] font-JakartaMedium text-[#746A7E]">
                  Expires: {docEntry.expires_on}
                </Text>
              )}
            </View>
          </View>

          <View
            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${pill.bg}`}
          >
            <Ionicons
              name={pill.icon}
              size={13}
              color={
                docStatus === "verified"
                  ? "#5A189A"
                  : docStatus === "pending_review"
                    ? "#D99A1B"
                    : docStatus === "unverified"
                      ? "#746A7E"
                      : "#B02A2A"
              }
            />
            <Text className={`text-[11px] font-JakartaBold ${pill.text}`}>
              {pill.label}
            </Text>
          </View>
        </View>

        <Text className="mt-3.5 text-[12.5px] font-Jakarta leading-5 text-[#746A7E]">
          {label.help}
        </Text>

        {docEntry?.failure_reason && (
          <View className="mt-3.5 rounded-2xl border border-[#F8D7DA] bg-[#FEF3F3] p-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={16} color="#B02A2A" />
              <Text className="text-[11.5px] font-JakartaBold text-[#B02A2A]">
                Compliance Note
              </Text>
            </View>
            <Text className="mt-1 text-[12px] font-JakartaMedium leading-4 text-[#B02A2A]">
              {docEntry.failure_reason}
            </Text>
          </View>
        )}

        <View className="mt-4 flex-row items-center justify-between border-t border-[#F0E6FA] pt-3.5">
          <Text className="text-[11.5px] font-JakartaMedium text-[#746A7E]">
            {isReady ? "Document securely stored" : "Upload current document"}
          </Text>

          <TouchableOpacity
            onPress={() => setActiveDocForAction(kind)}
            disabled={isUploading}
            activeOpacity={0.8}
            className="flex-row items-center gap-1.5 rounded-xl bg-[#5A189A] px-4 py-2.5 active:opacity-70"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={isReady ? "sync-outline" : "add"}
                  size={15}
                  color="#fff"
                />
                <Text className="text-[12.5px] font-JakartaBold text-white">
                  {isReady ? "Update / View" : "Upload Document"}
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
      <View className="flex-row items-center justify-between px-6 pb-4 pt-3">
        <View className="flex-row items-center gap-3.5">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-2xl border border-[#E9E2F0] bg-white shadow-sm active:opacity-70"
          >
            <Ionicons name="chevron-back" size={22} color="#21152F" />
          </Pressable>
          <View>
            <Text className="text-[20px] font-JakartaExtraBold text-[#21152F]">
              Driver Verification
            </Text>
            <Text className="text-[12px] font-JakartaMedium text-[#746A7E]">
              South African Transport Compliance
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={load}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-2xl border border-[#E9E2F0] bg-white shadow-sm active:opacity-70"
        >
          <Ionicons name="refresh" size={18} color="#5A189A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center py-24">
          <ActivityIndicator size="large" color="#5A189A" />
          <Text className="mt-3 text-[13px] font-JakartaMedium text-[#746A7E]">
            Loading compliance registers…
          </Text>
        </View>
      ) : (
        <ScrollView
          className="px-6"
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 6 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            className={`mb-6 rounded-3xl p-6 ${banner.bg} border border-[#E9E2F0] shadow-sm`}
          >
            <View className="flex-row items-center justify-between">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Ionicons name={banner.icon} size={26} color={banner.tint} />
              </View>

              <View className="rounded-full bg-white/70 px-3.5 py-1.5 border border-white">
                <Text
                  className="text-[11.5px] font-JakartaBold uppercase tracking-wide"
                  style={{ color: banner.tint }}
                >
                  {banner.badge}
                </Text>
              </View>
            </View>

            <Text className="mt-4 text-[20px] font-JakartaExtraBold tracking-tight text-[#21152F]">
              {banner.title}
            </Text>
            <Text className="mt-2 text-[13.5px] font-Jakarta leading-6 text-[#746A7E]">
              {banner.body}
            </Text>

            {status === "rejected" && !!reason && (
              <View className="mt-4 rounded-2xl border border-[#F8D7DA] bg-white p-4">
                <Text className="text-[11px] font-JakartaBold uppercase text-[#B02A2A]">
                  Compliance Requirement:
                </Text>
                <Text className="mt-1 text-[13px] font-JakartaMedium leading-5 text-[#B02A2A]">
                  {reason}
                </Text>
              </View>
            )}
          </View>

          <View className="mb-8 rounded-3xl border border-[#E9E2F0] bg-white p-6 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[15px] font-JakartaExtraBold text-[#21152F]">
                  Compliance Completion
                </Text>
                <Text className="mt-0.5 text-[12px] font-Jakarta text-[#746A7E]">
                  {totalDone} of {totalItems} legal requirements verified
                </Text>
              </View>
              <Text className="text-[20px] font-JakartaExtraBold text-[#5A189A]">
                {progress}%
              </Text>
            </View>

            <View className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#F0E6FA]">
              <View
                className="h-full rounded-full bg-[#5A189A]"
                style={{ width: `${progress}%` }}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-[17px] font-JakartaExtraBold text-[#21152F]">
              1. Official Government Registries
            </Text>
            <Text className="mt-1 text-[12.5px] font-Jakarta leading-5 text-[#746A7E]">
              Direct database validations against Home Affairs and NATIS.
            </Text>
          </View>

          <View className="mb-4 rounded-3xl border border-[#E9E2F0] bg-white p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#F0E6FA]">
                  <Ionicons name="card-outline" size={22} color="#5A189A" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-JakartaBold text-[#21152F]">
                    South African ID / Passport
                  </Text>
                  <Text className="mt-0.5 text-[12px] font-Jakarta text-[#746A7E]">
                    {diditDone.id
                      ? `Verified (${maskNumber(verifiedNumbers.id)})`
                      : diditDone.passport
                        ? `Passport (${maskNumber(verifiedNumbers.passport)})`
                        : "Home Affairs automated check"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleIdVerifyPress}
                className="rounded-xl bg-[#F0E6FA] px-3.5 py-2 active:opacity-70"
              >
                <Text className="text-[12.5px] font-JakartaBold text-[#5A189A]">
                  {diditDone.id || diditDone.passport
                    ? "Re-verify"
                    : "Verify ID"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-8 rounded-3xl border border-[#E9E2F0] bg-white p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center gap-3.5 pr-2">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-[#F0E6FA]">
                  <Ionicons name="car-outline" size={22} color="#5A189A" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-JakartaBold text-[#21152F]">
                    Driving Licence (NATIS)
                  </Text>
                  <Text className="mt-0.5 text-[12px] font-Jakarta text-[#746A7E]">
                    {diditDone.licence
                      ? `NATIS Confirmed (${maskNumber(verifiedNumbers.licence)})`
                      : "National driver register lookup"}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setLicenceError(null);
                  setLicenceModalVisible(true);
                }}
                className="rounded-xl bg-[#F0E6FA] px-3.5 py-2 active:opacity-70"
              >
                <Text className="text-[12.5px] font-JakartaBold text-[#5A189A]">
                  {diditDone.licence ? "Re-check" : "Verify"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {SECTIONS.map((section, idx) => (
            <View key={section.title} className="mb-6">
              <View className="mb-3.5">
                <Text className="text-[17px] font-JakartaExtraBold text-[#21152F]">
                  {`${idx + 2}. ${section.title}`}
                </Text>
                <Text className="mt-1 text-[12.5px] font-Jakarta leading-5 text-[#746A7E]">
                  {section.note}
                </Text>
              </View>

              {section.docs.map((kind) => (
                <View
                  key={kind}
                  className={
                    focusedDoc === kind
                      ? "rounded-3xl border-2 border-[#5A189A] p-0.5"
                      : ""
                  }
                >
                  <DocumentCard kind={kind} />
                </View>
              ))}
            </View>
          ))}

          <View className="mt-4 pb-10">
            <CustomButton
              title={
                submitting
                  ? "Submitting for Review…"
                  : "Submit Documents for Review"
              }
              loading={submitting}
              onPress={handleSubmitAllForReview}
            />
            <Text className="mt-3 text-center text-[12px] font-Jakarta leading-5 text-[#A69BAF]">
              Your documents are encrypted in transit and at rest in full
              compliance with the South African Protection of Personal
              Information Act (POPIA).
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={Boolean(activeDocForAction)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveDocForAction(null)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/60"
          onPress={() => setActiveDocForAction(null)}
        >
          <View className="rounded-t-3xl bg-white px-6 pb-10 pt-5">
            <View className="items-center pb-4">
              <View className="h-1.5 w-12 rounded-full bg-[#E9E2F0]" />
            </View>

            <Text className="text-center text-[19px] font-JakartaExtraBold text-[#21152F]">
              {activeDocForAction
                ? DOC_LABELS[activeDocForAction].title
                : "Document"}
            </Text>
            <Text className="mt-1.5 text-center text-[13px] font-Jakarta leading-5 text-[#746A7E]">
              {activeDocForAction ? DOC_LABELS[activeDocForAction].help : ""}
            </Text>

            <View className="mt-6 gap-3">
              <TouchableOpacity
                onPress={() =>
                  activeDocForAction &&
                  selectPhotoSource(activeDocForAction, "camera")
                }
                className="flex-row items-center gap-3.5 rounded-2xl bg-[#5A189A] px-5 py-4 active:opacity-80"
              >
                <Ionicons name="camera" size={20} color="#fff" />
                <Text className="text-[15px] font-JakartaBold text-white">
                  Take Photo with Camera
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  activeDocForAction &&
                  selectPhotoSource(activeDocForAction, "library")
                }
                className="flex-row items-center gap-3.5 rounded-2xl border border-[#E9E2F0] bg-[#F7F4FB] px-5 py-4 active:opacity-70"
              >
                <Ionicons name="images-outline" size={20} color="#5A189A" />
                <Text className="text-[15px] font-JakartaBold text-[#5A189A]">
                  Choose from Photo Library
                </Text>
              </TouchableOpacity>

              {activeDocForAction &&
                Boolean(
                  savedDocs[activeDocForAction]?.path ||
                  picked[activeDocForAction],
                ) && (
                  <TouchableOpacity
                    onPress={() => viewExistingDocument(activeDocForAction)}
                    className="flex-row items-center gap-3.5 rounded-2xl border border-[#E9E2F0] bg-white px-5 py-4 active:opacity-70"
                  >
                    <Ionicons name="eye-outline" size={20} color="#21152F" />
                    <Text className="text-[15px] font-JakartaSemiBold text-[#21152F]">
                      View Current Document
                    </Text>
                  </TouchableOpacity>
                )}

              <TouchableOpacity
                onPress={() => setActiveDocForAction(null)}
                className="mt-2 items-center py-3 active:opacity-70"
              >
                <Text className="text-[14.5px] font-JakartaSemiBold text-[#746A7E]">
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

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
                Document Preview
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

      <Modal
        visible={licenceModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLicenceModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setLicenceModalVisible(false)}
          />
          <View
            className="rounded-t-3xl bg-white px-6 pt-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="items-center pb-3">
              <View className="h-1.5 w-12 rounded-full bg-[#E9E2F0]" />
            </View>

            <View className="flex-row items-center justify-between pb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[19px] font-JakartaExtraBold text-[#21152F]">
                  Verify Driving Licence
                </Text>
                <Text className="mt-1 text-[12.5px] font-Jakarta text-[#746A7E]">
                  Validated directly against the South African NATIS register.
                </Text>
              </View>
              <Pressable
                onPress={() => setLicenceModalVisible(false)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-[#F0E6FA]"
              >
                <Ionicons name="close" size={18} color="#746A7E" />
              </Pressable>
            </View>

            {licenceError && (
              <View className="mb-4 flex-row items-center gap-2.5 rounded-2xl bg-[#FEF3F3] p-3.5 border border-[#F8D7DA]">
                <Ionicons name="alert-circle" size={18} color="#B02A2A" />
                <Text className="flex-1 text-[12.5px] font-JakartaMedium text-[#B02A2A]">
                  {licenceError}
                </Text>
              </View>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              className="max-h-[380px]"
            >
              <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                Driving Licence Card Number *
              </Text>
              <TextInput
                value={licenceNumber}
                onChangeText={setLicenceNumber}
                placeholder="e.g. 12345678"
                placeholderTextColor={ui.faint}
                autoCapitalize="characters"
                className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
              />

              <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                National ID Number *
              </Text>
              <TextInput
                value={licenceNationalId}
                onChangeText={setLicenceNationalId}
                placeholder="13-digit SA ID number"
                placeholderTextColor={ui.faint}
                keyboardType="numeric"
                maxLength={13}
                className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                    Last Name *
                  </Text>
                  <TextInput
                    value={licenceLastName}
                    onChangeText={setLicenceLastName}
                    placeholder="e.g. Dlamini"
                    placeholderTextColor={ui.faint}
                    autoCapitalize="words"
                    className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
                  />
                </View>

                <View className="w-28">
                  <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                    Initials *
                  </Text>
                  <TextInput
                    value={licenceInitials}
                    onChangeText={setLicenceInitials}
                    placeholder="e.g. S"
                    placeholderTextColor={ui.faint}
                    autoCapitalize="characters"
                    maxLength={4}
                    className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
                  />
                </View>
              </View>
            </ScrollView>

            <View className="mt-4 mb-2">
              <CustomButton
                title={
                  licenceSubmitting
                    ? "Verifying with NATIS…"
                    : "Check NATIS Register"
                }
                loading={licenceSubmitting}
                onPress={handleLicenceSubmit}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={saIdModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSaIdModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <Pressable
            className="flex-1 bg-black/50"
            onPress={() => setSaIdModalVisible(false)}
          />
          <View
            className="rounded-t-3xl bg-white px-6 pt-4"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <View className="items-center pb-3">
              <View className="h-1.5 w-12 rounded-full bg-[#E9E2F0]" />
            </View>

            <View className="flex-row items-center justify-between pb-4">
              <View className="flex-1 pr-3">
                <Text className="text-[19px] font-JakartaExtraBold text-[#21152F]">
                  Verify South African ID
                </Text>
                <Text className="mt-1 text-[12.5px] font-Jakarta text-[#746A7E]">
                  Instant verification directly against Department of Home
                  Affairs.
                </Text>
              </View>
              <Pressable
                onPress={() => setSaIdModalVisible(false)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-[#F0E6FA]"
              >
                <Ionicons name="close" size={18} color="#746A7E" />
              </Pressable>
            </View>

            {saIdError && (
              <View className="mb-4 flex-row items-center gap-2.5 rounded-2xl bg-[#FEF3F3] p-3.5 border border-[#F8D7DA]">
                <Ionicons name="alert-circle" size={18} color="#B02A2A" />
                <Text className="flex-1 text-[12.5px] font-JakartaMedium text-[#B02A2A]">
                  {saIdError}
                </Text>
              </View>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              className="max-h-[380px]"
            >
              <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                13-Digit SA ID Number *
              </Text>
              <TextInput
                value={saIdNumber}
                onChangeText={setSaIdNumber}
                placeholder="e.g. 9001015009087"
                placeholderTextColor={ui.faint}
                keyboardType="numeric"
                maxLength={13}
                className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
              />

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                    First Name *
                  </Text>
                  <TextInput
                    value={saIdFirstName}
                    onChangeText={setSaIdFirstName}
                    placeholder="e.g. Sipho"
                    placeholderTextColor={ui.faint}
                    autoCapitalize="words"
                    className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
                  />
                </View>

                <View className="flex-1">
                  <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                    Last Name *
                  </Text>
                  <TextInput
                    value={saIdLastName}
                    onChangeText={setSaIdLastName}
                    placeholder="e.g. Dlamini"
                    placeholderTextColor={ui.faint}
                    autoCapitalize="words"
                    className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
                  />
                </View>
              </View>

              <Text className="mb-1.5 text-[13px] font-JakartaBold text-[#21152F]">
                Date of Birth (YYYY-MM-DD) *
              </Text>
              <TextInput
                value={saIdDob}
                onChangeText={setSaIdDob}
                placeholder="e.g. 1990-01-01"
                placeholderTextColor={ui.faint}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                className="mb-4 h-12 rounded-xl border border-[#E9E2F0] bg-[#F7F4FB] px-4 text-[14px] font-JakartaMedium text-[#21152F]"
              />
            </ScrollView>

            <View className="mt-4 mb-2">
              <CustomButton
                title={
                  saIdSubmitting
                    ? "Verifying with Home Affairs…"
                    : "Verify ID"
                }
                loading={saIdSubmitting}
                onPress={handleSaIdSubmit}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

export default DriverVerification;