import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const BIOMETRIC_KEY = "athoo_biometric_enabled";
const BIOMETRIC_PHONE_KEY = "athoo_biometric_phone";
const BIOMETRIC_ROLE_KEY = "athoo_biometric_role";

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return false;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ||
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<"face" | "fingerprint" | "none"> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
    return "none";
  } catch {
    return "none";
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_KEY);
  return val === "true";
}

export async function getBiometricPhone(): Promise<string | null> {
  return AsyncStorage.getItem(BIOMETRIC_PHONE_KEY);
}

export async function getBiometricRole(): Promise<string> {
  const role = await AsyncStorage.getItem(BIOMETRIC_ROLE_KEY);
  return role || "customer";
}

export async function enableBiometric(phone: string, role?: string): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, "true");
  await AsyncStorage.setItem(BIOMETRIC_PHONE_KEY, phone);
  if (role) await AsyncStorage.setItem(BIOMETRIC_ROLE_KEY, role);
}

export async function disableBiometric(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_PHONE_KEY);
  await AsyncStorage.removeItem(BIOMETRIC_ROLE_KEY);
}

export async function authenticateWithBiometric(promptMessage?: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || "Confirm your identity",
      cancelLabel: "Use OTP instead",
      disableDeviceFallback: true,
      biometricsSecurityLevel: "strong",
    });
    return result.success;
  } catch {
    return false;
  }
}

