import { Icon } from "@/components/ui/Icon";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
import { useAuth } from "@/context/AuthContext";
import { useCategories } from "@/context/CategoriesContext";
import { Provider } from "@/data/services";
import { api } from "@/services/api";

export default function EditProfileScreen() {
  const { user, updateUser } = useAuth();
  const { categories } = useCategories();
  const p = user as Provider | null;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [form, setForm] = useState({
    bio: p?.bio || "",
    experience: p?.experience || "",
    location: p?.location || "",
    ratePerHour: p?.ratePerHour ? String(p.ratePerHour) : "",
    services: (p?.services || []) as string[],
  });
  const [saving, setSaving] = useState(false);

  const update = (key: string, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  const toggleService = (slug: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(slug)
        ? prev.services.filter((s) => s !== slug)
        : [...prev.services, slug],
    }));
  };

  const handleSave = async () => {
    if (form.services.length === 0) {
      Alert.alert("Select a Service", "Please select at least one service you offer.");
      return;
    }
    setSaving(true);
    try {
      const data: any = {};
      if (form.bio !== (p?.bio || "")) data.bio = form.bio;
      if (form.experience !== (p?.experience || "")) data.experience = form.experience;
      if (form.location !== (p?.location || "")) data.location = form.location;
      const newRate = form.ratePerHour ? parseInt(form.ratePerHour, 10) : null;
      if (newRate !== (p?.ratePerHour ?? null)) data.ratePerHour = newRate;

      const prevServices = JSON.stringify([...(p?.services || [])].sort());
      const newServices = JSON.stringify([...form.services].sort());
      if (prevServices !== newServices) data.services = form.services;

      if (Object.keys(data).length === 0) {
        router.back();
        return;
      }

      await api.updateMe(data);
      await updateUser(data);
      Alert.alert("Saved", "Your profile has been updated.", [{ text: "OK", onPress: () => router.back() }]);
    } catch {
      Alert.alert("Error", "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Icon name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Edit Profile</Text>
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Text style={styles.label}>Services Offered</Text>
            <Text style={styles.hint}>Select all services you provide to customers</Text>
            <View style={styles.servicesGrid}>
              {categories.filter((c) => c.isActive !== false).map((cat) => {
                const selected = form.services.includes(cat.slug);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => toggleService(cat.slug)}
                    style={[styles.serviceChip, selected && { backgroundColor: cat.color, borderColor: cat.color }]}
                  >
                    <Icon
                      name={cat.icon as any}
                      size={14}
                      color={selected ? "#fff" : cat.color}
                    />
                    <Text style={[styles.serviceChipText, selected && { color: "#fff" }]}>
                      {cat.name}
                    </Text>
                    {selected && (
                      <Icon name="check" size={12} color="#fff" />
                    )}
                  </Pressable>
                );
              })}
            </View>
            {form.services.length > 0 && (
              <Text style={styles.selectedCount}>{form.services.length} service{form.services.length !== 1 ? "s" : ""} selected</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <Text style={styles.hint}>Describe your skills and experience to customers</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.bio}
              onChangeText={(v) => update("bio", v)}
              placeholder="Tell customers about yourself..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Years of Experience</Text>
            <TextInput
              style={styles.input}
              value={form.experience}
              onChangeText={(v) => update("experience", v)}
              placeholder="e.g. 5 years"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.hint}>Area where you typically work (e.g. G-11, Islamabad)</Text>
            <TextInput
              style={styles.input}
              value={form.location}
              onChangeText={(v) => update("location", v)}
              placeholder="e.g. Rawalpindi, G-11 Islamabad"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Hourly Rate (Rs.)</Text>
            <Text style={styles.hint}>Leave blank to negotiate per job</Text>
            <View style={styles.rateRow}>
              <Text style={styles.ratePrefix}>Rs.</Text>
              <TextInput
                style={[styles.input, styles.rateInput]}
                value={form.ratePerHour}
                onChangeText={(v) => update("ratePerHour", v.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 1500"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
              <Text style={styles.rateSuffix}>/hr</Text>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Icon name="info" size={14} color={Colors.primary} />
            <Text style={styles.infoText}>
              Your hourly rate helps customers understand your pricing before they book you.
              Showing a rate often leads to more bookings.
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700", color: Colors.text },
  saveBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: Colors.primary, borderRadius: 20,
  },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "700", color: Colors.text },
  hint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  input: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 14,
    fontSize: 15, color: Colors.text,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ratePrefix: { fontSize: 16, fontWeight: "700", color: Colors.textSecondary },
  rateInput: { flex: 1 },
  rateSuffix: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  infoBox: {
    flexDirection: "row", gap: 10, backgroundColor: Colors.primary + "10",
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.primary + "20",
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  serviceChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  serviceChipText: { fontSize: 13, fontWeight: "600", color: Colors.text },
  selectedCount: { fontSize: 12, color: Colors.primary, fontWeight: "700", marginTop: 4 },
});
