import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/services/api";

export interface PublicSettings {
  platformName: string;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
  defaultVisitCharge: number;
  defaultCommissionLimit: number;
  defaultServiceRadiusKm: number;
  broadcastTTLMinutes: number;
  maxNegotiationRounds: number;
  premiumProfileBadgeEnabled: boolean;
  customerCancellationFee: number;
  providerCancellationPenalty: number;
  premiumCommissionDiscountPercent: number;
  commissionRate: number;
}

const FALLBACK_SETTINGS: PublicSettings = {
  platformName: "Athoo",
  supportPhone: "+92 339 0051068",
  supportEmail: "support@athoo.pk",
  maintenanceMode: false,
  defaultVisitCharge: 200,
  defaultCommissionLimit: 5000,
  defaultServiceRadiusKm: 25,
  broadcastTTLMinutes: 30,
  maxNegotiationRounds: 3,
  premiumProfileBadgeEnabled: true,
  customerCancellationFee: 0,
  providerCancellationPenalty: 0,
  premiumCommissionDiscountPercent: 0,
  commissionRate: 10,
};

interface SettingsContextValue {
  settings: PublicSettings;
  loading: boolean;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: FALLBACK_SETTINGS,
  loading: false,
  refresh: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getPublicSettings();
      if (res?.settings) {
        setSettings({ ...FALLBACK_SETTINGS, ...res.settings });
      }
    } catch {
      // Non-fatal — use fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
