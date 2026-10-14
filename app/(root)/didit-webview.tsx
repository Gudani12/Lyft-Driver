import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const DiditWebView = () => {
  const params = useLocalSearchParams<{
    url?: string;
    sessionId?: string;
    clerkId?: string;
    docType?: string;
  }>();

  const url = typeof params.url === "string" ? params.url : null;
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const hasClosed = useRef(false);

  const closeAndReturn = (reason: string) => {
    if (hasClosed.current) return;
    hasClosed.current = true;
    Alert.alert(
      "Verification Submitted",
      reason,
      [{ text: "OK", onPress: () => router.back() }],
    );
  };

  if (!url) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#F7F4FB] px-6">
        <Ionicons name="alert-circle" size={48} color="#B02A2A" />
        <Text className="mt-4 text-center text-[15px] font-JakartaBold text-[#21152F]">
          Could not open verification
        </Text>
        <Text className="mt-2 text-center text-[13px] font-JakartaMedium text-[#746A7E]">
          The verification link is missing or expired. Please try again.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-2xl bg-[#5A189A] px-6 py-3"
        >
          <Text className="text-[14px] font-JakartaBold text-white">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F4FB]">
      <View className="flex-row items-center justify-between px-4 pb-3 pt-2">
        <Text className="text-[16px] font-JakartaExtraBold text-[#21152F]">
          Verify your identity
        </Text>
        <Pressable
          onPress={() =>
            Alert.alert(
              "Cancel verification?",
              "You can start again from the verification screen.",
              [
                { text: "Stay", style: "cancel" },
                {
                  text: "Cancel",
                  style: "destructive",
                  onPress: () => router.back(),
                },
              ],
            )
          }
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full bg-white active:opacity-70"
        >
          <Ionicons name="close" size={20} color="#21152F" />
        </Pressable>
      </View>

      <View className="flex-1 overflow-hidden">
        {loading && !errored && (
          <View className="absolute inset-0 z-10 items-center justify-center bg-[#F7F4FB]">
            <ActivityIndicator size="large" color="#5A189A" />
            <Text className="mt-3 text-[13px] font-JakartaMedium text-[#746A7E]">
              Loading secure verification…
            </Text>
          </View>
        )}

        <WebView
          source={{ uri: url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setErrored(true);
            Alert.alert(
              "Connection error",
              "Could not load the verification page. Check your internet and try again.",
            );
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn(
              "didit-webview: HTTP error",
              nativeEvent.statusCode,
              nativeEvent.url,
            );
          }}
          onNavigationStateChange={(navState) => {
            const { url: currentUrl } = navState;

            // Didit redirects to /session/{id}/done or /return on completion.
            // Close as soon as we detect a known completion path.
            if (
              currentUrl.includes("verify.didit.me") &&
              (currentUrl.includes("/done") ||
                currentUrl.includes("/success") ||
                currentUrl.includes("/return") ||
                currentUrl.includes("/callback"))
            ) {
              closeAndReturn(
                "Your document was uploaded. Verification status will update in a moment.",
              );
            }

            // External redirect that isn't Didit — close too
            if (
              !currentUrl.includes("verify.didit.me") &&
              !currentUrl.startsWith("about:blank")
            ) {
              closeAndReturn(
                "Verification flow complete. Status will update shortly.",
              );
            }
          }}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          originWhitelist={["*"]}
          // Camera + mic permission for the selfie step
          allowsProtectedMedia
          // Optional: on iOS, allow camera capture inside the WebView
          // (worked from RN 0.72 + expo-web-browser style flows)
          {...({
            allowFileAccess: true,
            allowFileAccessFromFileURLs: true,
            allowUniversalAccessFromFileURLs: true,
          } as any)}
        />
      </View>
    </SafeAreaView>
  );
};

export default DiditWebView;