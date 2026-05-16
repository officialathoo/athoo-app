import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Use the environment domain for API base when available.
const DEFAULT_LOCAL_API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

function sanitizeBaseUrl(value: string | undefined | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

const ENV_API_BASE_URL =
  Constants?.expoConfig?.extra?.API_BASE_URL ||
  Constants?.manifest?.extra?.API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "";

function browserOriginIfAvailable(): string {
  if (Platform.OS !== "web") return "";
  if (typeof window === "undefined" || !window.location) return "";
  return sanitizeBaseUrl(window.location.origin);
}

const API_BASE_URL =
  sanitizeBaseUrl(ENV_API_BASE_URL) ||
  browserOriginIfAvailable() ||
  DEFAULT_LOCAL_API;

const TOKEN_KEY = "athoo_token";
const REMEMBER_KEY = "athoo_remember_me";

const POSSIBLE_TOKEN_KEYS = [
  "token",
  "authToken",
  "accessToken",
  "jwt",
  "sessionToken",
  "athoo_token",
  "athoo_auth_token",
];

const DEFAULT_TIMEOUT_MS = 20000;
const RETRYABLE_METHODS = new Set(["GET"]);

let _unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  _unauthorizedHandler = fn;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: any;
  timeoutMs?: number;
};

export async function getToken(): Promise<string | null> {
  for (const key of POSSIBLE_TOKEN_KEYS) {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value) return value;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function setToken(token: string, remember = true): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

export async function clearToken(): Promise<void> {
  for (const key of POSSIBLE_TOKEN_KEYS) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  try {
    await AsyncStorage.removeItem(REMEMBER_KEY);
  } catch {
    // ignore
  }
}

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${normalizedPath}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("timeout") ||
    message.includes("network error") ||
    message.includes("request timed out") ||
    message.includes("the request timed out")
  );
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    auth = false,
    params,
    headers,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    method = "GET",
    ...rest
  } = options;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await getToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const url = buildUrl(path, params);
  const upperMethod = String(method).toUpperCase();
  const maxAttempts = RETRYABLE_METHODS.has(upperMethod) ? 2 : 1;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          ...rest,
          method: upperMethod,
          headers: finalHeaders,
          body: body instanceof FormData || body === undefined ? body : JSON.stringify(body),
        },
        timeoutMs
      );

      const raw = await response.text();
      let data: any = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = raw;
      }

      if (!response.ok) {
        if (response.status === 401) {
          _unauthorizedHandler?.();
        }
        const errorMessage =
          (typeof data === "object" && (data?.error || data?.message)) ||
          `Request failed (${response.status})`;
        const responseDetails =
          typeof data === "object" ? JSON.stringify(data) : String(data);

        throw new Error(
          `${errorMessage} [${response.status} ${response.statusText}] ${responseDetails}`
        );
      }

      return data as T;
    } catch (error) {
      lastError = error;

      const shouldRetry =
        attempt < maxAttempts && isRetryableNetworkError(error);

      if (!shouldRetry) {
        break;
      }

      await delay(1200);
    }
  }

  throw lastError;
}

