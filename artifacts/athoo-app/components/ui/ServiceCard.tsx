import { Icon } from "@/components/ui/Icon";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { useLang } from "@/context/LanguageContext";
import { ServiceCategory } from "@/data/services";

interface ServiceCardProps {
  service: ServiceCategory;
  onPress: () => void;
  size?: "sm" | "md";
}

export function ServiceCard({ service, onPress, size = "md" }: ServiceCardProps) {
  const { isUrdu } = useLang();
  const isSmall = size === "sm";
  const displayName = isUrdu ? service.nameUrdu : service.name;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSmall && styles.cardSm,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconBg, { backgroundColor: service.bgColor }, isSmall && styles.iconBgSm]}>
        <Icon name={service.icon as any} size={isSmall ? 18 : 22} color={service.color} />
      </View>
      <Text style={[styles.name, isSmall && styles.nameSm, isUrdu && styles.urduText]} numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 90,
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    gap: 8,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardSm: { width: 75, padding: 10, borderRadius: 14, gap: 6 },
  pressed: { opacity: 0.8 },
  iconBg: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  iconBgSm: { width: 42, height: 42, borderRadius: 12 },
  name: { fontSize: 11, fontWeight: "600", color: Colors.text, textAlign: "center" },
  nameSm: { fontSize: 10 },
  urduText: { writingDirection: "rtl" },
});

