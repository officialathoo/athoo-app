import { Icon } from "@/components/ui/Icon";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useBookings, Booking } from "@/context/BookingContext";
import { useChat } from "@/context/ChatContext";
import { useCall } from "@/context/CallContext";
import { getDistanceKm } from "@/utils/distance";
import { api, realtime } from "@/services/api";

function formatElapsed(startedAt?: string) {
  if (!startedAt) return "00:00";
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
  const m = Math.floor(diffSec / 60)
    .toString()
    .padStart(2, "0");
  const s = (diffSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#F59E0B", bg: "#FFFBEB", icon: "clock" },
  accepted: { label: "Accepted", color: "#3B82F6", bg: "#EFF6FF", icon: "check-circle" },
  in_progress: { label: "In Progress", color: "#8B5CF6", bg: "#F5F3FF", icon: "tool" },
  completed: { label: "Completed", color: "#22C55E", bg: "#F0FDF4", icon: "check-square" },
  cancelled: { label: "Cancelled", color: "#EF4444", bg: "#FEF2F2", icon: "x-circle" },
} as const;

function toCoord(value: any) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isValidCoordPair(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 && latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 && longitude <= 180
  );
}

function getCustomerCoords(booking: any) {
  const latCandidates = [
    booking?.customerLat,
    booking?.customerLatitude,
    booking?.pickedLat,
    booking?.lat,
    booking?.latitude,
  ];
  const lngCandidates = [
    booking?.customerLng,
    booking?.customerLongitude,
    booking?.pickedLng,
    booking?.lng,
    booking?.longitude,
  ];

  const lat = latCandidates.map(toCoord).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toCoord).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidCoordPair(lat, lng)) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

function getProviderCoords(booking: any) {
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

  const lat = latCandidates.map(toCoord).find((v) => typeof v === "number");
  const lng = lngCandidates.map(toCoord).find((v) => typeof v === "number");

  if (typeof lat === "number" && typeof lng === "number" && isValidCoordPair(lat, lng)) {
    return { latitude: lat, longitude: lng };
  }

  return null;
}

