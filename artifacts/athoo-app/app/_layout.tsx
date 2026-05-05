import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { AthooLoader } from "@/components/ui/AthooLoader";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { BookingProvider } from "@/context/BookingContext";
import { BroadcastProvider } from "@/context/BroadcastContext";
import { CallProvider } from "@/context/CallContext";
import { CategoriesProvider } from "@/context/CategoriesContext";
import { ChatProvider } from "@/context/ChatContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { NegotiationProvider } from "@/context/NegotiationContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ToastProvider } from "@/context/ToastContext";
import { SettingsProvider } from "@/context/SettingsContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function NotificationDeepLinkHandler() {
  useEffect(() => {
    if (Platform.OS === "web") return;

    let Notifications: typeof import("expo-notifications") | null = null;
    let sub: { remove(): void } | null = null;

    (async () => {
      try {
        Notifications = await import("expo-notifications");

        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, any>;
          if (!data) return;

          const broadcastRequestId = data.broadcastRequestId as string | undefined;
          const bookingId = data.bookingId as string | undefined;
          const role = data.role as string | undefined;
          const type = data.type as string | undefined;

          if (broadcastRequestId) {
            if (type === "broadcast" && role !== "provider") {
              router.push({
                pathname: "/(customer)/broadcast-status",
                params: { requestId: broadcastRequestId },
              } as any);
            } else {
              router.push("/(provider)/broadcast-jobs" as any);
            }
            return;
          }

          if (bookingId) {
            if (role === "provider") {
              router.push({
                pathname: "/(provider)/job-detail",
                params: { bookingId },
              } as any);
            } else {
              router.push({
                pathname: "/(customer)/booking-detail",
                params: { bookingId },
              } as any);
            }
            return;
          }

          const link = data.link as string | undefined;
          if (link) {
            if (link.startsWith("/broadcast/")) {
              const reqId = link.replace("/broadcast/", "").split("/")[0];
              if (reqId) {
                router.push({
                  pathname: "/(customer)/broadcast-status",
                  params: { requestId: reqId },
                } as any);
              }
            } else if (link.startsWith("/jobs/")) {
              const jid = link.replace("/jobs/", "").split("/")[0];
              if (jid) {
                router.push({
                  pathname: "/(provider)/job-detail",
                  params: { bookingId: jid },
                } as any);
              }
            }
          }
        });
      } catch {
        // expo-notifications not available (web/bare)
      }
    })();

    return () => {
      sub?.remove();
    };
  }, []);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationDeepLinkHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(provider)" />
        <Stack.Screen name="call" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <AthooLoader />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" translucent backgroundColor="transparent" />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <LanguageProvider>
              <SettingsProvider>
              <ToastProvider>
                <AuthProvider>
                  <CategoriesProvider>
                    <NotificationProvider>
                      <BroadcastProvider>
                        <BookingProvider>
                          <ChatProvider>
                            <NegotiationProvider>
                              <CallProvider>
                                <RootLayoutNav />
                              </CallProvider>
                            </NegotiationProvider>
                          </ChatProvider>
                        </BookingProvider>
                      </BroadcastProvider>
                    </NotificationProvider>
                  </CategoriesProvider>
                </AuthProvider>
              </ToastProvider>
              </SettingsProvider>
            </LanguageProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
