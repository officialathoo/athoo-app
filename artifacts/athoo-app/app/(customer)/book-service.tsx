import { Icon } from "@/components/ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { type ServiceCategory } from "@/data/services";
import { useCategories } from "@/context/CategoriesContext";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { searchAddressGoogle, reverseGeocodeGoogle } from "@/services/maps";

const TIMES = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM",
  "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM",
];

function getDates() {
  const dates = [];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push({
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : days[d.getDay()],
      date: d.toISOString().split("T")[0],
      dayNum: d.getDate(),
      monthAbbr: months[d.getMonth()],
    });
  }
  return dates;
}


const STEPS = ["Category", "Location", "Details", "Schedule", "Offer"];

export default function BookServiceScreen() {
  const {
    serviceId: paramServiceId,
    pickedAddress: paramPickedAddress,
    pickedLat: paramPickedLat,
    pickedLng: paramPickedLng,
    negotiatedPrice: paramNegotiatedPrice,
  } = useLocalSearchParams<{
    serviceId?: string;
    pickedAddress?: string;
    pickedLat?: string;
    pickedLng?: string;
    negotiatedPrice?: string;
  }>();

  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();
  const { showError } = useToast();
  const { categories, getCategoryBySlug } = useCategories();

  const [step, setStep] = useState(paramServiceId ? 1 : 0);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);

  useEffect(() => {
    if (paramServiceId && categories.length > 0 && !selectedCategory) {
      const found = getCategoryBySlug(paramServiceId);
      if (found) setSelectedCategory(found as ServiceCategory);
    }
  }, [paramServiceId, categories, getCategoryBySlug, selectedCategory]);

  const [address, setAddress] = useState(paramPickedAddress || "");
  const [addressQuery, setAddressQuery] = useState(paramPickedAddress || "");
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    paramPickedLat && paramPickedLng
      ? { latitude: parseFloat(paramPickedLat), longitude: parseFloat(paramPickedLng) }
      : null
  );
  const [savedAddresses, setSavedAddresses] = useState<{ id: string; label: string; address: string; latitude?: number | null; longitude?: number | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    api.getAddresses().then((res) => {
      if (res?.addresses?.length > 0) setSavedAddresses(res.addresses);
    }).catch(() => {});
  }, [user]);

  const [description, setDescription] = useState("");
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const dates = getDates();
  const [selectedDate, setSelectedDate] = useState(dates[0].date);
  const [selectedTime, setSelectedTime] = useState(TIMES[0]);

  const [offerPrice, setOfferPrice] = useState(paramNegotiatedPrice ? String(paramNegotiatedPrice) : "");

  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountType: "fixed" | "percent"; discountValue: number; description: string | null } | null>(null);
  const [promoError, setPromoError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!addressQuery.trim() || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingAddress(true);
      const results = await searchAddressGoogle(addressQuery);
      setAddressSuggestions(results);
      setSearchingAddress(false);
    }, 500);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [addressQuery]);

  const detectCurrentLocation = async () => {
    setLoadingAddress(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Please allow location access to auto-detect your address.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coords);

      let resolved: string | null = null;

      resolved = await reverseGeocodeGoogle(coords.latitude, coords.longitude);

      if (!resolved) {
        const geo = await Location.reverseGeocodeAsync(coords);
        if (geo.length > 0) {
          const g = geo[0];
          const parts = [g.name, g.street, g.streetNumber, g.district, g.subregion, g.city].filter(Boolean);
          resolved = parts.join(", ") || null;
        }
      }

      if (!resolved) {
        resolved = `Near ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
      }

      setAddress(resolved);
      setAddressQuery(resolved);
      setAddressSuggestions([]);
    } catch {
      showError("Location Error", "Could not detect your location.");
    } finally {
      setLoadingAddress(false);
    }
  };

  const pickVideo = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (perm.status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to attach a video.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: "videos", videoMaxDuration: 30 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "videos", videoMaxDuration: 30 });

    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      if (asset.duration && asset.duration > 30000) {
        Alert.alert("Too Long", "Please select a video under 30 seconds.");
        return;
      }
      setVideoUri(asset.uri);
    }
  };

  const canProceed = () => {
    if (step === 0) return !!selectedCategory;
    if (step === 1) return address.trim().length > 5;
    return true;
  };

  const validatePromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoValidating(true);
    setPromoError("");
    setAppliedPromo(null);
    try {
      const offerVal = offerPrice.trim() ? parseInt(offerPrice, 10) : 0;
      const res = await api.validatePromo(code, offerVal);
      if (res.promo) {
        setAppliedPromo({ code: res.promo.code, discountType: res.promo.discountType, discountValue: res.promo.discountValue, description: res.promo.description });
      } else {
        setPromoError("Invalid or expired promo code.");
      }
    } catch (e: any) {
      setPromoError(e?.message || "Invalid or expired promo code.");
    } finally {
      setPromoValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) { showError("Login Required", "Please log in to continue."); return; }
    if (!selectedCategory) { showError("Error", "No category selected."); return; }
    if (!address.trim()) { showError("Error", "Please enter your address."); return; }

    setSubmitting(true);

    let videoUrl: string | undefined;
    if (videoUri) {
      try {
        setUploadingVideo(true);
        const base64 = await FileSystem.readAsStringAsync(videoUri, { encoding: FileSystem.EncodingType.Base64 });
        videoUrl = `data:video/mp4;base64,${base64}`;
      } catch { videoUrl = undefined; }
      finally { setUploadingVideo(false); }
    }

    try {
      const parsedOffer = offerPrice.trim() ? parseInt(offerPrice, 10) : undefined;
      const res = await api.createBroadcastRequest({
        service: selectedCategory.id,
        serviceLabel: selectedCategory.name,
        serviceIcon: selectedCategory.icon,
        description: description.trim() || undefined,
        videoUrl,
        address: address.trim(),
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
        scheduledDate: selectedDate,
        scheduledTime: selectedTime,
        customerOffer: parsedOffer && parsedOffer >= 100 ? parsedOffer : undefined,
      });
      setBroadcastId(res.request.id);
    } catch (e: any) {
      Alert.alert("Failed", e?.message || "Could not broadcast your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (broadcastId) {
    return (
      <View style={[styles.container, styles.successWrap, { paddingTop: topPad }]}>
        <View style={styles.successCircle}>
          <Icon name="send" size={40} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Request Broadcast!</Text>
        <Text style={styles.successSub}>
          Your {selectedCategory?.name} request has been sent to nearby providers. Responses will arrive shortly.
        </Text>
        <Pressable
          style={styles.viewResponsesBtn}
          onPress={() =>
            router.replace({ pathname: "/(customer)/broadcast-status", params: { requestId: broadcastId } } as any)
          }
        >
          <Icon name="users" size={18} color="#fff" />
          <Text style={styles.btnText}>View Provider Responses</Text>
        </Pressable>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/(customer)/(tabs)/home" as any)}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => (step > 0 ? setStep(step - 1) : router.back())}>
          <Icon name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Book a Service</Text>
          <Text style={styles.headerSub}>{STEPS[step]} · Step {step + 1} of {STEPS.length}</Text>
        </View>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>What service do you need?</Text>
            <Text style={styles.sub}>Select the type of work</Text>
            <View style={styles.grid}>
              {categories.map((cat) => {
                const sel = selectedCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.catCard, { borderColor: sel ? cat.color : Colors.border }, sel && styles.catCardActive]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <View style={[styles.catIcon, { backgroundColor: sel ? cat.color : cat.bgColor }]}>
                      <Icon name={cat.icon as any} size={22} color={sel ? "#fff" : cat.color} />
                    </View>
                    <Text style={[styles.catName, sel && { color: cat.color, fontWeight: "800" }]}>{cat.name}</Text>
                    <Text style={styles.catDesc} numberOfLines={2}>{cat.description}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Where's the job?</Text>
            <Text style={styles.sub}>Search or pick a saved address</Text>

            {savedAddresses.length > 0 && (
              <View style={styles.savedSection}>
                <Text style={styles.savedLabel}>Saved Addresses</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
                    {savedAddresses.map((sa) => {
                      const isActive = address === sa.address;
                      return (
                        <Pressable
                          key={sa.id}
                          style={[styles.savedChip, isActive && styles.savedChipActive]}
                          onPress={() => {
                            setAddress(sa.address);
                            setAddressQuery(sa.address);
                            setAddressSuggestions([]);
                            if (sa.latitude && sa.longitude) {
                              setUserLocation({ latitude: sa.latitude, longitude: sa.longitude });
                            }
                          }}
                        >
                          <Icon name="bookmark" size={12} color={isActive ? "#fff" : Colors.primary} />
                          <Text style={[styles.savedChipText, isActive && styles.savedChipTextActive]} numberOfLines={1}>
                            {sa.label || sa.address}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            <View style={styles.searchBar}>
              <Icon name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={addressQuery}
                onChangeText={(v) => { setAddressQuery(v); setAddress(v); }}
                placeholder="Search area, street, landmark..."
                placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              {searchingAddress && <ActivityIndicator size="small" color={Colors.primary} />}
              {addressQuery.length > 0 && !searchingAddress && (
                <Pressable onPress={() => { setAddressQuery(""); setAddress(""); setAddressSuggestions([]); setUserLocation(null); }}>
                  <Icon name="x" size={15} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>

            {addressSuggestions.length > 0 && (
              <View style={styles.suggestBox}>
                {addressSuggestions.map((s, i) => (
                  <Pressable
                    key={i}
                    style={[styles.suggestRow, i < addressSuggestions.length - 1 && styles.suggestBorder]}
                    onPress={() => {
                      setAddress(s.label);
                      setAddressQuery(s.label);
                      setUserLocation({ latitude: s.lat, longitude: s.lng });
                      setAddressSuggestions([]);
                    }}
                  >
                    <Icon name="map-pin" size={13} color={Colors.primary} />
                    <Text style={styles.suggestText} numberOfLines={2}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable style={styles.detectBtn} onPress={detectCurrentLocation} disabled={loadingAddress}>
              {loadingAddress
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Icon name="navigation" size={15} color={Colors.primary} />}
              <Text style={styles.detectText}>{loadingAddress ? "Detecting your location..." : "Use Current Location"}</Text>
            </Pressable>

            {address.trim().length > 0 && (
              <View style={styles.addrPreview}>
                <Icon name="check-circle" size={13} color={Colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrLabel}>Selected Address</Text>
                  <Text style={styles.addrText}>{address}</Text>
                </View>
                {userLocation && (
                  <View style={styles.gpsPill}>
                    <Icon name="navigation" size={10} color={Colors.primary} />
                    <Text style={styles.gpsPillText}>GPS</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Describe the work</Text>
            <Text style={styles.sub}>Give providers detail to quote accurately (optional)</Text>
            <View style={styles.textAreaWrap}>
              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder={"E.g. \"Kitchen pipe is leaking under the sink, started 2 days ago...\""}
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.fieldLabel}>Attach a Video (optional · max 30s)</Text>
            <Text style={styles.fieldHint}>A short clip helps providers understand the job better</Text>

            {videoUri ? (
              <View style={styles.videoChosen}>
                <Icon name="video" size={18} color={Colors.success} />
                <Text style={styles.videoChosenText}>Video attached</Text>
                <Pressable onPress={() => setVideoUri(null)} style={{ padding: 4 }}>
                  <Icon name="x" size={16} color={Colors.error} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.videoBtns}>
                <Pressable style={styles.videoBtn} onPress={() => pickVideo(true)}>
                  <Icon name="camera" size={17} color={Colors.primary} />
                  <Text style={styles.videoBtnText}>Record</Text>
                </Pressable>
                <Pressable style={styles.videoBtn} onPress={() => pickVideo(false)}>
                  <Icon name="film" size={17} color={Colors.primary} />
                  <Text style={styles.videoBtnText}>Gallery</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View style={styles.section}>
            <Text style={styles.heading}>When do you need it?</Text>
            <Text style={styles.sub}>Schedule up to 7 days ahead</Text>

            <Text style={styles.fieldLabel}>Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {dates.map((d) => (
                  <Pressable
                    key={d.date}
                    onPress={() => setSelectedDate(d.date)}
                    style={[styles.dateCard, selectedDate === d.date && styles.dateCardActive]}
                  >
                    <Text style={[styles.dayLbl, selectedDate === d.date && styles.dateActiveText]}>{d.label}</Text>
                    <Text style={[styles.dateNum, selectedDate === d.date && styles.dateActiveText]}>{d.dayNum}</Text>
                    <Text style={[styles.monthLbl, selectedDate === d.date && styles.dateActiveText]}>{d.monthAbbr}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Select Time</Text>
            <View style={styles.timesGrid}>
              {TIMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setSelectedTime(t)}
                  style={[styles.timeChip, selectedTime === t && styles.timeChipActive]}
                >
                  <Text style={[styles.timeText, selectedTime === t && styles.timeTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={styles.section}>
            <Text style={styles.heading}>Set your price</Text>
            <Text style={styles.sub}>Providers accept or counter-offer. Leave blank for open quotes.</Text>

            <View style={styles.offerWrap}>
              <Text style={styles.rsSign}>Rs.</Text>
              <TextInput
                style={styles.offerInput}
                value={offerPrice}
                onChangeText={(v) => setOfferPrice(v.replace(/[^0-9]/g, ""))}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>

            <View style={styles.quickRow}>
              {[500, 1000, 1500, 2000, 3000, 5000].map((p) => (
                <Pressable
                  key={p}
                  style={[styles.quickChip, offerPrice === String(p) && styles.quickChipActive]}
                  onPress={() => setOfferPrice(String(p))}
                >
                  <Text style={[styles.quickText, offerPrice === String(p) && styles.quickTextActive]}>
                    Rs. {p.toLocaleString()}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.quickChip, offerPrice === "" && styles.quickChipActive]}
                onPress={() => setOfferPrice("")}
              >
                <Text style={[styles.quickText, offerPrice === "" && styles.quickTextActive]}>Open Price</Text>
              </Pressable>
            </View>

            {/* Promo Code */}
            <View style={styles.promoSection}>
              <Text style={styles.fieldLabel}>Promo Code <Text style={styles.optionalTag}>(optional)</Text></Text>
              <View style={styles.promoRow}>
                <TextInput
                  style={[styles.promoInput, appliedPromo ? styles.promoInputApplied : null]}
                  value={promoCode}
                  onChangeText={(v) => {
                    setPromoCode(v.toUpperCase());
                    setPromoError("");
                    setAppliedPromo(null);
                  }}
                  placeholder="Enter promo code"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={validatePromo}
                  editable={!appliedPromo}
                />
                {appliedPromo ? (
                  <Pressable
                    style={styles.promoRemoveBtn}
                    onPress={() => { setAppliedPromo(null); setPromoCode(""); setPromoError(""); }}
                  >
                    <Icon name="x" size={16} color={Colors.error} />
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.promoBtn, (!promoCode.trim() || promoValidating) && styles.btnDisabled]}
                    onPress={validatePromo}
                    disabled={!promoCode.trim() || promoValidating}
                  >
                    {promoValidating
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.promoBtnText}>Apply</Text>
                    }
                  </Pressable>
                )}
              </View>
              {appliedPromo && (
                <View style={styles.promoSuccess}>
                  <Icon name="check-circle" size={15} color={Colors.success} />
                  <Text style={styles.promoSuccessText}>
                    {appliedPromo.discountType === "fixed"
                      ? `Rs. ${appliedPromo.discountValue.toLocaleString()} discount applied!`
                      : `${appliedPromo.discountValue}% discount applied!`}
                    {appliedPromo.description ? `  · ${appliedPromo.description}` : ""}
                  </Text>
                </View>
              )}
              {promoError ? (
                <View style={styles.promoErrorRow}>
                  <Icon name="alert-circle" size={13} color={Colors.error} />
                  <Text style={styles.promoErrorText}>{promoError}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Booking Summary</Text>
              {[
                { icon: "tool", label: "Service", val: selectedCategory?.name ?? "" },
                { icon: "map-pin", label: "Address", val: address },
                { icon: "calendar", label: "When", val: `${selectedDate} · ${selectedTime}` },
                {
                  icon: "dollar-sign",
                  label: "Offer",
                  val: offerPrice ? `Rs. ${parseInt(offerPrice).toLocaleString()}` : "Open (let providers quote)",
                  highlight: !!offerPrice,
                },
              ].map((row) => (
                <View key={row.label} style={styles.summaryRow}>
                  <Icon name={row.icon as any} size={13} color={Colors.primary} />
                  <Text style={styles.summaryLbl}>{row.label}</Text>
                  <Text style={[styles.summaryVal, row.highlight && { color: Colors.secondary, fontWeight: "800" }]} numberOfLines={2}>
                    {row.val}
                  </Text>
                </View>
              ))}
              {description.trim() && (
                <View style={styles.summaryRow}>
                  <Icon name="file-text" size={13} color={Colors.primary} />
                  <Text style={styles.summaryLbl}>Details</Text>
                  <Text style={styles.summaryVal} numberOfLines={2}>{description}</Text>
                </View>
              )}
              {videoUri && (
                <View style={styles.summaryRow}>
                  <Icon name="video" size={13} color={Colors.success} />
                  <Text style={styles.summaryLbl}>Video</Text>
                  <Text style={[styles.summaryVal, { color: Colors.success }]}>Attached</Text>
                </View>
              )}
              {appliedPromo && (
                <View style={styles.summaryRow}>
                  <Icon name="tag" size={13} color={Colors.success} />
                  <Text style={styles.summaryLbl}>Promo</Text>
                  <Text style={[styles.summaryVal, { color: Colors.success, fontWeight: "800" }]}>
                    {appliedPromo.code} ·{" "}
                    {appliedPromo.discountType === "fixed"
                      ? `Rs. ${appliedPromo.discountValue.toLocaleString()} off`
                      : `${appliedPromo.discountValue}% off`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.noteBox}>
              <Icon name="info" size={13} color={Colors.primary} />
              <Text style={styles.noteText}>
                Your request will be broadcast to all nearby {selectedCategory?.name}s. You'll receive responses within minutes and pick your preferred provider — just like InDrive.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
        {step < STEPS.length - 1 ? (
          <Pressable
            style={[styles.primaryBtn, !canProceed() && styles.btnDisabled]}
            onPress={() => canProceed() && setStep(step + 1)}
            disabled={!canProceed()}
          >
            <Text style={styles.btnText}>Continue</Text>
            <Icon name="arrow-right" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.broadcastBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.btnText}>{uploadingVideo ? "Uploading video..." : "Broadcasting..."}</Text>
              </>
            ) : (
              <>
                <Icon name="send" size={18} color="#fff" />
                <Text style={styles.btnText}>Broadcast Request</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  successWrap: { alignItems: "center", justifyContent: "center", padding: 32 },
  successCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.success, alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: "800", color: Colors.text, textAlign: "center" },
  successSub: { fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 8 },
  viewResponsesBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24,
    marginTop: 24, width: "100%",
  },
  homeBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8, width: "100%" },
  homeBtnText: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary },

  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 20 },
  dotDone: { backgroundColor: Colors.primary + "60" },

  section: { padding: 20, gap: 14 },
  heading: { fontSize: 22, fontWeight: "800", color: Colors.text },
  sub: { fontSize: 13, color: Colors.textSecondary, marginTop: -8 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCard: {
    width: "47%", backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: Colors.border, gap: 8, alignItems: "flex-start",
  },
  catCardActive: {
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10,
    shadowRadius: 12, elevation: 5,
  },
  catIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  catName: { fontSize: 14, fontWeight: "700", color: Colors.text },
  catDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5,
    borderColor: Colors.primary + "50", paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  suggestBox: {
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    overflow: "hidden", marginTop: -4,
  },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  suggestBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  suggestText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },

  detectBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
  },
  detectText: { fontSize: 13, fontWeight: "700", color: Colors.primary },

  savedSection: { marginBottom: 12 },
  savedLabel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  savedChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 200,
  },
  savedChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  savedChipText: { fontSize: 12, fontWeight: "600", color: Colors.primary },
  savedChipTextActive: { color: "#fff" },

  addrPreview: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: Colors.success + "10",
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.success + "30",
  },
  addrLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: "600" },
  addrText: { fontSize: 13, color: Colors.text, lineHeight: 18, marginTop: 2 },
  gpsPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.primary + "15", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
  },
  gpsPillText: { fontSize: 10, fontWeight: "700", color: Colors.primary },

  textAreaWrap: {
    backgroundColor: Colors.white, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14,
  },
  textArea: { fontSize: 14, color: Colors.text, minHeight: 120, textAlignVertical: "top", lineHeight: 22 },

  fieldLabel: { fontSize: 15, fontWeight: "700", color: Colors.text },
  fieldHint: { fontSize: 12, color: Colors.textMuted, marginTop: -8 },

  videoChosen: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.success + "12",
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.success + "30",
  },
  videoChosenText: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.success },
  videoBtns: { flexDirection: "row", gap: 12 },
  videoBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingVertical: 14,
  },
  videoBtnText: { fontSize: 13, fontWeight: "600", color: Colors.primary },

  dateCard: {
    width: 70, alignItems: "center", padding: 12, borderRadius: 14,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border,
  },
  dateCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayLbl: { fontSize: 10, fontWeight: "600", color: Colors.textSecondary, textTransform: "uppercase" },
  dateNum: { fontSize: 22, fontWeight: "800", color: Colors.text, marginTop: 2 },
  monthLbl: { fontSize: 10, color: Colors.textMuted },
  dateActiveText: { color: "#fff" },

  timesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border,
  },
  timeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timeText: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  timeTextActive: { color: "#fff" },

  offerWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.white,
    borderRadius: 16, borderWidth: 2, borderColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 4, gap: 8,
  },
  rsSign: { fontSize: 20, fontWeight: "800", color: Colors.primary },
  offerInput: { flex: 1, fontSize: 28, fontWeight: "800", color: Colors.text, paddingVertical: 12 },

  promoSection: { gap: 8 },
  optionalTag: { fontSize: 12, fontWeight: "400", color: Colors.textMuted },
  promoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  promoInput: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontWeight: "700", color: Colors.text, letterSpacing: 1,
  },
  promoInputApplied: { borderColor: Colors.success, backgroundColor: Colors.success + "08" },
  promoBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 13,
  },
  promoBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  promoRemoveBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.error + "12",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.error + "30",
  },
  promoSuccess: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.success + "12",
    borderRadius: 10, padding: 10, borderWidth: 1, borderColor: Colors.success + "30",
  },
  promoSuccessText: { flex: 1, fontSize: 12, color: Colors.success, fontWeight: "700", lineHeight: 16 },
  promoErrorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  promoErrorText: { fontSize: 12, color: Colors.error, fontWeight: "600" },

  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  quickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickText: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary },
  quickTextActive: { color: "#fff" },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  summaryTitle: { fontSize: 14, fontWeight: "800", color: Colors.text, marginBottom: 12 },
  summaryRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  summaryLbl: { width: 56, fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  summaryVal: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.text },

  noteBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.primary + "10",
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + "25",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 18, fontWeight: "600" },

  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: Colors.white,
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 16,
  },
  broadcastBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.secondary, borderRadius: 16, paddingVertical: 16,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});