export const api = {
  baseUrl: API_BASE_URL,

  request<T = any>(path: string, options: RequestOptions = {}) {
    return request<T>(path, options);
  },

  // Auth
  sendOtp(phone: string) {
    return request<{ success: boolean; code: string; message?: string }>("/api/auth/send-otp", {
      method: "POST",
      body: { phone },
    });
  },

  verifyOtp(phone: string, code: string) {
    return request<{ success: boolean; token?: string | null; user?: any; isNewUser?: boolean }>(
      "/api/auth/verify-otp",
      {
        method: "POST",
        body: { phone, code },
      }
    );
  },

  register(payload: {
    name: string;
    phone: string;
    email?: string;
    role: string;
    services?: string[];
    password?: string;
  }) {
    return request<{ success: boolean; token?: string; user?: any }>("/api/auth/register", {
      method: "POST",
      body: payload,
    });
  },

  loginWithPassword(payload: { identifier: string; password: string }) {
    return request<{ success: boolean; token?: string; user?: any }>("/api/auth/login", {
      method: "POST",
      body: payload,
    });
  },

  savePushToken(expoPushToken: string) {
    return request<{ success: boolean }>("/api/auth/push-token", {
      method: "PATCH",
      auth: true,
      body: { expoPushToken },
    });
  },

  getMe() {
    return request<{ user: any | null }>("/api/auth/me", {
      method: "GET",
      auth: true,
    });
  },

  getUser(userId: string) {
    return request<{ user: any }>(`/api/auth/users/${userId}`, {
      method: "GET",
      auth: true,
    });
  },

  updateMe(payload: Record<string, any>) {
    return request<{ user: any }>("/api/auth/me", {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  postDocument(payload: { type: string; label?: string; url: string }) {
    return request<{ document: any }>("/api/me/documents", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  deactivateMe() {
    return request<{ success: boolean }>("/api/auth/deactivate", {
      method: "POST",
      auth: true,
    });
  },

  deleteMe() {
    return request<{ success: boolean }>("/api/auth/me", {
      method: "DELETE",
      auth: true,
    });
  },

  async switchRole(role?: "customer" | "provider") {
    try {
      return await request<{ token?: string; user?: any }>("/api/auth/switch-role", {
        method: "POST",
        auth: true,
        body: role ? { role } : undefined,
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (
        message.includes("PROVIDER_PROFILE_REQUIRED") ||
        message.toLowerCase().includes("provider account yet")
      ) {
        throw new Error("PROVIDER_PROFILE_REQUIRED");
      }
      if (
        message.includes("Cannot POST /api/auth/switch-role") ||
        message.includes("[404")
      ) {
        throw new Error(
          "Role switch backend is not deployed yet. Update your backend on Render, then try again."
        );
      }
      throw error;
    }
  },

  setPassword(payload: { currentPassword?: string; newPassword: string }) {
    return request<{ success: boolean; user?: any }>("/api/auth/set-password", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Providers
  getProviders(serviceId?: string) {
    return request<{ providers: any[] }>("/api/providers", {
      params: { serviceId },
      method: "GET",
    });
  },

  getSavedProviders() {
    return request<{ providers: any[]; ids: string[] }>("/api/me/saved-providers", {
      method: "GET",
      auth: true,
    });
  },

  getProvider(providerId: string) {
    return request<{ provider: any }>(`/api/providers/${providerId}`, {
      method: "GET",
    });
  },

  getProviderReviews(providerId: string) {
    return request<{ reviews: any[] }>(`/api/providers/${providerId}/reviews`, {
      method: "GET",
    });
  },

  updateAvailability(isAvailable: boolean) {
    return request<{ user: any }>("/api/providers/availability", {
      method: "PATCH",
      auth: true,
      body: { isAvailable },
    });
  },

  getSchedule() {
    return request<{ schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }> }>("/api/me/schedule", {
      method: "GET",
      auth: true,
    });
  },

  updateSchedule(schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }>) {
    return request<{ schedule: Record<string, { enabled: boolean; startTime: string; endTime: string }> }>("/api/me/schedule", {
      method: "PATCH",
      auth: true,
      body: schedule,
    });
  },

  // Bookings
  getBookings() {
    return request<{ bookings: any[] }>("/api/bookings", {
      method: "GET",
      auth: true,
    });
  },

  createBooking(payload: any) {
    return request<{ booking: any }>("/api/bookings", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  async getBooking(id: string) {
    try {
      return await request<{ booking: any }>(`/api/bookings/${id}`, {
        method: "GET",
        auth: true,
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      const looksLikeMissingRoute =
        message.includes("Cannot GET /api/bookings/") || message.includes("[404");

      if (!looksLikeMissingRoute) {
        throw error;
      }

      const fallback = await request<{ bookings: any[] }>("/api/bookings", {
        method: "GET",
        auth: true,
      });

      const booking = (fallback.bookings || []).find(
        (item: any) => String(item?.id) === String(id)
      );
      if (!booking) {
        throw error;
      }

      return { booking };
    }
  },

  updateBookingStatus(id: string, status: string, price?: number) {
    return request<{ booking: any }>(`/api/bookings/${id}/status`, {
      method: "PATCH",
      auth: true,
      body: price !== undefined ? { status, price } : { status },
    });
  },

  markProviderArrived(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/arrived`, {
      method: "POST",
      auth: true,
    });
  },

  updateBookingLiveLocation(
    id: string,
    payload: {
      providerLat: number;
      providerLng: number;
      providerAccuracy?: number | null;
      providerUpdatedAt?: string;
    }
  ) {
    return request<{ booking: any }>(`/api/bookings/${id}/live-location`, {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },

  rateBooking(id: string, rating: number, review: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/rate`, {
      method: "PATCH",
      auth: true,
      body: { rating, review },
    });
  },

  markBookingPaid(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/mark-paid`, {
      method: "POST",
      auth: true,
    });
  },

  markBookingReceived(id: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/mark-received`, {
      method: "POST",
      auth: true,
    });
  },

  generateStartPin(id: string) {
    return request<{ booking: any; pinPrepared?: boolean }>(
      `/api/bookings/${id}/generate-start-pin`,
      {
        method: "POST",
        auth: true,
      }
    );
  },

  verifyStartPin(id: string, pin: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/verify-start-pin`, {
      method: "POST",
      auth: true,
      body: { pin },
    });
  },

  generateCompletePin(id: string) {
    return request<{ booking: any; pinPrepared?: boolean }>(
      `/api/bookings/${id}/generate-complete-pin`,
      {
        method: "POST",
        auth: true,
      }
    );
  },

  verifyCompletePin(id: string, pin: string) {
    return request<{ booking: any }>(`/api/bookings/${id}/verify-complete-pin`, {
      method: "POST",
      auth: true,
      body: { pin },
    });
  },

  // Chat
  getChats() {
    return request<{ chats: any[] }>("/api/chat", { method: "GET", auth: true });
  },

  getMessages(chatId: string, since?: string, limit?: number) {
    return request<{ messages: any[] }>(`/api/chat/${chatId}/messages`, {
      method: "GET",
      auth: true,
      params: { since, limit },
    });
  },

  getOrCreateChat(payload: {
    otherUserId: string;
    otherUserName: string;
    myName: string;
    bookingId?: string;
    service?: string;
  }) {
    return request<{ chat: any }>("/api/chat", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  sendMessage(chatId: string, text: string, senderName: string) {
    return request<{ message: any }>(`/api/chat/${chatId}/messages`, {
      method: "POST",
      auth: true,
      body: { text, senderName },
    });
  },

  markChatRead(chatId: string) {
    return request<{ success: boolean }>(`/api/chat/${chatId}/read`, {
      method: "POST",
      auth: true,
    });
  },

  deleteChat(chatId: string) {
    return request<{ success: boolean; message: string }>(`/api/chat/${chatId}`, {
      method: "DELETE",
      auth: true,
    });
  },

  // Negotiations
  getNegotiations() {
    return request<{ negotiations: any[] }>("/api/negotiations", {
      method: "GET",
      auth: true,
    });
  },

  createNegotiation(payload: {
    providerId: string;
    providerName: string;
    customerName: string;
    service: string;
    customerOffer: number;
  }) {
    return request<{ negotiation: any }>("/api/negotiations", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  counterOffer(id: string, amount: number, message: string, senderName: string) {
    return request<{ negotiation: any }>(`/api/negotiations/${id}/counter`, {
      method: "PATCH",
      auth: true,
      body: { amount, message, senderName },
    });
  },

  acceptOffer(id: string, finalPrice: number) {
    return request<{ negotiation: any }>(`/api/negotiations/${id}/accept`, {
      method: "PATCH",
      auth: true,
      body: { finalPrice },
    });
  },

  rejectOffer(id: string) {
    return request<{ negotiation: any }>(`/api/negotiations/${id}/reject`, {
      method: "PATCH",
      auth: true,
    });
  },

  // Calls
  getIncomingCall() {
    return request<{ call: any | null }>("/api/calls/incoming", {
      method: "GET",
      auth: true,
    });
  },

  startCall(payload: {
    receiverId: string;
    callerName: string;
    callerInitials?: string;
    callerColor?: string;
    service?: string;
    offer?: string;
  }) {
    return request<{ call: any }>("/api/calls", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  getCallStatus(callId: string) {
    return request<{ call: any }>(`/api/calls/${callId}/status`, {
      method: "GET",
      auth: true,
    });
  },

  acceptCall(callId: string, payload?: { answer?: string }) {
    return request<{ call: any }>(`/api/calls/${callId}/accept`, {
      method: "PATCH",
      auth: true,
      body: payload || {},
    });
  },

  rejectCall(callId: string) {
    return request<{ success: boolean }>(`/api/calls/${callId}/reject`, {
      method: "PATCH",
      auth: true,
    });
  },

  endCall(callId: string) {
    return request<{ success: boolean }>(`/api/calls/${callId}/end`, {
      method: "PATCH",
      auth: true,
    });
  },

  addIceCandidate(callId: string, candidate: any, role: "caller" | "callee") {
    return request<{ success: boolean }>(`/api/calls/${callId}/ice-candidate`, {
      method: "POST",
      auth: true,
      body: { candidate, role },
    });
  },

  uploadAudioChunk(callId: string, data: string, ext: string) {
    return request<{ index: number }>(`/api/calls/${callId}/audio`, {
      method: "POST",
      auth: true,
      body: { data, ext },
    });
  },

  fetchAudioChunks(callId: string, from = 0) {
    return request<
      { chunks: { index: number; data: string; ext: string }[] }[] |
      { chunks: { index: number; data: string; ext: string }[] }
    >(`/api/calls/${callId}/audio`, {
      method: "GET",
      auth: true,
      params: { from },
    });
  },

  getAddresses() {
    return request<{ addresses: any[] }>("/api/addresses", { method: "GET", auth: true });
  },

  addAddress(data: { label: string; address: string; icon?: string; latitude?: number | null; longitude?: number | null }) {
    return request<{ address: any }>("/api/addresses", { method: "POST", auth: true, body: data });
  },

  setDefaultAddress(id: string) {
    return request<{ addresses: any[] }>(`/api/addresses/${id}/default`, { method: "PATCH", auth: true });
  },

  deleteAddress(id: string) {
    return request<{ addresses: any[] }>(`/api/addresses/${id}`, { method: "DELETE", auth: true });
  },


  // Support
  createSupportTicket(payload: { subject: string; message: string; bookingId?: string | null; priority?: string }) {
    return request<{ ticket: any }>("/api/support", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  submitComplaint(payload: { subject?: string; title?: string; message?: string; description?: string; bookingId?: string | null; priority?: string }) {
    return request<{ ticket: any }>("/api/support", {
      method: "POST",
      auth: true,
      body: {
        subject: payload.subject || payload.title,
        message: payload.message || payload.description,
        bookingId: payload.bookingId || null,
        priority: payload.priority || "normal",
      },
    });
  },

  getMySupportTickets() {
    return request<{ tickets: any[] }>("/api/support/my", {
      method: "GET",
      auth: true,
    });
  },

  getSupportTicketDetail(ticketId: string) {
    return request<{ ticket: any; replies: any[] }>(`/api/support/${ticketId}`, {
      method: "GET",
      auth: true,
    });
  },

  getNotifications() {
    return request<{ notifications: any[]; unread?: number }>("/api/me/notifications", {
      method: "GET",
      auth: true,
    });
  },

  markNotificationRead(id: string) {
    return request<{ success: boolean }>(`/api/me/notifications/${id}/read`, {
      method: "PATCH",
      auth: true,
    });
  },

  markAllNotificationsRead() {
    return request<{ success: boolean }>("/api/me/notifications/read-all", {
      method: "POST",
      auth: true,
    });
  },

  deleteNotification(id: string) {
    return request<{ success: boolean }>(`/api/me/notifications/${id}`, {
      method: "DELETE",
      auth: true,
    });
  },

  deleteAllNotifications() {
    return request<{ success: boolean }>("/api/me/notifications", {
      method: "DELETE",
      auth: true,
    });
  },

  chatbot(message: string) {
    return request<{ reply: string; role: string }>("/api/chatbot", {
      method: "POST",
      auth: true,
      body: { message },
    });
  },

  registerPushToken(token: string, platform: string) {
    return request<{ success: boolean }>("/api/auth/push-token", {
      method: "POST",
      auth: true,
      body: { token, platform },
    });
  },

  // ────────────────── Categories ──────────────────
  getCategories() {
    return request<{ categories: any[] }>("/api/categories", { method: "GET" });
  },

  // ────────────────── Payments / Commission ──────────────────
  getPublicSettings() {
    return request<{ settings: any }>("/api/settings/public", { method: "GET" });
  },

  getPaymentAccounts() {
    return request<{ accounts: any[] }>("/api/payments/accounts", { method: "GET" });
  },
  getMyPayments() {
    return request<{ payments: any[]; pendingCommission: number }>("/api/payments/me", {
      method: "GET",
      auth: true,
    });
  },
  submitCommissionPayment(payload: {
    amount: number;
    accountId?: string | null;
    reference?: string;
    screenshotUrl?: string;
    note?: string;
  }) {
    return request<{ payment: any }>("/api/payments", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // ────────────────── Account self-service ──────────────────
  updateAccountProfile(payload: Record<string, any>) {
    return request<{ user: any }>("/api/me/account/profile", {
      method: "PATCH",
      auth: true,
      body: payload,
    });
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ success: boolean }>("/api/me/account/password", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  deactivateAccount(payload: { password?: string } = {}) {
    return request<{ success: boolean }>("/api/me/account/deactivate", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  reactivateAccount() {
    return request<{ success: boolean }>("/api/me/account/reactivate", {
      method: "POST",
      auth: true,
    });
  },
  requestAccountDeletion(payload: { reason?: string; password?: string } = {}) {
    return request<{ scheduledDeleteAt: string }>("/api/me/account/delete-request", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  cancelAccountDeletion() {
    return request<{ success: boolean }>("/api/me/account/delete-request/cancel", {
      method: "POST",
      auth: true,
    });
  },
  requestEmailChange(newEmail: string) {
    return request<{ success: boolean; code?: string }>("/api/me/account/email/request", {
      method: "POST",
      auth: true,
      body: { newEmail },
    });
  },
  verifyEmailChange(code: string) {
    return request<{ success: boolean }>("/api/me/account/email/verify", {
      method: "POST",
      auth: true,
      body: { code },
    });
  },
  requestPhoneChange(newPhone: string) {
    return request<{ success: boolean; code?: string }>("/api/me/account/phone/request", {
      method: "POST",
      auth: true,
      body: { newPhone },
    });
  },
  verifyPhoneChange(code: string) {
    return request<{ success: boolean }>("/api/me/account/phone/verify", {
      method: "POST",
      auth: true,
      body: { code },
    });
  },
  requestServiceAdd(payload: {
    serviceName: string;
    serviceCategoryId?: string;
    documents?: Array<{ type: string; url: string; label?: string }>;
    note?: string;
  }) {
    return request<{ request: any }>("/api/me/account/services/request", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  getMyServiceRequests() {
    return request<{ requests: any[] }>("/api/me/account/services/requests", {
      method: "GET",
      auth: true,
    });
  },

  // ────────────────── Subscriptions / Premium ──────────────────
  getSubscriptionPlans(audience?: "provider" | "customer") {
    return request<{ plans: any[] }>("/api/subscriptions/plans", {
      method: "GET",
      params: audience ? { audience } : undefined,
    });
  },
  getMySubscription() {
    return request<{ active: any | null; history: any[] }>(
      "/api/subscriptions/me",
      { method: "GET", auth: true }
    );
  },
  subscribeToPlan(payload: {
    planId: string;
    billingPeriod: "monthly" | "yearly";
    paymentReference?: string;
    screenshotUrl?: string;
    accountId?: string | null;
  }) {
    return request<{ subscription: any }>("/api/subscriptions/subscribe", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },
  cancelMySubscription() {
    return request<{ success: boolean }>("/api/subscriptions/cancel", {
      method: "POST",
      auth: true,
    });
  },

  createBroadcastRequest(payload: {
    service: string;
    serviceLabel: string;
    serviceIcon?: string;
    description?: string;
    videoUrl?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    scheduledDate: string;
    scheduledTime: string;
    customerOffer?: number;
    customerRatePerHour?: number;
    customerHours?: number;
    customerTravelCharge?: number;
  }) {
    return request<{ request: any }>("/api/broadcast", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  getBroadcastRequests(params?: { status?: string; service?: string }) {
    return request<{ requests: any[] }>("/api/broadcast", {
      method: "GET",
      auth: true,
      params,
    });
  },

  getBroadcastRequest(id: string) {
    return request<{ request: any }>(`/api/broadcast/${id}`, {
      method: "GET",
      auth: true,
    });
  },

  respondToBroadcast(requestId: string, payload: { providerOffer?: number; ratePerHour?: number; hours?: number; travelCharge?: number; isDirectAccept?: boolean; message?: string }) {
    return request<{ response: any }>(`/api/broadcast/${requestId}/respond`, {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  withdrawBroadcastResponse(requestId: string) {
    return request<{ success: boolean }>(`/api/broadcast/${requestId}/respond/withdraw`, {
      method: "POST",
      auth: true,
    });
  },

  selectBroadcastResponse(requestId: string, responseId: string) {
    return request<{ booking: any }>(`/api/broadcast/${requestId}/select/${responseId}`, {
      method: "POST",
      auth: true,
    });
  },

  cancelBroadcastRequest(requestId: string) {
    return request<{ success: boolean }>(`/api/broadcast/${requestId}/cancel`, {
      method: "POST",
      auth: true,
    });
  },

  // Withdrawals (provider)
  getMyWithdrawals() {
    return request<{ withdrawals: any[] }>("/api/withdrawals/me", {
      method: "GET",
      auth: true,
    });
  },

  requestWithdrawal(payload: { amount: number; accountTitle: string; accountNumber: string; bankName?: string; iban?: string; note?: string }) {
    return request<{ withdrawal: any }>("/api/withdrawals", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Refunds (customer)
  getMyRefunds() {
    return request<{ refunds: any[] }>("/api/refunds/me", {
      method: "GET",
      auth: true,
    });
  },

  requestRefund(payload: { bookingId: string; reason: string; amountRequested: number; evidenceUrl?: string }) {
    return request<{ refund: any }>("/api/refunds", {
      method: "POST",
      auth: true,
      body: payload,
    });
  },

  // Promotions
  validatePromo(code: string, bookingValue?: number) {
    return request<{ promo?: { id: string; code: string; description: string | null; discountType: "fixed" | "percent"; discountValue: number }; discount?: number; finalAmount?: number; valid?: boolean; promotion?: any; error?: string }>("/api/promotions/validate", {
      method: "POST",
      auth: true,
      body: { code, bookingValue: bookingValue ?? 0 },
    });
  },

  redeemPromo(code: string, bookingId?: string) {
    return request<{ success: boolean; discount?: number }>("/api/promotions/redeem", {
      method: "POST",
      auth: true,
      body: { code, bookingId },
    });
  },

  // ────────────────── Marketing / CMS ──────────────────
  getMarketingBanners(audience: "customer" | "provider" = "customer") {
    return request<{
      banners: Array<{
        id: string;
        title: string;
        subtitle?: string | null;
        imageUrl?: string | null;
        bgColorFrom: string;
        bgColorTo: string;
        iconName: string;
        linkType: string;
        linkTarget?: string | null;
        targetAudience: string;
        sortOrder: number;
      }>;
    }>(`/api/marketing/banners?audience=${audience}`, { method: "GET" });
  },

  getAnnouncements(audience: "customer" | "provider" = "customer") {
    return request<{
      announcements: Array<{
        id: string;
        title: string;
        message: string;
        buttonText: string;
        buttonLink?: string | null;
        imageUrl?: string | null;
        showOnce: boolean;
        priority: number;
      }>;
    }>(`/api/marketing/announcements?audience=${audience}`, { method: "GET" });
  },

  getFaqs(audience: "customer" | "provider" = "customer") {
    return request<{
      faqs: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        sortOrder: number;
      }>;
    }>(`/api/marketing/faqs?audience=${audience}`, { method: "GET" });
  },

  getServiceAreas() {
    return request<{ areas: Array<{ id: string; name: string; province?: string | null }> }>(
      "/api/marketing/areas",
      { method: "GET" }
    );
  },

  getEmergencyContacts() {
    return request<{
      contacts: Array<{
        id: string;
        name: string;
        number: string;
        description?: string | null;
        icon: string;
        sortOrder: number;
      }>;
    }>("/api/emergency-contacts", { method: "GET" });
  },

  reportIssue(body: {
    bookingId?: string;
    reportedId?: string;
    reportedName?: string;
    category: string;
    description: string;
  }) {
    return request<{ report: { id: string; status: string } }>(
      "/api/report-issues",
      { method: "POST", body }
    );
  },

  getPlatformStats() {
    return request<{ providerCount: number; categoryCount: number; avgRating: number }>(
      "/api/providers/stats",
      { method: "GET" }
    );
  },

  getActiveServiceAreas() {
    return request<{ areas: Array<{ id: string; name: string; province?: string | null; isActive: boolean }> }>(
      "/api/service-areas",
      { method: "GET" }
    );
  },

  adminBroadcastPush(body: { title: string; body: string; audience: "all" | "customer" | "provider" }) {
    return request<{ sent: number; tokenCount: number; audience: string }>(
      "/api/admin/broadcast-push",
      { method: "POST", body }
    );
  },
};

export type RealtimeEventName =
  | "booking:new"
  | "booking:updated"
  | "booking:status"
  | "booking:arrived"
  | "booking:started"
  | "booking:completed"
  | "booking:cancelled"
  | "booking:location"
  | "negotiation:new"
  | "negotiation:updated"
  | "negotiation:accepted"
  | "negotiation:rejected"
  | "chat:message"
  | "notification:new"
  | "broadcast:new"
  | "broadcast:response"
  | "broadcast:accepted"
  | "broadcast:cancelled";

type RealtimeMessage = { type: RealtimeEventName | string; payload: any };
type Listener = (msg: RealtimeMessage) => void;

let realtimeSocket: WebSocket | null = null;
let realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeShouldReconnect = false;
const realtimeListeners = new Set<Listener>();

function buildEventsUrl(token: string): string {
  const base = API_BASE_URL.replace(/^http/, "ws");
  return `${base}/api/ws/events?token=${encodeURIComponent(token)}`;
}

async function openRealtimeSocket(): Promise<void> {
  const token = await getToken();
  if (!token) return;
  try {
    const ws = new WebSocket(buildEventsUrl(token));
    realtimeSocket = ws;
    ws.onmessage = (evt: MessageEvent) => {
      try {
        const data = typeof evt.data === "string" ? evt.data : "";
        if (!data) return;
        const parsed = JSON.parse(data) as RealtimeMessage;
        if (!parsed || !parsed.type) return;
        realtimeListeners.forEach((fn) => {
          try { fn(parsed); } catch {}
        });
      } catch {}
    };
    ws.onclose = () => {
      realtimeSocket = null;
      if (realtimeShouldReconnect) {
        if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = setTimeout(() => { openRealtimeSocket(); }, 3000);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  } catch {
    if (realtimeShouldReconnect) {
      if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = setTimeout(() => { openRealtimeSocket(); }, 3000);
    }
  }
}

export const realtime = {
  start() {
    realtimeShouldReconnect = true;
    if (!realtimeSocket) openRealtimeSocket();
  },
  stop() {
    realtimeShouldReconnect = false;
    if (realtimeReconnectTimer) {
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }
    if (realtimeSocket) {
      try { realtimeSocket.close(); } catch {}
      realtimeSocket = null;
    }
  },
  on(listener: Listener): () => void {
    realtimeListeners.add(listener);
    return () => { realtimeListeners.delete(listener); };
  },
  isOpen(): boolean {
    return !!realtimeSocket && realtimeSocket.readyState === 1;
  },
};

export default api;
