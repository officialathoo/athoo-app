import { Icon } from "@/components/ui/Icon";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { ProviderCard } from "@/components/ui/ProviderCard";
import { Provider } from "@/data/services";
import { api } from "@/services/api";
import { useAuth } from "../../context/AuthContext";

export default function SavedProvidersScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { user, toggleSaved } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSavedProviders();
      setProviders((res.providers as Provider[]) || []);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProviders();
    }, [loadProviders])
  );

  const savedIds = user?.savedProviders || [];
  const savedProviders = providers;

  const isSaved = (id: string) => savedIds.includes(id);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Saved Providers</Text>
          <Text style={styles.subtitle}>
            {savedProviders.length} saved
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.helperText}>Loading saved providers...</Text>
        </View>
      ) : savedProviders.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIconWrap}>
            <Icon name="heart-outline" size={28} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No saved providers yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the heart icon on any provider to save them here.
          </Text>

          <Pressable
            style={styles.browseBtn}
            onPress={() => router.push("/(customer)/service-providers?serviceId=all" as any)}
          >
            <Icon name="search" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>Browse Providers</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {savedProviders.map((provider) => (
            <View key={provider.id} style={styles.cardWrap}>
              <Pressable
                onPress={() => toggleSaved(provider.id)}
                style={styles.saveBtn}
              >
                <Icon
                  name={isSaved(provider.id) ? "heart" : "heart-outline"}
                  size={16}
                  color={isSaved(provider.id) ? "#E53935" : "#666"}
                />
              </Pressable>

              <ProviderCard
                provider={provider}
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/provider-detail",
                    params: {
                      providerId: provider.id,
                    },
                  } as any)
                }
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.text,
  },

  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  helperText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textSecondary,
  },

  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 6,
  },

  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 18,
  },

  browseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },

  browseBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  list: {
    flex: 1,
  },

  listContent: {
    padding: 16,
    paddingBottom: 30,
  },

  cardWrap: {
    position: "relative",
    marginBottom: 14,
  },

  saveBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
});
