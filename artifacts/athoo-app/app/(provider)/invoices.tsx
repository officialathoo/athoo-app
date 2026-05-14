import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useState } from "react";
import { Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";

export default function ProviderInvoicesScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const completed = user ? getMyBookings(user.id, "provider").filter((b) => b.status === "completed") : [];

  const invoices = completed.map((b) => {
    const ratePerHour = Number((b as any).ratePerHour || 0);
    const hours = Number((b as any).hours || 0);
    const travelCharge = Number((b as any).travelCharge ?? (b as any).visitCharge ?? 0);
    const serviceCharge = (ratePerHour > 0 && hours > 0)
      ? Math.round(ratePerHour * hours)
      : Number(b.price || 0);
    const commissionAmount = Number(b.commissionAmount || 0);
    const providerAmount = Number(b.providerAmount || 0) || (serviceCharge + travelCharge - commissionAmount);
    return {
      id: b.id,
      service: b.service,
      customer: b.customerName,
      date: b.scheduledDate
        ? new Date(b.scheduledDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
        : b.createdAt
          ? new Date(b.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })
          : "—",
      ratePerHour,
      hours,
      serviceCharge,
      travelCharge,
      commissionAmount,
      commissionRate: Number((b as any).commissionRate || 0),
      providerAmount,
      visitCharge: travelCharge,
      invoiceNo: `ATH-${b.id.slice(-6).toUpperCase()}`,
    };
  });

  const selected = selectedId ? invoices.find((i) => i.id === selectedId) : null;

  const handleShareInvoice = async (inv: NonNullable<typeof selected>) => {
    const total = inv.serviceCharge + inv.visitCharge;
    const msg = [
      `ATHOO Invoice — ${inv.invoiceNo}`,
      `Service: ${inv.service}`,
      `Customer: ${inv.customer}`,
      `Date: ${inv.date}`,
      ``,
      `Provider Amount: Rs. ${inv.serviceCharge.toLocaleString()}`,
      ...(inv.visitCharge > 0 ? [`Visit Charge: Rs. ${inv.visitCharge.toLocaleString()}`] : []),
      `Total Earned: Rs. ${total.toLocaleString()}`,
      `Status: PAID`,
      ``,
      `ATHOO — Pakistan's Home Services Platform`,
    ].join("\n");
    try {
      await Share.share({ message: msg, title: `Invoice ${inv.invoiceNo}` });
    } catch { /* user cancelled */ }
  };

  if (selected) {
    const customerTotal = selected.serviceCharge + selected.travelCharge;
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedId(null)}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Invoice</Text>
          <Pressable style={styles.shareBtn} onPress={() => handleShareInvoice(selected)}>
            <Icon name="share-2" size={18} color={Colors.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.invoiceContent}>
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceTop}>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 72, height: 28 }} resizeMode="contain" />
              <Text style={styles.invoiceNo}>{selected.invoiceNo}</Text>
            </View>
            <Text style={styles.invoiceDate}>{selected.date}</Text>
            <View style={styles.invDivider} />
            <Text style={styles.invSection}>Provider Earnings</Text>
            <View style={styles.invRow}><Text style={styles.invLabel}>Service</Text><Text style={styles.invVal}>{selected.service}</Text></View>
            <View style={styles.invRow}><Text style={styles.invLabel}>Customer</Text><Text style={styles.invVal}>{selected.customer}</Text></View>
            <View style={styles.invDivider} />
            {selected.ratePerHour > 0 && selected.hours > 0 && (
              <>
                <View style={styles.invRow}><Text style={styles.invLabel}>Per Hour Rate</Text><Text style={styles.invVal}>Rs. {selected.ratePerHour.toLocaleString()}</Text></View>
                <View style={styles.invRow}><Text style={styles.invLabel}>Hours</Text><Text style={styles.invVal}>{selected.hours}</Text></View>
              </>
            )}
            <View style={styles.invRow}><Text style={styles.invLabel}>Service Charge</Text><Text style={styles.invVal}>Rs. {selected.serviceCharge.toLocaleString()}</Text></View>
            {selected.travelCharge > 0 && (
              <View style={styles.invRow}>
                <Text style={styles.invLabel}>Travelling Charge</Text>
                <Text style={[styles.invVal, { color: Colors.secondary }]}>Rs. {selected.travelCharge.toLocaleString()}</Text>
              </View>
            )}
            <View style={styles.invDivider} />
            <View style={styles.invRow}><Text style={styles.invLabel}>Customer Total</Text><Text style={styles.invVal}>Rs. {customerTotal.toLocaleString()}</Text></View>
            {selected.commissionAmount > 0 && (
              <View style={styles.invRow}>
                <Text style={[styles.invLabel, { color: Colors.textSecondary }]}>Platform Commission ({selected.commissionRate}%)</Text>
                <Text style={[styles.invVal, { color: Colors.error }]}>- Rs. {selected.commissionAmount.toLocaleString()}</Text>
              </View>
            )}
            <View style={styles.invDivider} />
            <View style={styles.invRow}>
              <Text style={styles.invTotalLabel}>Your Earning</Text>
              <Text style={styles.invTotalVal}>Rs. {selected.providerAmount.toLocaleString()}</Text>
            </View>
          </View>
          {selected.travelCharge > 0 && (
            <View style={styles.noteCard}>
              <Icon name="info" size={13} color={Colors.primary} />
              <Text style={styles.noteText}>A travelling charge of Rs. {selected.travelCharge.toLocaleString()} was agreed for this job.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>My Invoices</Text>
      </View>
      <ScrollView contentContainerStyle={styles.listContent}>
        {invoices.length === 0 && (
          <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
            <Icon name="file-text" size={40} color={Colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text }}>No Invoices Yet</Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 }}>
              Invoices will appear here after completing your first job.
            </Text>
          </View>
        )}
        {invoices.map((inv) => (
          <Pressable
            key={inv.id}
            style={({ pressed }) => [styles.invItem, pressed && styles.invItemPressed]}
            onPress={() => setSelectedId(inv.id)}
          >
            <View style={styles.invItemIcon}><Icon name="file-text" size={18} color={Colors.secondary} /></View>
            <View style={styles.invItemInfo}>
              <Text style={styles.invItemService}>{inv.service}</Text>
              <Text style={styles.invItemCustomer}>{inv.customer} • {inv.date}</Text>
              <Text style={styles.invItemNo}>{inv.invoiceNo}</Text>
            </View>
            <View style={styles.invItemRight}>
              <Text style={styles.invItemAmount}>Rs. {(inv.serviceCharge + inv.visitCharge).toLocaleString()}</Text>
              <View style={styles.paidBadge}><Text style={styles.paidText}>PAID</Text></View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: Colors.text, flex: 1 },
  shareBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  paidBadge: { backgroundColor: "#22C55E20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  paidText: { fontSize: 10, fontWeight: "800", color: "#22C55E" },
  listContent: { padding: 16, gap: 10, paddingBottom: 40 },
  invItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.card, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  invItemPressed: { opacity: 0.85 },
  invItemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.secondary + "20", alignItems: "center", justifyContent: "center" },
  invItemInfo: { flex: 1, gap: 2 },
  invItemService: { fontSize: 14, fontWeight: "700", color: Colors.text },
  invItemCustomer: { fontSize: 12, color: Colors.textSecondary },
  invItemNo: { fontSize: 11, color: Colors.textMuted },
  invItemRight: { alignItems: "flex-end", gap: 4 },
  invItemAmount: { fontSize: 14, fontWeight: "800", color: Colors.secondary },
  invoiceContent: { padding: 16, gap: 12, paddingBottom: 40 },
  invoiceCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, gap: 10, borderWidth: 1, borderColor: Colors.border },
  invoiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  invoiceTitle: { fontSize: 28, fontWeight: "900", color: Colors.secondary },
  invoiceNo: { fontSize: 12, fontWeight: "700", color: Colors.textSecondary },
  invoiceDate: { fontSize: 12, color: Colors.textMuted },
  invDivider: { height: 1, backgroundColor: Colors.border },
  invSection: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  invRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  invLabel: { fontSize: 13, color: Colors.textSecondary },
  invVal: { fontSize: 13, fontWeight: "600", color: Colors.text },
  invTotalLabel: { fontSize: 15, fontWeight: "800", color: Colors.text },
  invTotalVal: { fontSize: 18, fontWeight: "900", color: Colors.secondary },
  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 17 },
});

