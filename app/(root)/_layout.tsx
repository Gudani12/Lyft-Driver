import { Stack } from "expo-router";

import { brand } from "@/constants/theme";

const Layout = () => {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: brand.deep },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="create-trip" />
      <Stack.Screen name="verification" />
      <Stack.Screen name="vehicle-details" />
      <Stack.Screen name="bank-details" />
      <Stack.Screen name="chat/[rideId]" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="help-support" />
      <Stack.Screen name="support-chat" />
    </Stack>
  );
};

export default Layout;
