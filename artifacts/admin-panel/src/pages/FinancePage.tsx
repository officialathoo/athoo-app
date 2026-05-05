import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { User, Booking } from "@/lib/types";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { Wallet, TrendingUp, Clock, AlertCircle, RefreshCw, Settings, Download, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlatformSettings {
  commissionRate: number;
  defaultCommissionLimit: number;
}

export function FinancePage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<User[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>({ commissionRate: 10, defaultCommissionLimit: 5000 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ commissionRate: "10", defaultCommissionLimit: "5000" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [tab, setTab] = useState<"dues" | "transactions">("dues");
  const [pendingConfirm, setPendingConfirm] = useState<{ label: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersRes, bookingsRes, settingsRes] = await Promise.all([
        api<{ users: User[] }>("/api/admin/users"),
        api<{ bookings: Booking[] }>("/api/admin/bookings"),
        api<{ settings: PlatformSettings }>("/api/admin/settings"),
      ]);
      setProviders((usersRes.users || []).filter((u) => u.role === "provider"));
      setBookings((bookingsRes.bookings || []).filter((b) => b.status === "completed" && (b.commissionAmount || 0) > 0));
      if (settingsRes.settings) {
        setSettings(settingsRes.settings);
        setSettingsForm({
          commissionRate: String(settingsRes.settings.commissionRate),
          defaultCommissionLimit: String(settingsRes.settings.defaultCommissionLimit),
        });
      }
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const totalPendingCommission = providers.reduce((sum, p) => sum + (p.pendingCommission || 0), 0);
  const totalEarnedCommission = providers.reduce((sum, p) => sum + (p.totalCommission || 0), 0);
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const blockedCount = providers.filter((p) => p.isBlocked).length;

  async function handleMarkPaid(providerId: string) {
    setActionLoading(providerId);
    try {
      await api(`/api/admin/users/${providerId}/mark-commission-paid`, { method: "PATCH" });
      await load();
      toast({ title: "Commission marked as paid" });
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  function handleMarkAllPaid() {
    setPendingConfirm({
      label: "Mark ALL provider commissions as paid?",
      action: async () => {
        setActionLoading("all");
        try {
          for (const p of dueProviders) {
            await api(`/api/admin/users/${p.id}/mark-commission-paid`, { method: "PATCH" });
          }
          await load();
          toast({ title: "All commissions marked as paid" });
        } catch (e) {
          toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
        } finally {
          setActionLoading(null);
        }
      },
    });
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await api<{ settings: PlatformSettings }>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          commissionRate: Number(settingsForm.commissionRate),
          defaultCommissionLimit: Number(settingsForm.defaultCommissionLimit),
        }),
      });
      setSettings(res.settings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      setShowSettings(false);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Failed to save settings", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  function exportCSV() {
    const rows = [
      ["Provider", "Phone", "Pending Commission", "Total Earned", "Limit", "Status"],
      ...dueProviders.map((p) => [
        p.name, p.phone,
        p.pendingCommission || 0,
        p.totalCommission || 0,
        p.commissionLimit || settings.defaultCommissionLimit,
        p.isBlocked ? "Blocked" : "Active",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-dues-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dueProviders = providers
    .filter((p) => (p.pendingCommission || 0) > 0)
    .sort((a, b) => (b.pendingCommission || 0) - (a.pendingCommission || 0));

  return (
    <div className="space-y-6">
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-5">
              <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-slate-800">{pendingConfirm.label}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button
                onClick={async () => { const a = pendingConfirm; setPendingConfirm(null); await a.action(); }}
                disabled={!!actionLoading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
      {loadError && (
        <div className="px-4 py-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span>Failed to load finance data: {loadError}</span>
          <button onClick={load} className="underline text-red-700 hover:text-red-900 ml-3">Retry</button>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={currency(totalRevenue)} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
        <StatCard label="Total Commission" value={currency(totalEarnedCommission)} icon={Wallet} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <StatCard label="Pending Dues" value={currency(totalPendingCommission)} icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" />
        <StatCard label="Blocked Providers" value={blockedCount} icon={AlertCircle} iconColor="text-red-600" iconBg="bg-red-50" />
      </div>

      {/* Commission Rate Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-800">Current Commission Rate: {settings.commissionRate}%</p>
          <p className="text-xs text-blue-600 mt-0.5">Default limit per provider: {currency(settings.defaultCommissionLimit)}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Settings size={14} />
          Edit Rate
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setTab("dues")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "dues" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Provider Dues ({dueProviders.length})
            </button>
            <button
              onClick={() => setTab("transactions")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "transactions" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Transactions ({bookings.length})
            </button>
          </div>
          <div className="flex items-center gap-2">
            {tab === "dues" && dueProviders.length > 0 && (
              <>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors font-medium"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={handleMarkAllPaid}
                  disabled={actionLoading === "all"}
                  className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Mark All Paid
                </button>
              </>
            )}
            <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {tab === "dues" && (
          <DataTable
            data={dueProviders}
            loading={loading}
            keyExtractor={(p) => p.id}
            emptyMessage="No providers with pending dues."
            columns={[
              {
                header: "Provider",
                render: (p) => (
                  <div>
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.phone}</p>
                  </div>
                ),
              },
              {
                header: "Pending Due",
                render: (p) => (
                  <span className="text-sm font-semibold text-amber-700">{currency(p.pendingCommission)}</span>
                ),
              },
              {
                header: "Limit",
                render: (p) => (
                  <div>
                    <span className="text-sm text-slate-600">{currency(p.commissionLimit || settings.defaultCommissionLimit)}</span>
                    <div className="mt-1 h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${Math.min(100, ((p.pendingCommission || 0) / (p.commissionLimit || settings.defaultCommissionLimit)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                header: "Total Earned",
                render: (p) => <span className="text-sm text-slate-600">{currency(p.totalCommission)}</span>,
              },
              {
                header: "Status",
                render: (p) => (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    p.isBlocked
                      ? "bg-red-50 text-red-700 border-red-200"
                      : (p.pendingCommission || 0) >= (p.commissionLimit || settings.defaultCommissionLimit) * 0.8
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-green-50 text-green-700 border-green-200"
                  }`}>
                    {p.isBlocked ? "Blocked" : (p.pendingCommission || 0) >= (p.commissionLimit || settings.defaultCommissionLimit) * 0.8 ? "Near Limit" : "Active"}
                  </span>
                ),
              },
              {
                header: "",
                render: (p) => (
                  <button
                    disabled={actionLoading === p.id || actionLoading === "all"}
                    onClick={() => handleMarkPaid(p.id)}
                    className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Mark Paid
                  </button>
                ),
              },
            ]}
          />
        )}

        {tab === "transactions" && (
          <DataTable
            data={bookings.slice(0, 100)}
            loading={loading}
            keyExtractor={(b) => b.id}
            emptyMessage="No completed bookings with commission yet."
            columns={[
              {
                header: "Service",
                render: (b) => (
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{b.service}</p>
                    <p className="text-xs text-slate-400 truncate max-w-[160px]">{b.address}</p>
                  </div>
                ),
              },
              { header: "Customer", render: (b) => <span className="text-sm">{b.customerName}</span> },
              { header: "Provider", render: (b) => <span className="text-sm">{b.providerName}</span> },
              { header: "Price", render: (b) => <span className="text-sm font-medium">{currency(b.price)}</span> },
              {
                header: `Commission (${settings.commissionRate}%)`,
                render: (b) => <span className="text-sm text-blue-700 font-medium">{currency(b.commissionAmount)}</span>,
              },
              { header: "Provider Got", render: (b) => <span className="text-sm text-green-700 font-medium">{currency(b.providerAmount)}</span> },
              { header: "Date", render: (b) => <span className="text-xs text-slate-500">{formatDate(b.updatedAt)}</span> },
            ]}
          />
        )}
      </div>

      {/* Commission Rate Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Commission Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Commission Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settingsForm.commissionRate}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, commissionRate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10"
                />
                <p className="text-xs text-slate-400 mt-1">Platform commission percentage applied to each booking</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Default Commission Limit (Rs.)</label>
                <input
                  type="number"
                  min={0}
                  value={settingsForm.defaultCommissionLimit}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, defaultCommissionLimit: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5000"
                />
                <p className="text-xs text-slate-400 mt-1">Max pending commission before provider is blocked</p>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {settingsSaved ? <><CheckCircle size={16} /> Saved!</> : savingSettings ? "Saving..." : "Save Settings"}
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

