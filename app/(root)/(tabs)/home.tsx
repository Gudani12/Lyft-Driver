import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, Text, View } from "react-native";

import Map from "@/components/Map";
import { brand, ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";
import { getRideMapLocation } from "@/lib/map";
import { useLocationStore } from "@/store";

const Home = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { setUserLocation, userLatitude, userLongitude, userAddress } = useLocationStore();
  const [isOnline, setIsOnline] = useState(false);
  const [showStatusCard, setShowStatusCard] = useState(false);
  const [availableSeats, setAvailableSeats] = useState(2);
  const [canGoOnline, setCanGoOnline] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<any>(null);
  const [activeRideLocation, setActiveRideLocation] = useState<{
    pickup: { latitude: number; longitude: number; address?: string | null };
    destination: { latitude: number; longitude: number; address?: string | null };
  } | null>(null);
  const popupTranslateY = useRef(new Animated.Value(0)).current;

  const updateActiveRideLocation = useCallback(async (ride: any) => {
    let location = getRideMapLocation(ride);

    if (!location && ride?.origin_address) {
      const geocoded = await Location.geocodeAsync(ride.origin_address);
      if (geocoded?.[0]) {
        location = getRideMapLocation({
          ...ride,
          origin_latitude: geocoded[0].latitude,
          origin_longitude: geocoded[0].longitude,
        });
      }
    }

    setActiveRideLocation(location);
  }, []);

  const loadDriverProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      const result = await fetchAPI(`/(api)/profile?clerkId=${encodeURIComponent(user.id)}`);
      const profile = result?.data ?? null;
      const verificationStatus =
        profile?.driver_verification_status ?? profile?.status ?? "not_submitted";
      const isApproved =
        verificationStatus === "approved" || profile?.verified === true;

      setCanGoOnline(isApproved);

      if (!isApproved || profile?.verified === false) {
        setIsOnline(false);
      }
    } catch (error) {
      console.warn("Unable to load driver verification status", error);
    }
  }, [user?.id]);

  const persistDriverStatus = async (nextOnline: boolean, seats = availableSeats) => {
    if (!user?.id || userLatitude == null || userLongitude == null) {
      return;
    }

    if (nextOnline && !canGoOnline) {
      return;
    }

    try {
      await fetchAPI("/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clerkId: user.id,
          is_online: nextOnline,
          car_seats: seats,
          latitude: userLatitude,
          longitude: userLongitude,
          last_location_update: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.warn("Unable to update driver presence", error);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const nextAddress = `${address[0]?.name ?? "Current location"}, ${address[0]?.region ?? ""}`;

      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: nextAddress,
      });
    })();
  }, [setUserLocation]);

  useFocusEffect(
    useCallback(() => {
      void loadDriverProfile();
    }, [loadDriverProfile]),
  );

  useEffect(() => {
    if (!user?.id || userLatitude == null || userLongitude == null) {
      return;
    }

    void persistDriverStatus(isOnline, availableSeats);
  }, [availableSeats, isOnline, user?.id, userLatitude, userLongitude, canGoOnline]);

  const loadIncomingRequests = useCallback(async () => {
    if (!user?.id) return;

    try {
      const result = await fetchAPI(
        `/(api)/driver/requests?clerkId=${encodeURIComponent(user.id)}`,
      );
      const rides = Array.isArray(result?.data) ? result.data : [];
      const latestBooked = [...rides]
        .filter((ride: any) => (ride.status ?? "booked") === "booked")
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )[0] ?? null;

      const activeRide = [...rides]
        .filter(
          (ride: any) =>
            (ride.status ?? "booked") === "accepted" ||
            (ride.status ?? "booked") === "in_progress",
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        )[0] ?? null;

      setIncomingRequest(latestBooked);

      if (!activeRide) {
        setActiveRideLocation(null);
        return;
      }

      await updateActiveRideLocation(activeRide);
    } catch (error) {
      console.warn("Unable to load incoming ride requests", error);
    }
  }, [user?.id, updateActiveRideLocation]);

  useEffect(() => {
    void loadIncomingRequests();
    const interval = setInterval(() => {
      void loadIncomingRequests();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadIncomingRequests]);

  useEffect(() => {
    if (incomingRequest) {
      setShowStatusCard(false);
    }
  }, [incomingRequest]);

  const handleToggleOnline = () => {
    if (!canGoOnline) {
      Alert.alert(
        "Verification required",
        "Your account is not approved to drive yet. Complete verification before going online.",
      );
      return;
    }

    if (isOnline) {
      setIsOnline(false);
      setShowStatusCard(true);
      void persistDriverStatus(false, availableSeats);
      return;
    }

    setIsOnline(true);
    setShowStatusCard(true);
    void persistDriverStatus(true, availableSeats);
  };

  const dismissIncomingRequest = () => {
    Animated.timing(popupTranslateY, {
      toValue: 36,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setIncomingRequest(null);
      popupTranslateY.setValue(0);
    });
  };

  const handleIncomingRequestAction = async (action: "accept" | "decline") => {
    if (!incomingRequest?.ride_id) return;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your driver sign-in has expired. Sign out and sign back in.");
      }
      await fetchAPI(`/(api)/ride/${incomingRequest.ride_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });

      if (action === "accept") {
        const updatedRide = await fetchAPI(`/(api)/ride/${incomingRequest.ride_id}`);
        const ride = updatedRide?.data ?? incomingRequest;
        await updateActiveRideLocation(ride);
      } else {
        setActiveRideLocation(null);
      }

      dismissIncomingRequest();
      await loadIncomingRequests();
    } catch (error) {
      console.warn("Unable to respond to incoming ride request", error);
      Alert.alert(
        "Couldn't update the request",
        error instanceof Error ? error.message : "Please try again in a moment.",
      );
    }
  };

  const handleSeatChange = (nextValue: number) => {
    const safeValue = Math.max(1, nextValue);
    setAvailableSeats(safeValue);
    void persistDriverStatus(isOnline, safeValue);
  };

  const driverName = user?.firstName ? `${user.firstName}` : "Driver";

  return (
    <View className="flex-1 bg-[#F7F4FB]">
      <Map
        passengerLatitude={activeRideLocation?.pickup.latitude ?? null}
        passengerLongitude={activeRideLocation?.pickup.longitude ?? null}
        passengerAddress={activeRideLocation?.pickup.address ?? null}
        dropoffLatitude={activeRideLocation?.destination.latitude ?? null}
        dropoffLongitude={activeRideLocation?.destination.longitude ?? null}
        dropoffAddress={activeRideLocation?.destination.address ?? null}
      />

      {/* Floating Header */}
      <View className="absolute inset-x-0 top-0 z-20 px-4 pt-12">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2.5">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/10">
              <Ionicons name="person" size={22} color="#21152F" />
            </View>
            <View>
              <Text className="text-[10px] font-JakartaBold uppercase tracking-[0.14em] text-[#746A7E]">
                Driver
              </Text>
              <Text className="text-[18px] font-JakartaExtraBold text-[#21152F]">
                {driverName}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/(root)/(tabs)/chat")}
            className="h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/10"
          >
            <Ionicons name="notifications-outline" size={22} color="#21152F" />
          </Pressable>
        </View>

        <View className="mt-4 rounded-[28px] bg-white/95 p-4 shadow-xl shadow-black/10 border border-[#E9E2F0]">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View
                className={`h-2.5 w-2.5 rounded-full ${
                  isOnline ? "bg-[#9D4EDD]" : "bg-[#A69BAF]"
                }`}
              />
              <Text className="text-[11px] font-JakartaBold uppercase tracking-[0.12em] text-[#21152F]">
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>

            <Pressable
              onPress={handleToggleOnline}
              disabled={!canGoOnline}
              className={`rounded-full px-3 py-1.5 ${
                !canGoOnline ? "bg-[#E9E2F0]" : isOnline ? "bg-[#5A189A]" : "bg-[#F0E6FA]"
              }`}
            >
              <Text
                className={`text-[11px] font-JakartaBold ${
                  !canGoOnline ? "text-[#746A7E]" : isOnline ? "text-white" : "text-[#5A189A]"
                }`}
              >
                {!canGoOnline ? "Not approved" : isOnline ? "Available" : "Set online"}
              </Text>
            </Pressable>
          </View>

          <Text className="mt-4 text-[26px] font-JakartaExtraBold leading-[30px] text-[#21152F]">
            {isOnline ? "Ready to drive" : "Take your next trip"}
          </Text>

          <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-[#F7F4FB] px-3 py-2.5 border border-[#E9E2F0]">
            <Ionicons name="location-sharp" size={18} color="#5A189A" />
            <Text className="flex-1 text-[13px] font-JakartaMedium text-[#21152F]" numberOfLines={1}>
              {userAddress ?? "Locating you..."}
            </Text>
          </View>
        </View>
      </View>

      {/* Incoming Request Popup */}
      {incomingRequest && (
        <Animated.View
          className="absolute inset-x-0 bottom-[104px] z-30 px-4"
          style={{ transform: [{ translateY: popupTranslateY }] }}
        >
          <View className="rounded-[28px] bg-white p-4 shadow-2xl shadow-black/20 border border-[#E9E2F0]">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#F0E6FA]">
                  <Ionicons name="person" size={18} color="#5A189A" />
                </View>

                <View>
                  <Text className="text-[12px] font-JakartaBold uppercase tracking-[0.12em] text-[#746A7E]">
                    New request
                  </Text>
                  <Text className="text-[15px] font-JakartaExtraBold text-[#21152F]">
                    {incomingRequest?.passenger?.first_name ?? "Passenger"}
                  </Text>
                </View>
              </View>

              <View className="items-end">
                <Text className="text-[11px] font-JakartaMedium text-[#746A7E]">Trip</Text>
                <Text className="text-[17px] font-JakartaExtraBold text-[#5A189A]">
                  R{((incomingRequest?.fare_price ?? 0) / 100).toFixed(2)}
                </Text>
              </View>
            </View>

            <View className="mt-4 border-t border-[#E9E2F0] pt-3">
              <View className="flex-row items-center gap-3">
                <View className="items-center">
                  <View className="h-3 w-3 rounded-full bg-[#9D4EDD]" />
                  <View className="my-1 h-6 w-[2px] bg-[#E9E2F0]" />
                  <View className="h-3 w-3 rounded-[4px] bg-[#5A189A]" />
                </View>

                <View className="flex-1 gap-3">
                  <View>
                    <Text className="text-[10px] font-JakartaBold uppercase tracking-[0.1em] text-[#746A7E]">
                      Pickup point
                    </Text>
                    <Text className="mt-1 text-[13px] font-JakartaBold text-[#21152F]" numberOfLines={2}>
                      {incomingRequest?.origin_address ?? "Pickup location"}
                    </Text>
                  </View>

                  <View>
                    <Text className="text-[10px] font-JakartaBold uppercase tracking-[0.1em] text-[#746A7E]">
                      Drop off
                    </Text>
                    <Text className="mt-1 text-[13px] font-JakartaBold text-[#21152F]" numberOfLines={2}>
                      {incomingRequest?.destination_address ?? "Destination"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row gap-2">
              <Pressable
                onPress={() => void handleIncomingRequestAction("decline")}
                className="flex-1 rounded-full border border-[#E9E2F0] bg-[#FEF3F3] px-3 py-3"
              >
                <Text className="text-center text-[13px] font-JakartaBold text-[#B02A2A]">
                  Decline
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleIncomingRequestAction("accept")}
                className="flex-1 rounded-full bg-[#5A189A] px-3 py-3"
              >
                <Text className="text-center text-[13px] font-JakartaBold text-white">
                  Accept
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Online Status / Seats Banner */}
      {!incomingRequest && showStatusCard && (
        <View className="absolute inset-x-0 bottom-[104px] z-20 px-4">
          <View className="rounded-[28px] bg-[#1D1135] p-4 shadow-2xl shadow-black/30">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-[10px] font-JakartaBold uppercase tracking-[0.14em] text-[#C77DFF]">
                  Status
                </Text>
                <Text className="mt-1 text-[20px] font-JakartaExtraBold text-white">
                  {isOnline ? "Receiving rides" : "Not taking rides"}
                </Text>
              </View>

              <Pressable
                onPress={() => setShowStatusCard(true)}
                className="flex-row items-center gap-2 rounded-full bg-white/10 px-3 py-2"
              >
                <View className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-[#C77DFF]" : "bg-[#A69BAF]"}`} />
                <Text className="text-[12px] font-JakartaBold text-white">
                  {isOnline ? "Active" : "Offline"}
                </Text>
              </Pressable>
            </View>

            <View className="mt-4 flex-row items-center justify-between rounded-2xl bg-white/10 px-3 py-3">
              <View className="flex-row items-center gap-2">
                <Ionicons name="car-sport" size={18} color="#C77DFF" />
                <Text className="text-[13px] font-JakartaMedium text-[#F0E6FA]">
                  Available seats
                </Text>
              </View>

              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => handleSeatChange(availableSeats - 1)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/10"
                >
                  <Text className="text-[20px] font-JakartaBold text-white">−</Text>
                </Pressable>

                <Text className="min-w-8 text-center text-[16px] font-JakartaBold text-white">
                  {availableSeats}
                </Text>

                <Pressable
                  onPress={() => handleSeatChange(availableSeats + 1)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-white/10"
                >
                  <Text className="text-[20px] font-JakartaBold text-white">+</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default Home;
