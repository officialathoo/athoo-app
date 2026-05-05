import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { BookingCard } from "@/components/ui/BookingCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";
import { useLang } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useNegotiation } from "@/context/NegotiationContext";
import { useBroadcast } from "@/context/BroadcastContext";

export default function ProviderDashboard() {
  const { user, updateUser } = useAuth();
  const { getMyBookings, pendingAlerts, consumeAlerts } = useBookings();
  const { pendingAlerts: negAlerts, consumeNegAlerts } = useNegotiation();
  const { t } = useLang();
  const { push, unreadCount } = useNotifications();
  const { openBroadcastCount } = useBroadcast();

  useEffect(() => {
    if (pendingAlerts.length > 0) {
      const alerts = consumeAlerts();
      for (const alert of alerts) {
        push({
          type: alert.type === "booking" ? "booking" : "success",
          title: alert.title,
          message: alert.message,
          role: "provider",
          bookingId: alert.booking.id,
        });
      }
    }

    if (negAlerts.length > 0) {
      const alerts = consumeNegAlerts();
      for (const alert of alerts) {
        push({
          type: "negotiation",
          title: alert.title,
          message: alert.message,
          role: "provider",
          negotiationId: alert.negotiation.id,
        });
      }
    }
  }, [pendingAlerts, negAlerts, consumeAlerts, consumeNegAlerts, push]);

  const [isAvailable, setIsAvailable] = useState(user?.isAvailable !== false);

  useEffect(() => {
    setIsAvailable(user?.isAvailable !== false);
  }, [user?.isAvailable]);

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const allBookings = user ? getMyBookings(user.id, "provider") : [];
  const pending = allBookings.filter((b) => b.status === "pending");
  const active = allBookings.filter(
    (b) => b.status === "accepted" || b.status === "in_progress"
  );
  const completed = allBookings.filter((b) => b.status === "completed");

  const totalEarnings = completed.reduce((sum, b) => sum + (b.price || 0), 0);

  // Build last-7-days earnings bars
  const weekBars = (() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const result: { label: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = days[d.getDay()];
      const amount = completed.filter(b => (b.scheduledDate || "").startsWith(dateStr)).reduce((s, b) => s + (b.price || 0), 0);
      result.push({ label: dayLabel, amount });
    }
    return result;
  })();
  const maxBarAmt = Math.max(...weekBars.map(b => b.amount), 1);
  const completionRate = allBookings.length > 0 ? Math.round((completed.length / allBookings.length) * 100) : 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t.providerDashboard}</Text>
          <Text style={styles.subGreeting}>{user?.name}</Text>
        </View>

        <Pressable
          style={styles.notifBtn}
          onPress={() => router.push("/(provider)/notifications")}
        >
          <Icon name="bell" size={20} color={Colors.text} />
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
      >
        <View
          style={[
            styles.statusCard,
            {
              borderColor: isAvailable
                ? Colors.success + "60"
                : Colors.error + "40",
              backgroundColor: isAvailable ? "#F0FDF4" : "#FFF5F5",
            },
          ]}
        >
          <View style={styles.statusLeft}>
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: isAvailable ? Colors.success : Colors.error },
              ]}
            />
            <View>
              <Text
                style={[
                  styles.statusText,
                  { color: isAvailable ? Colors.success : Colors.error },
                ]}
              >
                {isAvailable ? t.availableForJobs : t.notAvailable}
              </Text>
              <Text style={styles.statusSub}>
                {isAvailable ? t.customersCanBook : t.wontReceive}
              </Text>
            </View>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={async (val) => {
              setIsAvailable(val);
              await updateUser({ isAvailable: val });
            }}
            trackColor={{
              false: Colors.error + "50",
              true: Colors.success + "50",
            }}
            thumbColor={isAvailable ? Colors.success : Colors.error}
          />
        </View>

        {/* Broadcast Jobs Banner */}
        <Pressable
          style={styles.broadcastBanner}
          onPress={() => router.push("/(provider)/broadcast-jobs" as any)}
        >
          <View style={styles.broadcastBannerLeft}>
            <View style={styles.broadcastBannerIcon}>
              <Icon name="radio" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.broadcastBannerTitle}>
                Broadcast Jobs{openBroadcastCount > 0 ? ` (${openBroadcastCount})` : ""}
              </Text>
              <Text style={styles.broadcastBannerSub}>
                {openBroadcastCount > 0
                  ? `${openBroadcastCount} open request${openBroadcastCount > 1 ? "s" : ""} near you`
                  : "Tap to see open requests near you"}
              </Text>
            </View>
          </View>
          <Icon name="arrow-right" size={18} color={Colors.secondary} />
        </Pressable>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: Colors.primary + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.primary }]}>
              {allBookings.length}
            </Text>
            <Text style={styles.statLabel}>{t.totalJobs}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.warning + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.warning }]}>
              {pending.length}
            </Text>
            <Text style={styles.statLabel}>{t.pendingJobs}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.success + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.success }]}>
              {completed.length}
            </Text>
            <Text style={styles.statLabel}>{t.done}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.secondary + "15" }]}>
            <Text style={[styles.statVal, { color: Colors.secondary }]}>
              {totalEarnings > 0 ? `${Math.round(totalEarnings / 1000)}k` : "0"}
            </Text>
            <Text style={styles.statLabel}>{t.earned}</Text>
          </View>
        </View>

        {/* 7-day earnings chart */}
        <View style={styles.earningsChart}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Earnings This Week</Text>
            <Text style={styles.chartTotal}>
              {totalEarnings > 0 ? `Rs. ${totalEarnings.toLocaleString("en-PK")}` : "Rs. 0"} total
            </Text>
          </View>
          <View style={styles.chartBars}>
            {weekBars.map((bar, i) => {
              const pct = Math.max(0.04, bar.amount / maxBarAmt);
              const isToday = i === 6;
              return (
                <View key={bar.label} style={styles.chartBarCol}>
                  <Text style={styles.chartBarAmt}>
                    {bar.amount > 0 ? `${Math.round(bar.amount / 1000)}k` : ""}
                  </Text>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBarFill, { height: `${pct * 100}%` as any, backgroundColor: isToday ? Colors.primary : Colors.primary + "55" }]} />
                  </View>
                  <Text style={[styles.chartBarLabel, isToday && { color: Colors.primary, fontWeight: "700" }]}>{bar.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {pending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t.newRequests} ({pending.length})
            </Text>
            {pending.slice(0, 2).map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                role="provider"
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/job-detail",
                    params: { bookingId: b.id },
                  })
                }
              />
            ))}
          </View>
        )}

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.activeJobs}</Text>
            {active.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                role="provider"
                onPress={() =>
                  router.push({
                    pathname: "/(provider)/job-detail",
                    params: { bookingId: b.id },
                  })
                }
              />
            ))}
          </View>
        )}

        {allBookings.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="briefcase" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t.noJobsYet}</Text>
            <Text style={styles.emptySubtitle}>{t.noJobsYetSub}</Text>
          </View>
        )}

        <View style={styles.performanceCard}>
          <Text style={styles.perfTitle}>{t.yourPerformance}</Text>
          <View style={styles.perfRow}>
            <Icon name="star" size={16} color={Colors.accent} />
            <Text style={styles.perfLabel}>Avg Rating</Text>
            <Text style={styles.perfVal}>{user?.rating || "N/A"}</Text>
          </View>
          <View style={styles.perfRow}>
            <Icon name="clock" size={16} color={Colors.primary} />
            <Text style={styles.perfLabel}>Response Time</Text>
            <Text style={styles.perfVal}>~15 min</Text>
          </View>
          <View style={styles.perfRow}>
            <Icon name="check-circle" size={16} color={Colors.success} />
            <Text style={styles.perfLabel}>Completion Rate</Text>
            <Text style={styles.perfVal}>{completionRate}%</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 18, fontWeight: "800", color: Colors.text },
  subGreeting: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notifBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    fontSize: 9,
    color: "#fff",
    fontWeight: "800",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 16 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: { fontSize: 14, fontWeight: "700" },
  statusSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statVal: { fontSize: 24, fontWeight: "800" },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  section: { gap: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 10,
  },
  empty: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  performanceCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  perfTitle: { fontSize: 15, fontWeight: "700", color: Colors.text },
  perfRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  perfLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  perfVal: { fontSize: 14, fontWeight: "700", color: Colors.text },

  earningsChart: { backgroundColor: Colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: Colors.border },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  chartTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  chartTotal: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 80 },
  chartBarCol: { flex: 1, alignItems: "center", gap: 4 },
  chartBarAmt: { fontSize: 9, color: Colors.textSecondary, fontWeight: "600", height: 12, textAlign: "center" },
  chartBarTrack: { flex: 1, width: "100%", backgroundColor: Colors.surface, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  chartBarFill: { width: "100%", borderRadius: 4 },
  chartBarLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: "500" },
  broadcastBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.secondary + "12",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.secondary + "40",
  },
  broadcastBannerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  broadcastBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastBannerTitle: { fontSize: 14, fontWeight: "800", color: Colors.text },
  broadcastBannerSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});
