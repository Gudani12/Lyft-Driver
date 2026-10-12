import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, LogBox, Pressable, Text, View } from "react-native";
import "react-native-reanimated";
import "../global.css";

import AnimatedSplash from "@/components/AnimatedSplash";
import { brand } from "@/constants/theme";
import { tokenCache } from "@/lib/auth";
import { fetchAPI } from "@/lib/fetch";

LogBox.ignoreLogs(["Clerk:"]);

export default function RootLayout() {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [loaded] = useFonts({
    "Jakarta-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "Jakarta-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "Jakarta-ExtraLight": require("../assets/fonts/PlusJakartaSans-ExtraLight.ttf"),
    "Jakarta-Light": require("../assets/fonts/PlusJakartaSans-Light.ttf"),
    "Jakarta-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    Jakarta: require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "Jakarta-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
  });

  // Always trigger the custom animation first on app open.
  const [splashDone, setSplashDone] = useState(false);

  const loadClientConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetchAPI("/(api)/client-config");
      const key = response?.data?.clerkPublishableKey;
      if (typeof key !== "string" || !key) {
        throw new Error("Render did not return a Clerk publishable key.");
      }
      setPublishableKey(key);
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : "Unable to load app configuration.",
      );
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClientConfig();
  }, [loadClientConfig]);

  useEffect(() => {
    if (loaded && splashDone) {
      // Once the custom animation completes, the app content can render.
    }
  }, [loaded, splashDone]);

  if (!splashDone || !loaded) {
    return <AnimatedSplash onFinish={() => setSplashDone(true)} />;
  }

  if (configLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brand.deep,
        }}
      >
        <ActivityIndicator color="white" />
        <Text style={{ color: "white", marginTop: 12 }}>Connecting to Render...</Text>
      </View>
    );
  }

  if (!publishableKey) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: brand.deep,
        }}
      >
        <Text style={{ color: "white", fontSize: 20, fontWeight: "700" }}>
          Clerk configuration required
        </Text>
        <Text style={{ color: "white", marginTop: 12, lineHeight: 22 }}>
          {configError ??
            "Configure CLERK_PUBLISHABLE_KEY in the Render environment and ensure the API is available."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void loadClientConfig()}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Retry connection</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: brand.deep }}>
      <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
        <ClerkLoaded>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: brand.deep } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(root)" />
            <Stack.Screen name="+not-found" />
          </Stack>
        </ClerkLoaded>
      </ClerkProvider>
    </View>
  );
}
