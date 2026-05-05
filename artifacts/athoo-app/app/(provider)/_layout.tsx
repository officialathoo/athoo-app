import { Stack, router } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { AthooLoader } from "@/components/ui/AthooLoader";

export default function ProviderLayout() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/auth/welcome" as any);
    }
  }, [user, isLoading]);

  if (isLoading) return <AthooLoader />;
  if (!user) return null;

  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="job-detail" />
      <Stack.Screen name="chat-room" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="invoices" />
      <Stack.Screen name="chatbot" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="help" />
      <Stack.Screen name="contact-support" />
      <Stack.Screen name="about" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="negotiations" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="broadcast-jobs" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="pay-commission" />
      <Stack.Screen name="withdrawal-requests" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="subscription" />
      <Stack.Screen name="service-radius" />
      <Stack.Screen name="support-tickets" />
    </Stack>
  );
}

