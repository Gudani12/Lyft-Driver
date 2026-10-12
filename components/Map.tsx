import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";

let MapView: any = null;
let Marker: any = null;
let Circle: any = null;
let Polyline: any = null;
let PROVIDER_DEFAULT: any = null;

if (Platform.OS !== "web") {
  const reactNativeMaps = require("react-native-maps");
  MapView = reactNativeMaps.default;
  Marker = reactNativeMaps.Marker;
  Circle = reactNativeMaps.Circle;
  Polyline = reactNativeMaps.Polyline;
  PROVIDER_DEFAULT = reactNativeMaps.PROVIDER_DEFAULT;
}

import customMapStyle from "@/constants/mapStyle";
import { brand, ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";
import { calculateRegion, fetchRouteCoordinates } from "@/lib/map";
import { useLocationStore } from "@/store";

type Hub = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
};

export default function Map({
  passengerLatitude,
  passengerLongitude,
  passengerAddress,
  dropoffLatitude,
  dropoffLongitude,
  dropoffAddress,
}: {
  passengerLatitude?: number | null;
  passengerLongitude?: number | null;
  passengerAddress?: string | null;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  dropoffAddress?: string | null;
}) {
  const { getToken } = useAuth();
  const { userLatitude, userLongitude, selectedHubId, setHubPickup } = useLocationStore();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [driverToPickupRoute, setDriverToPickupRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [pickupToDropoffRoute, setPickupToDropoffRoute] = useState<Array<{ latitude: number; longitude: number }>>([]);

  useEffect(() => {
    let ignore = false;

    const loadHubs = async () => {
      try {
        const result = await fetchAPI("/(api)/hubs");
        const nextHubs = Array.isArray(result?.data)
          ? result.data
              .map((hub: Partial<Hub>) => ({
                ...hub,
                latitude: Number(hub.latitude),
                longitude: Number(hub.longitude),
                radius: Number(hub.radius ?? 500),
              }))
              .filter(
                (hub: Partial<Hub>) =>
                  Number.isFinite(hub.latitude) && Number.isFinite(hub.longitude),
              )
          : [];

        if (!ignore) {
          setHubs(nextHubs as Hub[]);
        }
      } catch (error) {
        if (!ignore) {
          setHubs([]);
        }
        console.warn("Unable to load hubs", error);
      }
    };

    void loadHubs();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadRoutes = async () => {
      if (userLatitude == null || userLongitude == null) {
        setDriverToPickupRoute([]);
        setPickupToDropoffRoute([]);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Your sign-in has expired. Sign in again to load routes.");
        }

        const driverToPickup =
          passengerLatitude != null && passengerLongitude != null
            ? await fetchRouteCoordinates({
              originLatitude: userLatitude,
              originLongitude: userLongitude,
              destinationLatitude: passengerLatitude,
              destinationLongitude: passengerLongitude,
              token,
            })
            : [];

        const pickupToDropoff =
          passengerLatitude != null &&
          passengerLongitude != null &&
          dropoffLatitude != null &&
          dropoffLongitude != null
            ? await fetchRouteCoordinates({
              originLatitude: passengerLatitude,
              originLongitude: passengerLongitude,
              destinationLatitude: dropoffLatitude,
              destinationLongitude: dropoffLongitude,
              token,
            })
            : [];

        if (!ignore) {
          setDriverToPickupRoute(driverToPickup);
          setPickupToDropoffRoute(pickupToDropoff);
        }
      } catch (error) {
        console.warn("Unable to load map routes", error);
        if (!ignore) {
          setDriverToPickupRoute([]);
          setPickupToDropoffRoute([]);
        }
      }
    };

    void loadRoutes();

    return () => {
      ignore = true;
    };
  }, [getToken, userLatitude, userLongitude, passengerLatitude, passengerLongitude, dropoffLatitude, dropoffLongitude]);

  const region = calculateRegion({
    userLatitude,
    userLongitude,
    destinationLatitude: dropoffLatitude ?? passengerLatitude ?? null,
    destinationLongitude: dropoffLongitude ?? passengerLongitude ?? null,
  });

  if (Platform.OS === "web" || !MapView || !Marker || !Circle || !Polyline) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F7F4FB] px-6">
        <Text className="text-center text-[13px] font-Jakarta text-[#5A189A]">
          Map preview is available on mobile. Your trip details are still available below.
        </Text>
      </View>
    );
  }

  if (userLatitude == null || userLongitude == null) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F7F4FB]">
        <ActivityIndicator size="large" color="#5A189A" />
      </View>
    );
  }

  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={{ flex: 1 }}
      initialRegion={region}
      followsUserLocation
      showsCompass={false}
      showsMyLocationButton={false}
      customMapStyle={customMapStyle}
      mapType="standard"
      userInterfaceStyle="light"
    >
      {/* User location ring (kept green as in passenger app) */}
      <Circle
        center={{ latitude: userLatitude, longitude: userLongitude }}
        radius={180}
        strokeColor="rgba(31,165,116,0.35)"
        strokeWidth={1}
        fillColor="rgba(31,165,116,0.18)"
      />

      {hubs.map((hub) => (
        <React.Fragment key={hub.id}>
          <Circle
            center={{ latitude: hub.latitude, longitude: hub.longitude }}
            radius={hub.radius}
            fillColor="rgba(157, 78, 221, 0.12)"
            strokeColor="#9D4EDD"
            strokeWidth={2}
          />
          <Marker
            testID={`hub-marker-${hub.id}`}
            coordinate={{ latitude: hub.latitude, longitude: hub.longitude }}
            title={hub.name}
            description={hub.address}
            pinColor={selectedHubId === hub.id ? "#9D4EDD" : "#5A189A"}
            onPress={() =>
              setHubPickup?.({
                id: hub.id,
                name: hub.name,
                latitude: hub.latitude,
                longitude: hub.longitude,
                address: hub.address,
              })
            }
          />
        </React.Fragment>
      ))}

      {driverToPickupRoute.length > 1 && (
        <Polyline
          coordinates={driverToPickupRoute}
          strokeColor="#9D4EDD"
          strokeWidth={4}
          lineDashPattern={[]}
        />
      )}

      {pickupToDropoffRoute.length > 1 && (
        <Polyline
          coordinates={pickupToDropoffRoute}
          strokeColor="#E0575B"
          strokeWidth={5}
          lineDashPattern={[]}
        />
      )}

      <Marker
        coordinate={{
          latitude: userLatitude,
          longitude: userLongitude,
        }}
        title="Your location"
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#9D4EDD",
            borderWidth: 4,
            borderColor: "#F0E6FA",
            shadowColor: "#1D1135",
            shadowOpacity: 0.35,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          }}
        />
      </Marker>

      {passengerLatitude != null && passengerLongitude != null && (
        <Marker
          coordinate={{
            latitude: passengerLatitude,
            longitude: passengerLongitude,
          }}
          title={passengerAddress ?? "Passenger pickup"}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "#9D4EDD",
              borderWidth: 3,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#9D4EDD",
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <Ionicons name="person" size={16} color="#FFFFFF" />
          </View>
        </Marker>
      )}

      {dropoffLatitude != null && dropoffLongitude != null && (
        <Marker
          coordinate={{
            latitude: dropoffLatitude,
            longitude: dropoffLongitude,
          }}
          title={dropoffAddress ?? "Drop-off location"}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: "#5A189A",
              borderWidth: 3,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#5A189A",
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <Ionicons name="location-sharp" size={15} color="#FFFFFF" />
          </View>
        </Marker>
      )}
    </MapView>
  );
}
