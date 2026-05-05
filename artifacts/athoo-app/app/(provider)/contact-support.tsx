import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { api as apiService } from "@/services/api";

const SUBJECTS = [
  "Booking issue",
  "Payment problem",
  "Customer complaint",
  "App technical issue",
  "Account access",
  "Refund request",
  "Other",
];

export default function ContactSupportScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!message.trim() || message.trim().length < 20) {
      setError("Please describe your issue in at least 20 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiService.submitComplaint({ subject, message: message.trim() });
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Contact Support</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Icon name="check-circle" size={52} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Ticket Submitted!</Text>
          <Text style={styles.successMsg}>
            Our support team will review your request and get back to you within 24 hours.
          </Text>
          <Pressable style={styles.doneBtn} onPress={() => router.push("/(provider)/support-tickets" as any)}>
            <Text style={styles.doneBtnText}>View My Tickets</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Back to Help</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Contact Support</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <Icon name="headphones" size={24} color={Colors.primary} />
            <Text style={styles.infoText}>
              Describe your issue and our team will respond within 24 hours.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>What&apos;s the issue about?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {SUBJECTS.map((s) => (
                <Pressable key={s} onPress={() => setSubject(s)} style={[styles.chip, subject === s && styles.chipActive]}>
                  <Text style={[styles.chipText, subject === s && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Describe your issue</Text>
            <TextInput
              style={styles.messageInput}
              placeholder="Please describe your issue in detail so we can help you quickly..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={6}
              value={message}
              onChangeText={setMessage}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{message.length} / 500</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={14} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <><Icon name="send" size={16} color="#fff" /><Text style={styles.submitBtnText}>Submit Support Request</Text></>}
          </Pressable>

          <Text style={styles.responseTime}>⏱ Average response time: under 24 hours</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.text },
  content: { padding: 20, gap: 20, paddingBottom: 80 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.primary + "20" },
  infoText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  section: { gap: 10 },
  label: { fontSize: 14, fontWeight: "700", color: Colors.text },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  chipText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary },
  messageInput: { backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14, fontSize: 14, color: Colors.text, minHeight: 140, fontFamily: Platform.OS === "ios" ? "System" : undefined },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { flex: 1, fontSize: 13, color: "#EF4444" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  responseTime: { fontSize: 12, color: Colors.textMuted, textAlign: "center", marginTop: -8 },
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 16 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text },
  successMsg: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", lineHeight: 24 },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: 16, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  backLink: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
});

