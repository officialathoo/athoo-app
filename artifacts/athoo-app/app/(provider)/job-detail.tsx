import { Icon } from "@/components/ui/Icon";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { useNotifications } from "@/context/NotificationContext";
import { api } from "@/services/api";
import { getDistanceKm } from "@/utils/distance";

type LiveCoords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt?: string;
};

function formatElapsed(startedAt?: string) {
  if (!startedAt) return "00:00";

  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );

  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;

  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, "0")}m ${s
      .toString()
      .padStart(2, "0")}s`;
  }

  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isValidLatLng(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBookingLatLng(booking: any) {
  const latCandidates = [
    booking?.customerLat,
    booking?.customerLatitude,
    booking?.lat,
    booking?.latitude,
    booking?.pickedLat,
  ];

  const lngCandidates = [
    booking?.customerLng,
    booking?.customerLongitude,
    booking?.lng,
    booking?.longitude,
    booking?.pickedLng,
  ];

  const lat = latCandidates.map(toNumber).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toNumber).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidLatLng(lat, lng)) {
    return { lat: lat as number, lng: lng as number };
  }

  return null;
}

function getProviderLatLng(booking: any) {
  const latCandidates = [
    booking?.providerLat,
    booking?.providerLatitude,
    booking?.liveProviderLat,
    booking?.currentProviderLat,
    booking?.workerLat,
  ];

  const lngCandidates = [
    booking?.providerLng,
    booking?.providerLongitude,
    booking?.liveProviderLng,
    booking?.currentProviderLng,
    booking?.workerLng,
  ];

  const lat = latCandidates.map(toNumber).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toNumber).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidLatLng(lat, lng)) {
    return { latitude: lat as number, longitude: lng as number };
  }

  return null;
}

function formatLastUpdated(updatedAt?: string) {
  if (!updatedAt) return "Not synced yet";
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return "Not synced yet";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function openCoordsInMaps(latitude: number, longitude: number, label?: string) {
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const appleUrl = `http://maps.apple.com/?ll=${latitude},${longitude}&q=${encodeURIComponent(
    label || `${latitude},${longitude}`
  )}`;
  const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}`;

  try {
    if (Platform.OS === "android") {
      const canOpenGeo = await Linking.canOpenURL(geoUrl);
      if (canOpenGeo) {
        await Linking.openURL(geoUrl);
        return;
      }
    }

    if (Platform.OS === "ios") {
      const canOpenApple = await Linking.canOpenURL(appleUrl);
      if (canOpenApple) {
        await Linking.openURL(appleUrl);
        return;
      }
    }

    await Linking.openURL(googleUrl);
  } catch {
    Alert.alert("Unable to Open Maps", "Could not open the location in maps.");
  }
}

