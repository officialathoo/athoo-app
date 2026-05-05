import { Icon } from "@/components/ui/Icon";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useLang } from "@/context/LanguageContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useNotifications } from "@/context/NotificationContext";
import { useBroadcast } from "@/context/BroadcastContext";
import { notificationService } from "@/services/NotificationService";
import { soundService } from "@/services/SoundService";

function NegotiationAlertHandler() {
  const { pendingAlerts, consumeNegAlerts } = useNegotiation();
  const { push } = useNotifications();

  useEffect(() => {
    if (pendingAlerts.length === 0) return;
    const alerts = consumeNegAlerts();
    for (const alert of alerts) {
      push({
        type: "negotiation",
        title: alert.title,
        message: alert.message,
        role: "provider",
        negotiationId: alert.negotiation.id,
      });
      notificationService.scheduleStatusAlert(alert.title, alert.message).catch(() => {});
      soundService.playNotification().catch(() => {});
    }
  }, [pendingAlerts]);

  return null;
}

function BroadcastBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

export default function ProviderTabLayout() {
  const { t } = useLang();
  const { openBroadcastCount } = useBroadcast();
  const insets = useSafeAreaInsets();
  const tabHeight = Platform.OS === "web" ? 84 : 56 + insets.bottom;
  const tabPadBottom = Platform.OS === "web" ? 20 : insets.bottom + 4;

  return (
    <>
      <NegotiationAlertHandler />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors.secondary,
          tabBarInactiveTintColor: Colors.textMuted,
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.white,
            borderTopWidth: 0,
            height: tabHeight,
            paddingBottom: tabPadBottom,
            paddingTop: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            elevation: 15,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "600",
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: t.dashboard,
            tabBarIcon: ({ color, focused }) => (
              <View style={[focused ? styles.activeTab : undefined, styles.iconWrap]}>
                <Icon name="grid" size={22} color={color} />
                {openBroadcastCount > 0 && (
                  <BroadcastBadge count={openBroadcastCount} />
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: t.jobs,
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeTab : undefined}>
                <Icon name="briefcase" size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: "Earnings",
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeTab : undefined}>
                <Icon name="dollar-sign" size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: t.chat,
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeTab : undefined}>
                <Icon name="message-circle" size={22} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t.profile,
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeTab : undefined}>
                <Icon name="user" size={22} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  activeTab: {
    backgroundColor: Colors.secondary + "20",
    width: 44,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 32,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: Colors.secondary,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
  },
});
