import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { useAuth } from "@clerk/clerk-expo";

import { icons } from "@/constants";
import { ui } from "@/constants/theme";
import { fetchAPI } from "@/lib/fetch";
import { GoogleInputProps } from "@/types/type";

const GoogleTextInput = ({
  icon,
  initialLocation,
  containerStyle,
  textInputBackgroundColor,
  handlePress,
}: GoogleInputProps) => {
  const { getToken } = useAuth();
  const [text, setText] = useState("");
  const [places, setPlaces] = useState<any[]>([]);

  const searchPlaces = async (value: string) => {
    setText(value);

    if (value.length < 3) {
      setPlaces([]);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Your sign-in has expired. Sign in again to search places.");
      }
      const data = await fetchAPI(
        `/(api)/places?text=${encodeURIComponent(value)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data?.data?.features) {
        setPlaces(data.data.features);
      } else {
        setPlaces([]);
      }
    } catch (error) {
      console.warn("Place autocomplete request failed:", error);
      setPlaces([]);
    }
  };

  const handleSelectPlace = (place: any) => {
    const location = place.properties;

    handlePress({
      latitude: location.lat,
      longitude: location.lon,
      address: location.formatted,
    });

    setText(location.formatted);
    setPlaces([]);
  };

  return (
    <View
      className={`w-full rounded-2xl ${
        containerStyle ?? "bg-white"
      } border border-[#E9E2F0]`}
    >
      {/* Search Input */}
      <View
        className="flex-row items-center rounded-2xl px-4"
        style={{
          backgroundColor: textInputBackgroundColor ?? "#FFFFFF",
        }}
      >
        <View className="items-center justify-center">
          <Image
            source={icon ? icon : icons.search}
            className="w-5 h-5"
            resizeMode="contain"
          />
        </View>

        <TextInput
          value={text}
          onChangeText={searchPlaces}
          placeholder={initialLocation ?? "Where do you want to go?"}
          placeholderTextColor={ui.faint}
          className="flex-1 h-[52px] ml-3 text-[15px] font-JakartaSemiBold text-[#21152F]"
        />
      </View>

      {/* Autocomplete Results */}
      {places.length > 0 && (
        <View className="bg-white rounded-2xl mt-2 overflow-hidden border border-[#E9E2F0]">
          {places.map((place, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleSelectPlace(place)}
              className="p-4 border-b border-[#E9E2F0]"
            >
              <Text
                className="text-[#21152F] font-JakartaSemiBold text-[14px]"
                numberOfLines={2}
              >
                {place.properties.formatted}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export default GoogleTextInput;