export default function JobDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useAuth();
  const { bookings, updateBookingStatus, loadBookings } = useBookings();
  const { getOrCreateChat } = useChat();
  const { startOutgoingCall } = useCall();
  const { addNotification } = useNotifications();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [showArriveOtp, setShowArriveOtp] = useState(false);
  const [showCompleteOtp, setShowCompleteOtp] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGenCompletePin, setIsGenCompletePin] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isLoadingBooking, setIsLoadingBooking] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [isMarkingReceived, setIsMarkingReceived] = useState(false);

  const [providerLiveCoords, setProviderLiveCoords] = useState<LiveCoords | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [liveSyncing, setLiveSyncing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<TextInput>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

  const syncBooking = useCallback(
    async (preferred?: Booking | null) => {
      if (preferred) {
        setBooking(preferred);
        const existingProviderCoords = getProviderLatLng(preferred);
        if (existingProviderCoords) {
          setProviderLiveCoords((prev) => ({
            latitude: existingProviderCoords.latitude,
            longitude: existingProviderCoords.longitude,
            accuracy: prev?.accuracy ?? null,
            updatedAt: (preferred as any)?.providerUpdatedAt || prev?.updatedAt || new Date().toISOString(),
          }));
        }
        return;
      }

      if (!bookingId) return;
      setIsLoadingBooking(true);
      try {
        const res = await api.getBooking(String(bookingId));
        const fresh = res.booking as Booking;
        setBooking(fresh);

        const existingProviderCoords = getProviderLatLng(fresh);
        if (existingProviderCoords) {
          setProviderLiveCoords((prev) => ({
            latitude: existingProviderCoords.latitude,
            longitude: existingProviderCoords.longitude,
            accuracy: prev?.accuracy ?? null,
            updatedAt: (fresh as any)?.providerUpdatedAt || prev?.updatedAt || new Date().toISOString(),
          }));
        }
      } catch (e) {
        // silent fail — booking stays in last known state
      } finally {
        setIsLoadingBooking(false);
      }
    },
    [bookingId]
  );


  useEffect(() => {
    const foundBooking = bookings.find((item) => item.id === bookingId);
    if (foundBooking) {
      syncBooking(foundBooking);
    } else if (bookingId) {
      syncBooking();
    }
  }, [bookings, bookingId, syncBooking]);

  useEffect(() => {
    if (!bookingId) return;

    const tick = () => {
      if (AppState.currentState === "active") {
        loadBookings();
      }
    };

    pollRef.current = setInterval(tick, 15000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [bookingId, loadBookings]);

  useFocusEffect(
    useCallback(() => {
      loadBookings();
      syncBooking();
      return undefined;
    }, [loadBookings, syncBooking])
  );

  useEffect(() => {
    if (showArriveOtp || showCompleteOtp) {
      setOtpInput("");
      setOtpError("");

      setTimeout(() => {
        otpInputRef.current?.focus();

        if (Platform.OS === "android") {
          Keyboard.dismiss();
        }

        setTimeout(() => otpInputRef.current?.focus(), 150);
      }, 100);
    }
  }, [showArriveOtp, showCompleteOtp]);

  useEffect(() => {
    if (booking?.status === "in_progress" && booking.jobStartedAt) {
      setElapsed(formatElapsed(booking.jobStartedAt));

      timerRef.current = setInterval(() => {
        setElapsed(formatElapsed(booking.jobStartedAt));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [booking?.status, booking?.jobStartedAt]);

  const shouldTrackLive =
    booking?.status === "accepted" || booking?.status === "in_progress";

  const syncProviderLocationToBackend = async (
    currentBookingId: string,
    coords: LiveCoords
  ) => {
    try {
      await api.updateBookingLiveLocation(currentBookingId, {
        providerLat: coords.latitude,
        providerLng: coords.longitude,
        providerAccuracy: coords.accuracy ?? null,
        providerUpdatedAt: coords.updatedAt,
      });
    } catch {
      // silent fail — retry on next interval
    }
  };

  useEffect(() => {
    let mounted = true;

    const startLiveTracking = async () => {
      if (!shouldTrackLive || !booking?.id || Platform.OS === "web") {
        if (locationSubRef.current) {
          locationSubRef.current.remove();
          locationSubRef.current = null;
        }
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;

        if (status !== "granted") {
          setLocationPermission("denied");
          Alert.alert(
            "Location Access Needed",
            "Enable location in your device Settings so customers can track your arrival.",
            [
              { text: "Not Now", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }

        setLocationPermission("granted");

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const firstCoords: LiveCoords = {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          accuracy: initial.coords.accuracy,
          updatedAt: new Date().toISOString(),
        };

        setProviderLiveCoords(firstCoords);
        setLiveSyncing(true);
        await syncProviderLocationToBackend(booking.id, firstCoords);
        setLiveSyncing(false);

        if (locationSubRef.current) {
          locationSubRef.current.remove();
          locationSubRef.current = null;
        }

        locationSubRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          async (position) => {
            const nextCoords: LiveCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              updatedAt: new Date().toISOString(),
            };

            setProviderLiveCoords(nextCoords);
            setLiveSyncing(true);
            await syncProviderLocationToBackend(booking.id, nextCoords);
            setLiveSyncing(false);
          }
        );
      } catch (e) {
        // silent fail — tracking skipped until next mount
      }
    };

    startLiveTracking();

    return () => {
      mounted = false;
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    };
  }, [shouldTrackLive, booking?.id]);

  const customerCoords = useMemo(() => {
    if (!booking) return null;
    return getBookingLatLng(booking);
  }, [booking]);

  const providerCoords = useMemo((): LiveCoords | null => {
    if (providerLiveCoords) return providerLiveCoords;
    if (!booking) return null;
    const staticCoords = getProviderLatLng(booking);
    if (!staticCoords) return null;
    return {
      latitude: staticCoords.latitude,
      longitude: staticCoords.longitude,
      accuracy: null,
      updatedAt: undefined,
    };
  }, [providerLiveCoords, booking]);

  const providerDistanceKm = useMemo(() => {
    if (!customerCoords || !providerCoords) return null;
    return getDistanceKm(
      customerCoords.lat,
      customerCoords.lng,
      providerCoords.latitude,
      providerCoords.longitude
    );
  }, [customerCoords, providerCoords]);

  const handleOpenLocation = async () => {
    if (!booking) return;

    const coords = getBookingLatLng(booking);
    const address = booking.address?.trim();

    try {
      if (coords) {
        const { lat, lng } = coords;

        const googleUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        const appleUrl = `http://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
        const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}`;

        if (Platform.OS === "android") {
          const canOpenGeo = await Linking.canOpenURL(geoUrl);
          if (canOpenGeo) {
            await Linking.openURL(geoUrl);
            return;
          }
        }

        if (Platform.OS === "ios") {
          const canOpenApple = await Linking.canOpenURL(appleUrl);
          if (canOpenApple) {
            await Linking.openURL(appleUrl);
            return;
          }
        }

        await Linking.openURL(googleUrl);
        return;
      }

      if (address) {
        const encoded = encodeURIComponent(address);
        const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
        const appleUrl = `http://maps.apple.com/?q=${encoded}`;
        const geoUrl = `geo:0,0?q=${encoded}`;

        if (Platform.OS === "android") {
          const canOpenGeo = await Linking.canOpenURL(geoUrl);
          if (canOpenGeo) {
            await Linking.openURL(geoUrl);
            return;
          }
        }

        if (Platform.OS === "ios") {
          const canOpenApple = await Linking.canOpenURL(appleUrl);
          if (canOpenApple) {
            await Linking.openURL(appleUrl);
            return;
          }
        }

        await Linking.openURL(googleUrl);
        return;
      }

      Alert.alert("Location Missing", "Customer location is not available for this booking.");
    } catch {
      Alert.alert("Unable to Open Maps", "Could not open the location in maps.");
    }
  };

  const handleOpenMyLiveLocation = async () => {
    if (!providerCoords) {
      Alert.alert("Location Unavailable", "Your current live location is not available yet.");
      return;
    }

    await openCoordsInMaps(
      providerCoords.latitude,
      providerCoords.longitude,
      "My Live Location"
    );
  };

  const handleAccept = () => {
    if (!booking) return;

    Alert.alert("Accept Job", "Accept this booking?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Accept",
        onPress: async () => {
          try {
            setIsAccepting(true);
            const res = await api.updateBookingStatus(booking.id, "accepted");
            const updated = res.booking as Booking;
            await loadBookings();
            await syncBooking(updated);

            addNotification({
              type: "booking",
              title: "Booking Accepted",
              body: `${
                booking.providerName || user?.name || "Provider"
              } accepted your booking for ${booking.service}.`,
              data: {
                role: "customer",
                bookingId: booking.id,
              },
            });
          } catch (e: any) {
            Alert.alert("Unable to Accept", e?.message || "Could not accept this booking.");
          } finally {
            setIsAccepting(false);
          }
        },
      },
    ]);
  };

  const handleDecline = () => {
    if (!booking) return;

    Alert.alert("Decline Job", "Decline this booking?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            setIsDeclining(true);
            await updateBookingStatus(booking.id, "cancelled");
            await loadBookings();
            router.back();
          } catch (e: any) {
            Alert.alert("Unable to Decline", e?.message || "Could not decline this booking.");
          } finally {
            setIsDeclining(false);
          }
        },
      },
    ]);
  };

  const handleArrived = async () => {
    if (!booking) return;

    try {
      await api.markProviderArrived(booking.id);
      const res = await api.generateStartPin(booking.id);
      const updated = res.booking as Booking;
      await syncBooking(updated);
      await loadBookings();
      setShowArriveOtp(true);
    } catch (e: any) {
      Alert.alert(
        "Start Code Error",
        e?.message || "Could not prepare the start code for this booking."
      );
    }
  };

  const handleVerifyArriveOtp = async () => {
    if (!booking) return;

    if (otpInput.length < 4) {
      setOtpError("Enter the 4-digit code from the customer");
      return;
    }

    setIsVerifying(true);
    setOtpError("");

    try {
      const res = await api.verifyStartPin(booking.id, otpInput);
      const updated = res.booking as Booking;

      setBooking(updated);
      setShowArriveOtp(false);
      setOtpInput("");

      await loadBookings();
      await syncBooking(updated);

      addNotification({
        type: "system",
        title: "Job Started",
        body: `${booking.service} has started at your location.`,
        data: {
          role: "customer",
          bookingId: booking.id,
        },
      });
    } catch (e: any) {
      setOtpError(
        e?.message || "Incorrect PIN. Ask the customer for the correct code."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRequestComplete = async () => {
    if (!booking) return;

    setIsGenCompletePin(true);

    try {
      const res = await api.generateCompletePin(booking.id);
      const updated = res.booking as Booking;

      setBooking(updated);
      await loadBookings();
      await syncBooking(updated);

      setOtpInput("");
      setOtpError("");
      setShowCompleteOtp(true);
    } catch {
      Alert.alert("Error", "Failed to generate completion PIN");
    } finally {
      setIsGenCompletePin(false);
    }
  };

  const handleVerifyCompleteOtp = async () => {
    if (!booking) return;

    if (otpInput.length < 4) {
      setOtpError("Enter the 4-digit code from the customer");
      return;
    }

    setIsVerifying(true);
    setOtpError("");

    try {
      const res = await api.verifyCompletePin(booking.id, otpInput);
      const updated = res.booking as Booking;

      setBooking(updated);
      setShowCompleteOtp(false);
      setOtpInput("");

      await loadBookings();
      await syncBooking(updated);

      addNotification({
        type: "success",
        title: "Job Completed",
        body: `${booking.service} has been completed successfully.`,
        data: {
          role: "customer",
          bookingId: booking.id,
        },
      });
    } catch (e: any) {
      setOtpError(
        e?.message || "Incorrect PIN. Ask the customer for the correct code."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!booking) return;
    setIsMarkingReceived(true);
    try {
      const res = await api.markBookingReceived(booking.id);
      const updated = res.booking as Booking;
      setBooking(updated);
      await loadBookings();
      setShowInvoiceModal(false);
      addNotification({
        type: "success",
        title: "Cash Received",
        body: `You've confirmed receiving Rs. ${(booking.price || 0) + ((booking as any).visitCharge ?? 200)} for ${booking.service}.`,
        data: { role: "provider", bookingId: booking.id },
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not mark as received. Try again.");
    } finally {
      setIsMarkingReceived(false);
    }
  };

  const handleChat = async () => {
    if (!user || !booking) return;

    const chat = await getOrCreateChat(
      user.id,
      user.name,
      booking.customerId,
      booking.customerName,
      booking.id,
      booking.service
    );

    router.push({
      pathname: "/(provider)/chat-room",
      params: {
        chatId: chat.id,
        otherUserId: booking.customerId,
        otherUserName: booking.customerName,
        otherUserImage: booking.customerProfileImage || undefined,
        otherUserColor: undefined,
      },
    });
  };

  const handleCall = async () => {
    if (!booking || !user) return;

    await startOutgoingCall(
      booking.customerId,
      booking.customerName,
      booking.service,
      "#FF6B1A"
    );
  };

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.notFound}>
          {isLoadingBooking ? <ActivityIndicator size="large" color={Colors.primary} /> : null}
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const STATUS_CONFIG = {
    pending: { label: "Pending", color: "#F59E0B", bg: "#FFFBEB" },
    accepted: { label: "Accepted", color: "#3B82F6", bg: "#EFF6FF" },
    in_progress: { label: "In Progress", color: "#8B5CF6", bg: "#F5F3FF" },
    completed: { label: "Completed", color: "#22C55E", bg: "#F0FDF4" },
    cancelled: { label: "Cancelled", color: "#EF4444", bg: "#FEF2F2" },
  } as const;

  const status =
    STATUS_CONFIG[booking.status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.pending;

  const VISIT_CHARGE = (booking as any).visitCharge ?? 200;
  const hourlyRate = booking.price ? Math.round(booking.price) : 500;
  const jobStarted = booking.jobStartedAt ? new Date(booking.jobStartedAt) : null;
  const elapsedMinutes = jobStarted
    ? Math.ceil((Date.now() - jobStarted.getTime()) / 60000)
    : 0;
  const timeCharge = Math.round((elapsedMinutes / 60) * hourlyRate);
  const totalAmount = VISIT_CHARGE + timeCharge;
  const hasLocation = !!getBookingLatLng(booking) || !!booking.address?.trim();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>

          <Text style={styles.title}>Job Details</Text>

          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.serviceRow}>
              <View style={styles.serviceIcon}>
                <Icon
                  name={booking.serviceIcon as any}
                  size={24}
                  color={Colors.secondary}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{booking.service}</Text>
                <Text style={styles.bookingId}>
                  Job #{booking.id.slice(-6).toUpperCase()}
                </Text>
              </View>

              {booking.status !== "pending" &&
              booking.status !== "completed" &&
              booking.status !== "cancelled" ? (
                <Pressable style={styles.chatBtn} onPress={handleChat}>
                  <Icon name="message-circle" size={18} color={Colors.secondary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Customer</Text>

            <View style={styles.customerRow}>
              <View style={styles.custAvatar}>
                <Text style={styles.custAvatarTxt}>
                  {booking.customerName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.custName}>{booking.customerName}</Text>
                <Text style={styles.custPhone}>via in-app chat & call</Text>
              </View>

              {booking.status !== "pending" &&
              booking.status !== "completed" &&
              booking.status !== "cancelled" ? (
                <Pressable style={styles.callBtn} onPress={handleCall}>
                  <Icon name="phone" size={16} color="#22C55E" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {shouldTrackLive && (
            <View style={styles.card}>
              <View style={styles.liveHeader}>
                <Text style={styles.cardTitle}>Live Provider Tracking</Text>
                <View style={styles.liveBadge}>
                  <View
                    style={[
                      styles.liveBadgeDot,
                      {
                        backgroundColor:
                          locationPermission === "granted" ? "#22C55E" : "#F59E0B",
                      },
                    ]}
                  />
                  <Text style={styles.liveBadgeText}>
                    {locationPermission === "granted"
                      ? liveSyncing
                        ? "Syncing"
                        : "Sharing"
                      : locationPermission === "denied"
                      ? "Permission needed"
                      : "Waiting"}
                  </Text>
                </View>
              </View>

              <View style={styles.liveInfoRow}>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Provider GPS</Text>
                  <Text style={styles.liveInfoValue}>
                    {providerCoords
                      ? `${providerCoords.latitude.toFixed(5)}, ${providerCoords.longitude.toFixed(5)}`
                      : "Not available"}
                  </Text>
                </View>

                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Distance</Text>
                  <Text style={styles.liveInfoValue}>
                    {providerDistanceKm != null ? `${providerDistanceKm.toFixed(1)} km` : "--"}
                  </Text>
                </View>
              </View>

              <View style={styles.liveInfoRow}>
                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Last Sync</Text>
                  <Text style={styles.liveInfoValue}>
                    {formatLastUpdated(providerCoords?.updatedAt)}
                  </Text>
                </View>

                <View style={styles.liveInfoBox}>
                  <Text style={styles.liveInfoLabel}>Accuracy</Text>
                  <Text style={styles.liveInfoValue}>
                    {providerCoords?.accuracy != null
                      ? `${Math.round(providerCoords.accuracy)} m`
                      : "--"}
                  </Text>
                </View>
              </View>

              <View style={styles.liveActionRow}>
                <Pressable style={styles.liveActionBtn} onPress={handleOpenMyLiveLocation}>
                  <Icon name="navigation" size={15} color={Colors.primary} />
                  <Text style={styles.liveActionText}>Open My Location</Text>
                </Pressable>

                <Pressable style={styles.liveActionBtn} onPress={handleOpenLocation}>
                  <Icon name="map-pin" size={15} color={Colors.primary} />
                  <Text style={styles.liveActionText}>Open Customer</Text>
                </Pressable>
              </View>

              <Text style={styles.liveHint}>
                While this job is accepted or in progress, your phone shares live GPS
                updates. Customer tracking will work when your backend saves these
                coordinates in the booking record.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Job Info</Text>

            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <Icon name="calendar" size={15} color={Colors.secondary} />
                <Text style={styles.infoLabel}>Date</Text>
                <Text style={styles.infoVal}>{booking.scheduledDate}</Text>
              </View>

              <View style={styles.infoRow}>
                <Icon name="clock" size={15} color={Colors.secondary} />
                <Text style={styles.infoLabel}>Time</Text>
                <Text style={styles.infoVal}>{booking.scheduledTime}</Text>
              </View>

              <View style={styles.infoRow}>
                <Icon name="map-pin" size={15} color={Colors.secondary} />
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoVal} numberOfLines={2}>
                  {booking.address}
                </Text>
              </View>

              {booking.price ? (
                <View style={styles.infoRow}>
                  <Icon name="tag" size={15} color={Colors.secondary} />
                  <Text style={styles.infoLabel}>Price</Text>
                  <Text style={styles.infoVal}>Rs. {booking.price}</Text>
                </View>
              ) : null}

              {booking.description ? (
                <View style={styles.infoRow}>
                  <Icon name="file-text" size={15} color={Colors.secondary} />
                  <Text style={styles.infoLabel}>Details</Text>
                  <Text style={styles.infoVal}>{booking.description}</Text>
                </View>
              ) : null}
            </View>

            {hasLocation ? (
              <Pressable style={styles.locationBtn} onPress={handleOpenLocation}>
                <Icon name="navigation" size={16} color={Colors.primary} />
                <Text style={styles.locationBtnText}>Open Customer Location</Text>
              </Pressable>
            ) : null}

            {booking.attachment ? (
              <View style={{ marginTop: 14 }}>
                <View style={styles.photoLabelRow}>
                  <Icon name="image" size={15} color={Colors.secondary} />
                  <Text style={styles.photoLabel}>Customer&apos;s Photo</Text>
                </View>

                <Image
                  source={{ uri: `data:image/jpeg;base64,${booking.attachment}` }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                />
              </View>
            ) : null}
          </View>

          {booking.status === "in_progress" ? (
            <View style={styles.timerCard}>
              <View style={styles.timerHeader}>
                <View style={styles.timerLiveDot} />
                <Text style={styles.timerLiveText}>LIVE TIMER</Text>
              </View>

              <Text style={styles.timerDisplay}>{elapsed}</Text>

              <View style={styles.billingRow}>
                <View style={styles.billingItem}>
                  <Text style={styles.billingLabel}>Visit</Text>
                  <Text
                    style={[styles.billingVal, { color: Colors.secondary }]}
                  >
                    Rs. {VISIT_CHARGE}
                  </Text>
                </View>

                <View style={styles.billingDivider} />

                <View style={styles.billingItem}>
                  <Text style={styles.billingLabel}>Time ({elapsedMinutes}m)</Text>
                  <Text style={[styles.billingVal, { color: Colors.primary }]}>
                    Rs. {timeCharge}
                  </Text>
                </View>

                <View style={styles.billingDivider} />

                <View style={styles.billingItem}>
                  <Text
                    style={[styles.billingVal, { color: "#22C55E", fontSize: 18 }]}
                  >
                    Rs. {totalAmount}
                  </Text>
                  <Text style={styles.billingLabel}>Total</Text>
                </View>
              </View>
            </View>
          ) : null}

          {booking.status === "pending" ? (
            <View style={styles.actionRowWrap}>
              <Button
                title={isDeclining ? "Please wait..." : "Decline"}
                variant="outline"
                onPress={handleDecline}
                disabled={isAccepting || isDeclining}
                style={{ flex: 1 }}
              />
              <Button
                title={isAccepting ? "Please wait..." : "Accept Job"}
                onPress={handleAccept}
                disabled={isAccepting || isDeclining}
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          {booking.status === "accepted" ? (
            <View style={styles.arrivedSection}>
              <View style={styles.otpInfo}>
                <Icon name="shield" size={16} color={Colors.primary} />
                <Text style={styles.otpInfoText}>
                  Ask the customer for their 4-digit start code, then enter it to
                  begin the job.
                </Text>
              </View>

              <Button
                title={isAccepting ? "Please wait..." : "I've Arrived – Enter Start Code"}
                onPress={handleArrived}
                disabled={isAccepting}
                fullWidth
              />
            </View>
          ) : null}

          {booking.status === "in_progress" ? (
            <View style={styles.arrivedSection}>
              <View style={styles.otpInfo}>
                <Icon name="shield" size={16} color="#22C55E" />
                <Text style={[styles.otpInfoText, { color: "#16A34A" }]}>
                  Job in progress. When done, get the completion code from the
                  customer.
                </Text>
              </View>

              <Button
                title={
                  isGenCompletePin
                    ? "Please wait..."
                    : "Job Done – Enter Completion Code"
                }
                onPress={handleRequestComplete}
                disabled={isGenCompletePin}
                fullWidth
              />
            </View>
          ) : null}

          {booking.status === "completed" ? (
            <View style={styles.completedBox}>
              <Icon name="check-circle" size={32} color="#22C55E" style={{ alignSelf: "center" } as any} />
              <Text style={styles.completedTitle}>Job Completed!</Text>
              <Text style={styles.completedText}>Great work! This job has been marked as complete.</Text>

              <View style={styles.invoiceSummaryRow}>
                <View style={styles.invoiceSummaryItem}>
                  <Text style={styles.invoiceSummaryLabel}>Service Charge</Text>
                  <Text style={styles.invoiceSummaryValue}>Rs. {(booking.price || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.invoiceSummaryItem}>
                  <Text style={styles.invoiceSummaryLabel}>Visit Charge</Text>
                  <Text style={styles.invoiceSummaryValue}>Rs. {VISIT_CHARGE}</Text>
                </View>
                <View style={[styles.invoiceSummaryItem, styles.invoiceTotalItem]}>
                  <Text style={styles.invoiceTotalLabel}>Total to Collect</Text>
                  <Text style={styles.invoiceTotalValue}>Rs. {((booking.price || 0) + VISIT_CHARGE).toLocaleString()}</Text>
                </View>
              </View>

              {booking.paymentStatus === "received" ? (
                <View style={styles.paymentConfirmedBadge}>
                  <Icon name="check-circle" size={16} color="#16A34A" />
                  <Text style={styles.paymentConfirmedText}>Cash Received ✓</Text>
                </View>
              ) : (
                <Button
                  title={isMarkingReceived ? "Confirming..." : "Mark Cash as Received"}
                  onPress={handleMarkReceived}
                  loading={isMarkingReceived}
                  fullWidth
                  style={{ marginTop: 4 }}
                />
              )}

              <Button
                title="View Full Invoice"
                onPress={() => setShowInvoiceModal(true)}
                variant="outline"
                fullWidth
                style={{ marginTop: 4 }}
              />
            </View>
          ) : null}
        </ScrollView>

        {/* ── Invoice / Job Summary Modal ── */}
        <Modal visible={showInvoiceModal} animationType="slide" transparent onRequestClose={() => setShowInvoiceModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: "85%" }]}>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: "#DCFCE7" }]}>
                  <Icon name="file-text" size={22} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Job Invoice</Text>
                  <Text style={styles.modalSubtitle}>{booking?.service} · {booking?.scheduledDate}</Text>
                </View>
                <Pressable onPress={() => setShowInvoiceModal(false)}>
                  <Icon name="x" size={22} color={Colors.text} />
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Customer</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.customerName}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Phone</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.customerPhone}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Address</Text>
                  <Text style={[styles.invoiceModalValue, { flex: 1, textAlign: "right" }]}>{booking?.address}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Scheduled</Text>
                  <Text style={styles.invoiceModalValue}>{booking?.scheduledDate} at {booking?.scheduledTime}</Text>
                </View>
                <View style={[styles.invoiceModalRow, { marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }]}>
                  <Text style={styles.invoiceModalLabel}>Service Charge</Text>
                  <Text style={styles.invoiceModalValue}>Rs. {(booking?.price || 0).toLocaleString()}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Visit Charge</Text>
                  <Text style={styles.invoiceModalValue}>Rs. {VISIT_CHARGE}</Text>
                </View>
                <View style={[styles.invoiceModalRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.invoiceModalLabel, { fontWeight: "800", fontSize: 15 }]}>Total Amount</Text>
                  <Text style={[styles.invoiceModalValue, { fontWeight: "900", fontSize: 17, color: Colors.primary }]}>
                    Rs. {((booking?.price || 0) + VISIT_CHARGE).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={styles.invoiceModalLabel}>Platform Commission</Text>
                  <Text style={[styles.invoiceModalValue, { color: "#EF4444" }]}>- Rs. {booking?.commissionAmount || 0}</Text>
                </View>
                <View style={styles.invoiceModalRow}>
                  <Text style={[styles.invoiceModalLabel, { fontWeight: "700" }]}>Your Earnings</Text>
                  <Text style={[styles.invoiceModalValue, { fontWeight: "800", color: "#16A34A" }]}>
                    Rs. {((booking?.price || 0) + VISIT_CHARGE - (booking?.commissionAmount || 0)).toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 16, gap: 8 }}>
                {booking?.paymentStatus === "received" ? (
                  <View style={[styles.paymentConfirmedBadge, { marginTop: 0 }]}>
                    <Icon name="check-circle" size={16} color="#16A34A" />
                    <Text style={styles.paymentConfirmedText}>Cash Confirmed as Received</Text>
                  </View>
                ) : (
                  <Button
                    title={isMarkingReceived ? "Confirming..." : "Mark Cash as Received"}
                    onPress={handleMarkReceived}
                    loading={isMarkingReceived}
                    fullWidth
                  />
                )}
                <Button title="Close" onPress={() => setShowInvoiceModal(false)} variant="outline" fullWidth />
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showArriveOtp || showCompleteOtp}
          animationType="slide"
          transparent
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalIcon}>
                    <Icon
                      name="shield"
                      size={24}
                      color={showArriveOtp ? Colors.primary : "#22C55E"}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {showArriveOtp ? "Start Job Code" : "Complete Job Code"}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {showArriveOtp
                        ? "Enter the 4-digit start code from the customer."
                        : "Enter the 4-digit completion code from the customer."}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => {
                      setShowArriveOtp(false);
                      setShowCompleteOtp(false);
                      setOtpInput("");
                      setOtpError("");
                    }}
                  >
                    <Icon name="x" size={22} color={Colors.text} />
                  </Pressable>
                </View>

                <Pressable onPress={() => otpInputRef.current?.focus()}>
                  <View style={styles.otpInputRow}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.otpBox,
                          otpInput.length > i && styles.otpBoxFilled,
                          otpInput.length === i && styles.otpBoxActive,
                        ]}
                      >
                        <Text style={styles.otpBoxText}>
                          {otpInput[i] ? "●" : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>

                <TextInput
                  ref={otpInputRef}
                  style={styles.hiddenInput}
                  value={otpInput}
                  onChangeText={(v) => {
                    setOtpInput(v.replace(/\D/g, "").slice(0, 4));
                    setOtpError("");
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  returnKeyType="done"
                  onSubmitEditing={
                    showArriveOtp
                      ? handleVerifyArriveOtp
                      : handleVerifyCompleteOtp
                  }
                  caretHidden
                />

                {otpError ? <Text style={styles.otpError}>{otpError}</Text> : null}

                <Button
                  title={
                    isVerifying
                      ? "Verifying..."
                      : showArriveOtp
                      ? "Start Job"
                      : "Complete Job"
                  }
                  onPress={
                    showArriveOtp
                      ? handleVerifyArriveOtp
                      : handleVerifyCompleteOtp
                  }
                  fullWidth
                  style={{ marginTop: 8 }}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    flex: 1,
  },

  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },

  scroll: { flex: 1 },

  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 60,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },

  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  serviceName: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
  },

  bookingId: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },

  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#22C55E30",
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },

  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  custAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },

  custAvatarTxt: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
  },

  custName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },

  custPhone: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },

  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  liveBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  liveBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },

  liveInfoRow: {
    flexDirection: "row",
    gap: 10,
  },

  liveInfoBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },

  liveInfoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },

  liveInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 17,
  },

  liveActionRow: {
    flexDirection: "row",
    gap: 10,
  },

  liveActionBtn: {
    flex: 1,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    paddingVertical: 12,
  },

  liveActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },

  liveHint: {
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textSecondary,
  },

  infoList: {
    gap: 10,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  infoLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    width: 60,
  },

  infoVal: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    flex: 1,
  },

  locationBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    paddingVertical: 12,
  },

  locationBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },

  photoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },

  photoLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.text,
  },

  attachmentImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },

  timerCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 18,
    padding: 20,
    gap: 16,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },

  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  timerLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },

  timerLiveText: {
    fontSize: 11,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 2,
  },

  timerDisplay: {
    fontSize: 48,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
    letterSpacing: 4,
  },

  billingRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
  },

  billingItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },

  billingLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "600",
  },

  billingVal: {
    fontSize: 14,
    fontWeight: "800",
  },

  billingDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  actionRowWrap: {
    flexDirection: "row",
    gap: 12,
  },

  arrivedSection: {
    gap: 12,
  },

  otpInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },

  otpInfoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.primary,
    lineHeight: 18,
    fontWeight: "500",
  },

  pinHintBox: {
    backgroundColor: Colors.primary + "10",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "25",
  },

  pinHintLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  pinHintValue: {
    fontSize: 26,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: 3,
    marginBottom: 6,
  },

  pinHintText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },

  completedBox: {
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },

  invoiceSummaryRow: {
    borderTopWidth: 1,
    borderTopColor: "#BBF7D0",
    paddingTop: 10,
    marginTop: 4,
    gap: 6,
  },

  invoiceSummaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  invoiceSummaryLabel: {
    fontSize: 13,
    color: "#166534",
  },

  invoiceSummaryValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#166534",
  },

  invoiceTotalItem: {
    borderTopWidth: 1,
    borderTopColor: "#BBF7D0",
    paddingTop: 6,
    marginTop: 2,
  },

  invoiceTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#15803D",
  },

  invoiceTotalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: Colors.primary,
  },

  paymentConfirmedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },

  paymentConfirmedText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16A34A",
  },

  invoiceModalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },

  invoiceModalLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    minWidth: 110,
  },

  invoiceModalValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "right",
    flexShrink: 1,
  },

  completedTitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#16A34A",
  },

  completedText: {
    textAlign: "center",
    fontSize: 13,
    color: "#166534",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },

  modalBox: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.text,
  },

  modalSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  otpInputRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
  },

  otpBox: {
    width: 60,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },

  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },

  otpBoxActive: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
  },

  otpBoxText: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.text,
  },

  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },

  otpError: {
    textAlign: "center",
    fontSize: 13,
    color: Colors.error,
    fontWeight: "600",
  },
});
