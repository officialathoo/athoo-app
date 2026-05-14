import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { useAuth } from "@/context/AuthContext";
import { useBookings } from "@/context/BookingContext";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
}

export default function InvoicesScreen() {
  const { user } = useAuth();
  const { getMyBookings } = useBookings();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const completed = user
    ? getMyBookings(user.id, "customer").filter((b) => b.status === "completed")
    : [];

  const selected = completed.find((b) => b.id === selectedInvoice);

  const getInvoiceNo = (b: any) => `ATH-${b.id.slice(-6).toUpperCase()}`;

  const getInvoiceBreakdown = (b: any) => {
    const ratePerHour = Number(b.ratePerHour || 0);
    const hours = Number(b.hours || 0);
    const travelCharge = Number(b.travelCharge ?? b.visitCharge ?? 0);
    const serviceCharge = (ratePerHour > 0 && hours > 0)
      ? Math.round(ratePerHour * hours)
      : Number(b.price || 0);
    const total = serviceCharge + travelCharge;
    const commissionAmount = Number(b.commissionAmount || 0);
    const commissionRate = Number(b.commissionRate || 0);
    const providerAmount = Number(b.providerAmount || 0) || (total - commissionAmount);
    return { ratePerHour, hours, travelCharge, serviceCharge, total, commissionAmount, commissionRate, providerAmount };
  };

  const handleShare = async (b: any) => {
    const invoiceNo = getInvoiceNo(b);
    const { ratePerHour, hours, serviceCharge, travelCharge, total } = getInvoiceBreakdown(b);
    const lines = [
      `ATHOO Invoice — ${invoiceNo}`,
      `Service: ${b.service}`,
      `Provider: ${b.providerName}`,
      `Date: ${formatDate(b.createdAt)}`,
      ``,
    ];
    if (ratePerHour > 0 && hours > 0) {
      lines.push(`Per Hour Rate: Rs. ${ratePerHour.toLocaleString()}`);
      lines.push(`Hours: ${hours}`);
    }
    lines.push(`Service Charge: Rs. ${serviceCharge.toLocaleString()}`);
    if (travelCharge > 0) {
      lines.push(`Travelling Charge: Rs. ${travelCharge.toLocaleString()}`);
    }
    lines.push(`Total: Rs. ${total.toLocaleString()}`);
    lines.push(`Status: PAID`, ``, `ATHOO — Pakistan's Home Services Platform`);
    try {
      await Share.share({ message: lines.join("\n"), title: `Invoice ${invoiceNo}` });
    } catch { /* user cancelled */ }
  };

  if (selected) {
    const { ratePerHour, hours, serviceCharge, travelCharge, total: subtotal, commissionAmount, commissionRate, providerAmount } = getInvoiceBreakdown(selected);
    const tax = 0;

    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setSelectedInvoice(null)}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Invoice Detail</Text>
          <Pressable style={styles.shareBtn} onPress={() => handleShare(selected)}>
            <Icon name="share-2" size={18} color={Colors.primary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.invoiceContent}>
          <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.invoiceHeader}>
            <View style={styles.invoiceLogo}>
              <Image source={require("../../assets/images/logo.png")} style={{ width: 80, height: 32 }} resizeMode="contain" />
              <Text style={styles.invoiceSubhead}>Home Services · Rawalpindi & Islamabad</Text>
            </View>
            <View style={styles.invoiceHeaderRight}>
              <Text style={styles.invoiceNo}>{getInvoiceNo(selected)}</Text>
              <Text style={styles.invoiceDate}>{formatDate(selected.createdAt)}</Text>
              <View style={styles.invoicePaidBadge}>
                <Icon name="check-circle" size={11} color="#fff" />
                <Text style={styles.invoicePaidText}>PAID</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.invoiceBody}>
            <View style={styles.invoiceParty}>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>BILLED TO</Text>
                <Text style={styles.partyName}>{selected.customerName}</Text>
                <Text style={styles.partyDetail}>{selected.address}</Text>
              </View>
              <View style={styles.invoicePartyItem}>
                <Text style={styles.partyLabel}>SERVICE BY</Text>
                <Text style={styles.partyName}>{selected.providerName}</Text>
                <Text style={styles.partyDetail}>{selected.service}</Text>
              </View>
            </View>

            <View style={styles.invoiceTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Description</Text>
                <Text style={[styles.tableHeaderText, { textAlign: "right" }]}>Amount</Text>
              </View>

              {ratePerHour > 0 && hours > 0 ? (
                <View style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableRowLabel}>{selected.service}</Text>
                    <Text style={styles.tableRowSub}>Rs. {ratePerHour.toLocaleString()}/hr × {hours} hrs</Text>
                    <Text style={styles.tableRowSub}>{selected.scheduledDate} · {selected.scheduledTime}</Text>
                  </View>
                  <Text style={styles.tableRowAmount}>Rs. {serviceCharge.toLocaleString()}</Text>
                </View>
              ) : (
                <View style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableRowLabel}>{selected.service}</Text>
                    <Text style={styles.tableRowSub}>{selected.scheduledDate} · {selected.scheduledTime}</Text>
                  </View>
                  <Text style={styles.tableRowAmount}>Rs. {serviceCharge.toLocaleString()}</Text>
                </View>
              )}

              {travelCharge > 0 && (
                <View style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tableRowLabel}>Travelling / Visit Charge</Text>
                    <Text style={styles.tableRowSub}>Agreed travelling fee</Text>
                  </View>
                  <Text style={styles.tableRowAmount}>Rs. {travelCharge.toLocaleString()}</Text>
                </View>
              )}

              <View style={styles.tableDivider} />

              <View style={styles.tableRow}>
                <Text style={[styles.tableRowLabel, { flex: 2 }]}>Subtotal</Text>
                <Text style={styles.tableRowAmount}>Rs. {subtotal.toLocaleString()}</Text>
              </View>

              {commissionAmount > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableRowLabel, { flex: 2, color: Colors.textSecondary }]}>Platform Commission ({commissionRate}%)</Text>
                  <Text style={[styles.tableRowAmount, { color: Colors.textSecondary }]}>Rs. {commissionAmount.toLocaleString()}</Text>
                </View>
              )}

              <LinearGradient colors={[Colors.primary, "#0D4BA0"]} style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL PAID</Text>
                <Text style={styles.totalAmount}>Rs. {subtotal.toLocaleString()}</Text>
              </LinearGradient>
            </View>

            <View style={styles.invoiceNote}>
              <Icon name="info" size={13} color={Colors.textSecondary} />
              <Text style={styles.invoiceNoteText}>
                Payment was made directly in cash to the service provider. Athoo does not handle funds. This is an electronic receipt only.
              </Text>
            </View>

            <View style={styles.invoiceFooter}>
              <Text style={styles.invoiceFooterText}>Athoo · +92 339 0051068 · @athoo_services</Text>
              <Text style={styles.invoiceFooterText}>Thank you for using Athoo!</Text>
            </View>
          </View>
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
        <Text style={styles.headerTitle}>My Invoices</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {completed.length === 0 ? (
          <AnimatedCard>
            <View style={styles.empty}>
              <Icon name="file-text" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No invoices yet</Text>
              <Text style={styles.emptySubtitle}>Invoices appear after service completion</Text>
            </View>
          </AnimatedCard>
        ) : (
          completed.map((b, i) => (
            <AnimatedCard key={b.id} delay={i * 60}>
              <Pressable
                style={({ pressed }) => [styles.invoiceCard, pressed && styles.pressed]}
                onPress={() => setSelectedInvoice(b.id)}
              >
                <View style={styles.invoiceCardLeft}>
                  <View style={styles.invoiceIconBox}>
                    <Icon name="file-text" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.invoiceCardNo}>{getInvoiceNo(b)}</Text>
                    <Text style={styles.invoiceCardService}>{b.service}</Text>
                    <Text style={styles.invoiceCardDate}>{formatDate(b.createdAt)}</Text>
                  </View>
                </View>
                <View style={styles.invoiceCardRight}>
                  <Text style={styles.invoiceCardAmount}>Rs. {((b.price || 0) + ((b as any).visitCharge ?? 200)).toLocaleString()}</Text>
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>PAID</Text>
                  </View>
                  <Icon name="chevron-right" size={14} color={Colors.textMuted} />
                </View>
              </Pressable>
            </AnimatedCard>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.background, alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.text },
  shareBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  listContent: { padding: 20, gap: 12, paddingBottom: 80 },
  empty: { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary },
  invoiceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  invoiceCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  invoiceIconBox: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  invoiceCardNo: { fontSize: 13, fontWeight: "800", color: Colors.text },
  invoiceCardService: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  invoiceCardDate: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  invoiceCardRight: { alignItems: "flex-end", gap: 4 },
  invoiceCardAmount: { fontSize: 15, fontWeight: "800", color: Colors.primary },
  paidBadge: { backgroundColor: Colors.success + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  paidBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.success },
  invoiceContent: { paddingBottom: 80 },
  invoiceHeader: { padding: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  invoiceLogo: {},
  invoiceLogoText: { fontSize: 24, fontWeight: "900", color: "#fff" },
  invoiceSubhead: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  invoiceHeaderRight: { alignItems: "flex-end", gap: 4 },
  invoiceNo: { fontSize: 14, fontWeight: "800", color: "#fff" },
  invoiceDate: { fontSize: 11, color: "rgba(255,255,255,0.75)" },
  invoicePaidBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.success, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  invoicePaidText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  invoiceBody: { padding: 20, gap: 20 },
  invoiceParty: { flexDirection: "row", gap: 16 },
  invoicePartyItem: { flex: 1, gap: 4 },
  partyLabel: { fontSize: 9, fontWeight: "800", color: Colors.textMuted, letterSpacing: 1 },
  partyName: { fontSize: 14, fontWeight: "800", color: Colors.text },
  partyDetail: { fontSize: 11, color: Colors.textSecondary },
  invoiceTable: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tableHeaderText: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableRowLabel: { fontSize: 13, fontWeight: "700", color: Colors.text },
  tableRowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  tableRowAmount: { fontSize: 14, fontWeight: "700", color: Colors.text, textAlign: "right", minWidth: 80 },
  tableDivider: { height: 1, backgroundColor: Colors.primary + "30" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  totalLabel: { fontSize: 13, fontWeight: "800", color: "rgba(255,255,255,0.85)" },
  totalAmount: { fontSize: 18, fontWeight: "900", color: "#fff" },
  invoiceNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  invoiceNoteText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 17 },
  invoiceFooter: { alignItems: "center", gap: 4 },
  invoiceFooterText: { fontSize: 11, color: Colors.textMuted },
});