function openMapsAt(latitude: number, longitude: number, label?: string) {
  const encodedLabel = encodeURIComponent(label || `${latitude},${longitude}`);
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const appleUrl = `http://maps.apple.com/?ll=${latitude},${longitude}&q=${encodedLabel}`;
  const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;

  if (Platform.OS === "android") {
    Linking.canOpenURL(geoUrl)
      .then((ok) => (ok ? Linking.openURL(geoUrl) : Linking.openURL(googleUrl)))
      .catch(() => Linking.openURL(googleUrl));
    return;
  }

  if (Platform.OS === "ios") {
    Linking.canOpenURL(appleUrl)
      .then((ok) => (ok ? Linking.openURL(appleUrl) : Linking.openURL(googleUrl)))
      .catch(() => Linking.openURL(googleUrl));
    return;
  }

  Linking.openURL(googleUrl).catch(() => {});
}

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { user } = useAuth();
  const { bookings, updateBookingStatus, rateBooking, loadBookings } = useBookings();
  const { getOrCreateChat } = useChat();
  const { startOutgoingCall } = useCall();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const mapRef = useRef<MapView | null>(null);

  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [elapsed, setElapsed] = useState("00:00");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [realtimeProviderCoords, setRealtimeProviderCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const booking = bookings.find((b) => b.id === bookingId) as Booking | undefined;

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

  useEffect(() => {
    if (!bookingId) return;
    const off = realtime.on((msg) => {
      if (msg.type === "booking:location" && msg.payload?.bookingId === bookingId) {
        const { providerLat, providerLng } = msg.payload;
        if (typeof providerLat === "number" && typeof providerLng === "number") {
          setRealtimeProviderCoords({ latitude: providerLat, longitude: providerLng });
        }
      }
    });
    return off;
  }, [bookingId]);

  useEffect(() => {
    if (booking?.status === "in_progress" && booking.jobStartedAt) {
      setElapsed(formatElapsed(booking.jobStartedAt));
      timerRef.current = setInterval(
        () => setElapsed(formatElapsed(booking.jobStartedAt)),
        1000
      );
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

  const handleMarkPaid = async () => {
    if (!booking) return;
    setIsMarkingPaid(true);
    try {
      const res = await api.markBookingPaid(booking.id);
      const updated = res.booking as Booking;
      await loadBookings();
      setShowInvoiceModal(false);
      Alert.alert("Payment Confirmed", `You confirmed cash payment for ${updated.service}. The provider has been notified.`);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not mark as paid. Try again.");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const customerCoords = useMemo(() => getCustomerCoords(booking), [booking]);
  const dbProviderCoords = useMemo(() => getProviderCoords(booking), [booking]);
  const providerCoords = realtimeProviderCoords ?? dbProviderCoords;

  const liveDistanceKm = useMemo(() => {
    if (!customerCoords || !providerCoords) return null;
    return getDistanceKm(
      customerCoords.latitude,
      customerCoords.longitude,
      providerCoords.latitude,
      providerCoords.longitude
    );
  }, [customerCoords, providerCoords]);

  useEffect(() => {
    if (!mapRef.current || !customerCoords) return;

    if (providerCoords) {
      mapRef.current.fitToCoordinates([customerCoords, providerCoords], {
        edgePadding: { top: 70, right: 70, bottom: 70, left: 70 },
        animated: true,
      });
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: customerCoords.latitude,
          longitude: customerCoords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    }
  }, [customerCoords, providerCoords]);

  if (!booking) {
    return (
      <View style={styles.notFound}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const status = STATUS_CONFIG[booking.status];
  const providerName = booking.providerName || "Provider";
  const showTrackingMap =
    (booking.status === "accepted" || booking.status === "in_progress") &&
    !!customerCoords &&
    isValidCoordPair(customerCoords?.latitude, customerCoords?.longitude);

  const TIMELINE = [
    { label: "Booking Placed", done: true },
    {
      label: "Provider Accepted",
      done: ["accepted", "in_progress", "completed"].includes(booking.status),
    },
    {
      label: "Service In Progress",
      done: ["in_progress", "completed"].includes(booking.status),
    },
    { label: "Service Completed", done: booking.status === "completed" },
  ];

  const handleCancel = () => {
    Alert.alert("Cancel Booking", "Are you sure you want to cancel?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: () => {
          updateBookingStatus(booking.id, "cancelled");
          router.back();
        },
      },
    ]);
  };

  const handleRate = async () => {
    if (rating === 0) {
      Alert.alert("Select Rating", "Please select a star rating.");
      return;
    }
    setSubmittingRating(true);
    await rateBooking(booking.id, rating, review);
    setSubmittingRating(false);
    Alert.alert("Thank you!", "Your review has been submitted.");
  };

  const handleChat = async () => {
    if (!user) return;
    const chat = await getOrCreateChat(
      user.id,
      user.name,
      booking.providerId,
      providerName,
      booking.id,
      booking.service
    );
    router.push({
      pathname: "/(customer)/chat-room",
      params: {
        chatId: chat.id,
        otherUserId: booking.providerId,
        otherUserName: providerName,
        otherUserImage: booking.providerProfileImage || undefined,
        otherUserColor: booking.providerProfileColor || undefined,
      },
    });
  };

  const handleCall = async () => {
    if (!user) return;
    await startOutgoingCall(booking.providerId, providerName, booking.service, "#1A6EE0");
  };

  const handleReport = async () => {
    if (!reportCategory.trim() || !reportDescription.trim()) {
      Alert.alert("Missing Info", "Please select a category and describe the issue.");
      return;
    }
    setSubmittingReport(true);
    try {
      await api.reportIssue({
        bookingId: booking.id,
        reportedId: booking.providerId,
        reportedName: providerName,
        category: reportCategory,
        description: reportDescription,
      });
      setShowReportModal(false);
      setReportCategory("");
      setReportDescription("");
      Alert.alert("Report Submitted", "Our team will review your report and take action.");
    } catch {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Booking Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.serviceHeader}>
            <View style={styles.serviceIcon}>
              <Icon name={booking.serviceIcon as any} size={24} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.serviceName}>{booking.service}</Text>
              <Text style={styles.bookingId}>
                {booking.publicId || `Booking #${booking.id.slice(-6).toUpperCase()}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Provider</Text>
          <View style={styles.providerRow}>
            <View style={styles.provAvatar}>
              <Text style={styles.provAvatarTxt}>
                {booking.providerName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.provName}>{booking.providerName}</Text>
              <Text style={styles.provPhone}>{booking.providerPhone}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable style={styles.chatBtn} onPress={handleChat}>
                <Icon name="message-circle" size={18} color={Colors.primary} />
              </Pressable>
              {(booking.status === "accepted" || booking.status === "in_progress") && (
                <Pressable
                  style={[
                    styles.chatBtn,
                    { backgroundColor: "#F0FDF4", borderColor: "#22C55E30" },
                  ]}
                  onPress={handleCall}
                >
                  <Icon name="phone" size={16} color="#22C55E" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        {showTrackingMap && (
          <View style={styles.card}>
            <View style={styles.trackHeader}>
              <Text style={styles.cardTitle}>Live Tracking</Text>
              <View style={styles.trackBadge}>
                <View
                  style={[
                    styles.trackDot,
                    { backgroundColor: providerCoords ? "#22C55E" : "#F59E0B" },
                  ]}
                />
                <Text style={styles.trackBadgeText}>
                  {providerCoords ? "Live" : "Awaiting provider location"}
                </Text>
              </View>
            </View>

            <MapView
              ref={mapRef}
              style={styles.trackingMap}
              moveOnMarkerPress={false}
              initialRegion={{
                latitude: customerCoords.latitude,
                longitude: customerCoords.longitude,
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }}
              showsUserLocation={false}
            >
              <Marker
                coordinate={customerCoords}
                title="Your Location"
                description={booking.address || "Customer address"}
                pinColor={Colors.secondary}
              />

              {providerCoords && (
                <Marker
                  coordinate={providerCoords}
                  title={providerName}
                  description="Provider current location"
                  pinColor={Colors.primary}
                />
              )}

              {providerCoords && (
                <Polyline
                  coordinates={[providerCoords, customerCoords]}
                  strokeWidth={4}
                  strokeColor={Colors.primary}
                />
              )}
            </MapView>

            <View style={styles.trackInfoRow}>
              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Customer</Text>
                <Text style={styles.trackInfoValue}>Location pinned</Text>
              </View>

              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Provider</Text>
                <Text style={styles.trackInfoValue}>
                  {providerCoords ? "Location available" : "Not shared yet"}
                </Text>
              </View>

              <View style={styles.trackInfoBox}>
                <Text style={styles.trackInfoLabel}>Distance</Text>
                <Text style={styles.trackInfoValue}>
                  {liveDistanceKm != null ? `${liveDistanceKm.toFixed(1)} km` : "--"}
                </Text>
              </View>
            </View>

            <View style={styles.trackActions}>
              <Pressable
                style={styles.trackActionBtn}
                onPress={() =>
                  customerCoords &&
                  openMapsAt(
                    customerCoords.latitude,
                    customerCoords.longitude,
                    "Customer Location"
                  )
                }
              >
                <Icon name="map-pin" size={15} color={Colors.primary} />
                <Text style={styles.trackActionText}>Open Address</Text>
              </Pressable>

              {providerCoords ? (
                <Pressable
                  style={styles.trackActionBtn}
                  onPress={() =>
                    openMapsAt(
                      providerCoords.latitude,
                      providerCoords.longitude,
                      providerName
                    )
                  }
                >
                  <Icon name="navigation" size={15} color={Colors.primary} />
                  <Text style={styles.trackActionText}>Open Provider</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.trackHint}>
              Map updates automatically when provider moves. Pull down to refresh manually.
            </Text>
          </View>
        )}

        {booking.status === "accepted" && !customerCoords && (
          <View style={styles.card}>
            <View style={styles.trackHeader}>
              <Text style={styles.cardTitle}>Live Tracking</Text>
              <View style={styles.trackBadge}>
                <View style={[styles.trackDot, { backgroundColor: "#EF4444" }]} />
                <Text style={styles.trackBadgeText}>Location missing</Text>
              </View>
            </View>

            <Text style={styles.trackHint}>
              This booking does not have saved customer coordinates yet, so live tracking
              cannot be shown for this older booking. Create a new booking with current or
              picked location to use tracking.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Booking Info</Text>
          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Icon name="calendar" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoVal}>{booking.scheduledDate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="clock" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoVal}>{booking.scheduledTime}</Text>
            </View>
            <View style={styles.infoRow}>
              <Icon name="map-pin" size={15} color={Colors.primary} />
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoVal} numberOfLines={2}>
                {booking.address}
              </Text>
            </View>
            {booking.price && (
              <View style={styles.infoRow}>
                <Icon name="dollar-sign" size={15} color={Colors.primary} />
                <Text style={styles.infoLabel}>Price</Text>
                <Text
                  style={[
                    styles.infoVal,
                    { color: Colors.primary, fontWeight: "700" },
                  ]}
                >
                  Rs. {booking.price}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progress</Text>
          <View style={styles.timeline}>
            {TIMELINE.map((t, i) => (
              <View key={i} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, t.done && styles.timelineDotDone]}>
                    {t.done && <Icon name="check" size={10} color={Colors.white} />}
                  </View>
                  {i < TIMELINE.length - 1 && (
                    <View style={[styles.timelineLine, t.done && styles.timelineLineDone]} />
                  )}
                </View>
                <Text style={[styles.timelineLabel, t.done && styles.timelineLabelDone]}>
                  {t.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {booking.status === "accepted" && booking.startPin && (
          <View style={styles.pinDisplayCard}>
            <View style={styles.pinDisplayHeader}>
              <Icon name="shield" size={20} color={Colors.primary} />
              <Text style={styles.pinDisplayTitle}>Provider Start Code</Text>
            </View>
            <Text style={styles.pinDisplayDesc}>
              Share this code with your provider when they arrive to start the job:
            </Text>
            <View style={styles.pinValueBox}>
              <Text style={styles.pinValue}>{booking.startPin.split("").join("  ")}</Text>
            </View>
            <Text style={styles.pinHint}>
              Do not share this code until the provider is at your location.
            </Text>
          </View>
        )}

        {booking.status === "in_progress" && (
          <View style={styles.timerCard}>
            <View style={styles.timerHeader}>
              <View style={styles.timerLiveDot} />
              <Text style={styles.timerLiveText}>JOB IN PROGRESS</Text>
            </View>
            <Text style={styles.timerDisplay}>{elapsed}</Text>
          </View>
        )}

        {booking.status === "in_progress" && booking.completePin && (
          <View
            style={[
              styles.pinDisplayCard,
              { borderColor: "#22C55E40", backgroundColor: "#F0FDF4" },
            ]}
          >
            <View style={styles.pinDisplayHeader}>
              <Icon name="check-circle" size={20} color="#22C55E" />
              <Text style={[styles.pinDisplayTitle, { color: "#16A34A" }]}>
                Job Completion Code
              </Text>
            </View>
            <Text style={[styles.pinDisplayDesc, { color: "#166534" }]}>
              Share this code with your provider to confirm the job is complete:
            </Text>
            <View
              style={[
                styles.pinValueBox,
                { backgroundColor: "#DCFCE7", borderColor: "#22C55E40" },
              ]}
            >
              <Text style={[styles.pinValue, { color: "#16A34A" }]}>
                {booking.completePin.split("").join("  ")}
              </Text>
            </View>
            <Text style={[styles.pinHint, { color: "#166534" }]}>
              Only share after the provider has finished all the work.
            </Text>
          </View>
        )}

        {booking.status === "completed" && (
          <View style={[styles.card, { borderColor: "#22C55E40", borderWidth: 1, backgroundColor: "#F0FDF4" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Icon name="check-circle" size={22} color="#22C55E" />
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#16A34A" }}>Job Completed</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Service</Text>
              <Text style={styles.invoiceValue}>{booking.service}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Date</Text>
              <Text style={styles.invoiceValue}>{booking.scheduledDate} {booking.scheduledTime}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Provider</Text>
              <Text style={styles.invoiceValue}>{booking.providerName}</Text>
            </View>
            <View style={styles.invoiceDivider} />
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Service Charge</Text>
              <Text style={styles.invoiceValue}>Rs. {(booking.price || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceLabel}>Visit Charge</Text>
              <Text style={styles.invoiceValue}>Rs. 200</Text>
            </View>
            <View style={[styles.invoiceRow, { marginTop: 4 }]}>
              <Text style={[styles.invoiceLabel, { fontWeight: "800", color: Colors.text, fontSize: 15 }]}>Total</Text>
              <Text style={[styles.invoiceValue, { fontWeight: "900", color: Colors.primary, fontSize: 16 }]}>Rs. {((booking.price || 0) + 200).toLocaleString()}</Text>
            </View>
            {booking.paymentStatus === "paid" || booking.paymentStatus === "received" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#DCFCE7", borderRadius: 10, padding: 10 }}>
                <Icon name="check-circle" size={16} color="#16A34A" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#16A34A" }}>
                  {booking.paymentStatus === "received" ? "Cash Paid & Confirmed by Provider" : "Cash Payment Confirmed"}
                </Text>
              </View>
            ) : (
              <Button
                title={isMarkingPaid ? "Confirming..." : "Mark Cash as Paid"}
                onPress={handleMarkPaid}
                loading={isMarkingPaid}
                fullWidth
                style={{ marginTop: 8 }}
              />
            )}
          </View>
        )}

        {booking.status === "completed" && !booking.rating && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rate this Service</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable key={i} onPress={() => setRating(i)}>
                  <Icon
                    name="star"
                    size={32}
                    color={i <= rating ? Colors.accent : Colors.border}
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reviewInput}
              placeholder="Write a review (optional)..."
              value={review}
              onChangeText={setReview}
              multiline
              numberOfLines={3}
              placeholderTextColor={Colors.textMuted}
            />
            <Button
              title="Submit Review"
              onPress={handleRate}
              loading={submittingRating}
              fullWidth
            />
          </View>
        )}

        {booking.rating && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Review</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Icon
                  key={i}
                  name="star"
                  size={20}
                  color={i <= booking.rating! ? Colors.accent : Colors.border}
                />
              ))}
            </View>
            {booking.review && <Text style={styles.existingReview}>{booking.review}</Text>}
          </View>
        )}

        {(booking.status === "pending" || booking.status === "accepted") && (
          <Button
            title="Cancel Booking"
            onPress={handleCancel}
            variant="danger"
            fullWidth
          />
        )}

        {booking.status !== "pending" && (
          <Pressable style={styles.reportBtn} onPress={() => setShowReportModal(true)}>
            <Icon name="flag" size={15} color={Colors.error} />
            <Text style={styles.reportBtnText}>Report an Issue</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Report Issue Modal */}
      <Modal visible={showReportModal} transparent animationType="slide" onRequestClose={() => setShowReportModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report an Issue</Text>
              <Pressable onPress={() => setShowReportModal(false)}>
                <Icon name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalLabel}>Category</Text>
            {["Unprofessional Behavior", "Work Quality Issue", "No-Show / Late Arrival", "Overcharging", "Safety Concern", "Other"].map(cat => (
              <Pressable
                key={cat}
                style={[styles.catOption, reportCategory === cat && styles.catOptionSelected]}
                onPress={() => setReportCategory(cat)}
              >
                <Text style={[styles.catOptionText, reportCategory === cat && styles.catOptionTextSelected]}>{cat}</Text>
              </Pressable>
            ))}
            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Description</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="Describe the issue in detail..."
              placeholderTextColor={Colors.textMuted}
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              numberOfLines={4}
            />
            <Button
              title={submittingReport ? "Submitting..." : "Submit Report"}
              onPress={handleReport}
              loading={submittingReport}
              fullWidth
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, flex: 1 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
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
  serviceHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceName: { fontSize: 18, fontWeight: "800", color: Colors.text },
  bookingId: { fontSize: 12, color: Colors.textSecondary },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  providerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  provAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
  },
  provAvatarTxt: { fontSize: 14, fontWeight: "700", color: Colors.primary },
  provName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  provPhone: { fontSize: 12, color: Colors.textSecondary },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  trackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  trackDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  trackBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  trackingMap: {
    width: "100%",
    height: 220,
    borderRadius: 16,
  },
  trackInfoRow: {
    flexDirection: "row",
    gap: 8,
  },
  trackInfoBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  trackInfoLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  trackInfoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  trackActions: {
    flexDirection: "row",
    gap: 10,
  },
  trackActionBtn: {
    flex: 1,
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  trackActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  trackHint: {
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
  infoList: { gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, width: 60 },
  infoVal: { fontSize: 13, fontWeight: "600", color: Colors.text, flex: 1 },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineLeft: { alignItems: "center", width: 20 },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timelineLine: { width: 2, height: 28, backgroundColor: Colors.border },
  timelineLineDone: { backgroundColor: Colors.primary },
  timelineLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingVertical: 2,
    fontWeight: "500",
  },
  timelineLabelDone: { color: Colors.text, fontWeight: "700" },
  starsRow: { flexDirection: "row", gap: 8 },
  reviewInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: "top",
    minHeight: 80,
  },
  existingReview: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  pinDisplayCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    borderWidth: 2,
    borderColor: Colors.primary + "40",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  pinDisplayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  pinDisplayTitle: { fontSize: 16, fontWeight: "800", color: Colors.primary },
  pinDisplayDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  pinValueBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
  },
  pinValue: { fontSize: 38, fontWeight: "900", color: Colors.text, letterSpacing: 8 },
  pinHint: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  timerCard: {
    backgroundColor: "#1e1b4b",
    borderRadius: 18,
    padding: 20,
    gap: 10,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  timerHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error + "40",
    backgroundColor: Colors.error + "08",
  },
  reportBtnText: { fontSize: 13, fontWeight: "600", color: Colors.error },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    gap: 8,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  modalLabel: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, marginBottom: 4 },
  catOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: 4,
  },
  catOptionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  catOptionText: { fontSize: 13, color: Colors.text },
  catOptionTextSelected: { color: Colors.primary, fontWeight: "700" },
  reportInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: "top",
    minHeight: 90,
    marginBottom: 8,
  },
  invoiceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  invoiceLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "right",
    flexShrink: 1,
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
});
