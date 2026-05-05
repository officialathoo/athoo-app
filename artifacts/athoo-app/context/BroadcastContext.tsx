import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, realtime } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { notificationService } from "@/services/NotificationService";
import { soundService } from "@/services/SoundService";

interface BroadcastContextType {
  openBroadcastCount: number;
  latestBroadcast: any | null;
  refreshBroadcasts: () => void;
}

const BroadcastContext = createContext<BroadcastContextType>({
  openBroadcastCount: 0,
  latestBroadcast: null,
  refreshBroadcasts: () => {},
});

export function useBroadcast() {
  return useContext(BroadcastContext);
}

export function BroadcastProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { push } = useNotifications();
  const [openBroadcastCount, setOpenBroadcastCount] = useState(0);
  const [latestBroadcast, setLatestBroadcast] = useState<any | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refreshBroadcasts = useCallback(async () => {
    if (!user || user.role !== "provider") return;
    try {
      const res = await api.getBroadcastRequests();
      if (!mountedRef.current) return;
      setOpenBroadcastCount(res.requests?.length ?? 0);
    } catch {
      // silently fail
    }
  }, [user]);

  // Poll every 60s for providers
  useEffect(() => {
    mountedRef.current = true;
    if (!user || user.role !== "provider") {
      setOpenBroadcastCount(0);
      return;
    }

    refreshBroadcasts();
    pollRef.current = setInterval(refreshBroadcasts, 60_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, refreshBroadcasts]);

  // Real-time WebSocket listener
  useEffect(() => {
    if (!user || user.role !== "provider") return;

    const off = realtime.on((msg) => {
      if (msg.type === "broadcast:new") {
        const req = msg.payload?.request;
        if (!mountedRef.current) return;

        setLatestBroadcast(req ?? null);
        setOpenBroadcastCount((prev) => prev + 1);

        const serviceLabel = req?.serviceLabel ?? "service";
        const priceText = req?.customerOffer ? `Rs. ${req.customerOffer}` : "open price";
        const title = "New Broadcast Job!";
        const message = `${serviceLabel} — ${priceText} · ${req?.address ?? ""}`;

        push({
          type: "booking",
          title,
          message,
          role: "provider",
        });

        notificationService
          .scheduleBroadcastAlert(title, message, {
            broadcastRequestId: req?.id,
          })
          .catch(() => {});

        soundService.playNotification().catch(() => {});
      }

      if (msg.type === "broadcast:accepted" || msg.type === "broadcast:cancelled") {
        refreshBroadcasts();
      }
    });

    return off;
  }, [user, push, refreshBroadcasts]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return (
    <BroadcastContext.Provider
      value={{ openBroadcastCount, latestBroadcast, refreshBroadcasts }}
    >
      {children}
    </BroadcastContext.Provider>
  );
}
