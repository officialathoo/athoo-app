import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || "";

export async function sendExpoPushNotifications(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, unknown> },
) {
  const cleanTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!cleanTokens.length) return { sent: 0 };

  const messages = cleanTokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  }));

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };

    if (EXPO_ACCESS_TOKEN) {
      headers["Authorization"] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });

    const result = await response.text();
    logger.info({ sent: cleanTokens.length }, "expo push sent");
    return { sent: cleanTokens.length, result };
  } catch (error) {
    logger.error({ err: error }, "expo push send error");
    return { sent: 0, error: String((error as any)?.message || error) };
  }
}

export async function getAudiencePushTokens(audience: string) {
  if (audience === "all") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(isNotNull(usersTable.expoPushToken));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  if (audience === "providers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "provider"), isNotNull(usersTable.expoPushToken)));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  if (audience === "customers") {
    const rows = await db
      .select({ token: usersTable.expoPushToken })
      .from(usersTable)
      .where(and(eq(usersTable.role, "customer"), isNotNull(usersTable.expoPushToken)));
    return rows.map((r) => r.token).filter(Boolean) as string[];
  }

  return [];
}
