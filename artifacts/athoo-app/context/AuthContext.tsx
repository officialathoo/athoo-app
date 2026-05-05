import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { router } from "expo-router";
import { api, setToken, clearToken, getToken, realtime, setUnauthorizedHandler } from "@/services/api";
import { notificationService } from "@/services/NotificationService";

export type UserRole = "customer" | "provider" | "admin";
export type AppUserRole = "customer" | "provider";

export interface User {
  id: string;
  name: string;
  phone: string;
  role: AppUserRole;
  email?: string;
  profileImage?: string;
  profileColor?: string;
  location?: string;
  rating?: number;
  ratingCount?: number;
  totalJobs?: number;
  services?: string[];
  isVerified?: boolean;
  isAvailable?: boolean;
  bio?: string;
  experience?: string;
  joinedAt?: string;
  savedProviders?: string[];
  ratePerHour?: number | null;
  pendingCommission?: number;
  totalCommission?: number;
  commissionLimit?: number;
  isBlocked?: boolean;
  blockedReason?: string;
}

export interface RegisterData {
  name: string;
  phone: string;
  email?: string;
  role: AppUserRole;
  services?: string[];
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  requiresBiometric: boolean;
  sendOtp: (phone: string) => Promise<{ code: string; error?: string }>;
  verifyOtpAndLogin: (phone: string, code: string, remember?: boolean) => Promise<{ success: boolean; isNewUser: boolean; user?: User | null; error?: string }>;
  loginWithPassword: (identifier: string, password: string, remember?: boolean) => Promise<{ success: boolean; user?: User | null; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; user?: User | null; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => Promise<void>;
  toggleSaved: (providerId: string) => Promise<void>;
  completeBiometricLogin: () => Promise<{ success: boolean; error?: string }>;
  promptBiometricSetup: (phone: string, role?: AppUserRole) => Promise<void>;
  switchRole: (targetRole?: AppUserRole) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SAVED_KEY = "athoo_saved_providers";
const BIO_ENABLED_KEY = "athoo_biometric_enabled";
const BIO_PHONE_KEY = "athoo_biometric_phone";
const BIO_ROLE_KEY = "athoo_biometric_role";
const REMEMBER_KEY = "athoo_remember_me";

function toAppRole(role?: string): AppUserRole {
  return role === "provider" ? "provider" : "customer";
}

function sanitizeUser(raw: any): User {
  return { ...raw, role: toAppRole(raw?.role) };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresBiometric, setRequiresBiometric] = useState(false);

  const attachSavedProviders = useCallback(async (u: User | null) => {
    if (!u) return null;
    try {
      const savedRaw = await AsyncStorage.getItem(`${SAVED_KEY}_${u.id}`);
      const parsed = savedRaw ? JSON.parse(savedRaw) : [];
      return { ...u, savedProviders: Array.isArray(parsed) ? parsed : [] };
    } catch {
      return { ...u, savedProviders: [] };
    }
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const token = await getToken();
      const remember = await AsyncStorage.getItem(REMEMBER_KEY);
      const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      if (!token) {
        setUser(null);
        setRequiresBiometric(false);
        return;
      }
      if (remember === "true" && biometricEnabled === "true") {
        setUser(null);
        setRequiresBiometric(true);
        return;
      }
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) {
        await clearToken();
        setUser(null);
        setRequiresBiometric(false);
        return;
      }
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
    } catch {
      await clearToken();
      setUser(null);
      setRequiresBiometric(false);
    } finally {
      setIsLoading(false);
    }
  }, [attachSavedProviders]);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user) {
        realtime.stop();
        return;
      }
      const token = await getToken();
      if (!mounted || !token) return;
      await notificationService.syncPushToken(api.baseUrl, token);
      realtime.start();
    })();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    return () => { realtime.stop(); };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) return;
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
    } catch {}
  }, [attachSavedProviders]);

  const sendOtp = useCallback(async (phone: string) => {
    try {
      const res = await api.sendOtp(phone.trim());
      if (!res.code) return { code: "", error: res.message || "OTP code was not returned by the server" };
      return { code: res.code };
    } catch (e: unknown) {
      return { code: "", error: (e as Error)?.message || "Failed to send OTP" };
    }
  }, []);

  const verifyOtpAndLogin = useCallback(async (phone: string, code: string, remember = true) => {
    try {
      const res = await api.verifyOtp(phone.trim(), code.trim());
      if (!res.success) return { success: false, isNewUser: false, error: "Invalid OTP" };
      if (res.isNewUser) return { success: true, isNewUser: true, user: null };
      if (!res.token) return { success: false, isNewUser: false, error: "Login token not received from server" };
      await setToken(res.token, remember);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, isNewUser: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, isNewUser: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, isNewUser: false, user: hydrated };
    } catch (e: unknown) {
      return { success: false, isNewUser: false, error: (e as Error)?.message || "Verification failed" };
    }
  }, [attachSavedProviders]);

  const loginWithPassword = useCallback(async (identifier: string, password: string, remember = true) => {
    try {
      const res = await api.loginWithPassword({ identifier: identifier.trim(), password });
      if (!res.token) return { success: false, error: "Login token not received from server" };
      await setToken(res.token, remember);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (e: unknown) {
      return { success: false, error: (e as Error)?.message || "Login failed" };
    }
  }, [attachSavedProviders]);

  const register = useCallback(async (data: RegisterData) => {
    try {
      const res = await api.register({ name: data.name, phone: data.phone.trim(), email: data.email, role: data.role, services: data.services || [], password: data.password });
      if (!res.token) return { success: false, error: "Registration token not received from server" };
      await setToken(res.token, true);
      const savedToken = await getToken();
      if (!savedToken) return { success: false, error: "Token was not saved on device" };
      const me = await api.getMe();
      const rawUser = (me?.user as any) || (res.user as any) || null;
      if (!rawUser) return { success: false, error: "User profile could not be loaded" };
      const hydrated = await attachSavedProviders(sanitizeUser({ ...rawUser, savedProviders: [] }));
      setUser(hydrated);
      setRequiresBiometric(false);
      return { success: true, user: hydrated };
    } catch (e: unknown) {
      return { success: false, error: (e as Error)?.message || "Registration failed" };
    }
  }, [attachSavedProviders]);

  useEffect(() => {
    if (user?.id) {
      notificationService.init().catch(() => {});
    }
  }, [user?.id]);

  const logout = useCallback(async () => {
    try { await clearToken(); await AsyncStorage.removeItem(REMEMBER_KEY); }
    finally {
      setUser(null);
      setRequiresBiometric(false);
      try { router.replace("/auth/welcome" as any); } catch { router.replace("/" as any); }
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => { setUnauthorizedHandler(null); };
  }, [logout]);

  const updateUser = useCallback(async (data: Partial<User>) => {
    if (!user) return;
    try {
      const { savedProviders, id, role, phone, joinedAt, ...apiData } = data;
      if (Object.keys(apiData).length > 0) {
        const res = await api.updateMe(apiData as Parameters<typeof api.updateMe>[0]);
        const updated = { ...user, ...sanitizeUser(res.user as any), savedProviders: user.savedProviders };
        if (data.savedProviders !== undefined) updated.savedProviders = data.savedProviders;
        setUser(updated);
      } else if (data.savedProviders !== undefined) {
        setUser({ ...user, savedProviders: data.savedProviders });
      }
    } catch (err) {
      const { profileImage, profileColor, ...localSafeData } = data;
      if (Object.keys(localSafeData).length > 0) setUser({ ...user, ...localSafeData });
      if (profileImage !== undefined || profileColor !== undefined) throw err;
    }
  }, [user]);

  const toggleSaved = useCallback(async (providerId: string) => {
    if (!user || !providerId) return;
    const saved = Array.isArray(user.savedProviders) ? user.savedProviders : [];
    const exists = saved.includes(providerId);
    const newSaved = exists ? saved.filter((id) => id !== providerId) : [...saved, providerId];
    await AsyncStorage.setItem(`${SAVED_KEY}_${user.id}`, JSON.stringify(newSaved));
    setUser((current) => current ? { ...current, savedProviders: newSaved } : current);
  }, [user]);

  const switchRole = useCallback(async (targetRole?: AppUserRole) => {
    if (!user) return;
    const res = await api.switchRole(targetRole);
    if (!res?.token || !res?.user) throw new Error("Invalid response from server");
    const remember = (await AsyncStorage.getItem(REMEMBER_KEY)) === "true";
    await setToken(res.token, remember);
    const updatedUser = await attachSavedProviders(sanitizeUser(res.user as any));
    setUser(updatedUser);
    setRequiresBiometric(false);
    const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
    if (biometricEnabled === "true" && updatedUser?.phone) {
      await AsyncStorage.setItem(BIO_PHONE_KEY, updatedUser.phone);
      await AsyncStorage.setItem(BIO_ROLE_KEY, updatedUser.role);
    }
    router.replace(updatedUser?.role === "provider" ? "/(provider)/(tabs)/dashboard" : "/(customer)/(tabs)/home");
  }, [user, attachSavedProviders]);

  const completeBiometricLogin = useCallback(async () => {
    try {
      const biometricEnabled = await AsyncStorage.getItem(BIO_ENABLED_KEY);
      if (biometricEnabled !== "true") return { success: false, error: "Biometric login is not enabled" };
      let LocalAuthentication: any;
      try { LocalAuthentication = require("expo-local-authentication"); }
      catch { return { success: false, error: "expo-local-authentication is not installed" }; }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) return { success: false, error: "No biometric method is available on this device" };
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Sign in with biometrics", fallbackLabel: "Use OTP instead", cancelLabel: "Cancel", disableDeviceFallback: true, biometricsSecurityLevel: "strong" });
      if (!result.success) return { success: false, error: "Authentication cancelled or failed" };
      const token = await getToken();
      if (!token) return { success: false, error: "Session expired. Please login again." };
      const res = await api.getMe();
      const rawUser = (res?.user as any) || null;
      if (!rawUser) { await clearToken(); return { success: false, error: "Session expired. Please login again." }; }
      const hydrated = await attachSavedProviders(sanitizeUser(rawUser));
      setUser(hydrated); setRequiresBiometric(false);
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: (e as Error)?.message || "Biometric login failed" };
    }
  }, [attachSavedProviders]);

  const promptBiometricSetup = useCallback(async (phone: string, role?: AppUserRole) => {
    try {
      let LocalAuthentication: any; try { LocalAuthentication = require("expo-local-authentication"); } catch { return; }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        await AsyncStorage.removeItem(BIO_ENABLED_KEY);
        await AsyncStorage.removeItem(BIO_PHONE_KEY);
        await AsyncStorage.removeItem(BIO_ROLE_KEY);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable biometric login", fallbackLabel: "Cancel", cancelLabel: "Skip", disableDeviceFallback: true, biometricsSecurityLevel: "strong" });
      if (!result.success) return;
      await AsyncStorage.setItem(BIO_ENABLED_KEY, "true");
      await AsyncStorage.setItem(BIO_PHONE_KEY, phone);
      await AsyncStorage.setItem(BIO_ROLE_KEY, role || "customer");
    } catch {}
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, requiresBiometric, sendOtp, verifyOtpAndLogin, loginWithPassword, register, logout, updateUser, toggleSaved, completeBiometricLogin, promptBiometricSetup, switchRole, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

