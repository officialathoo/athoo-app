import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { User } from "@/lib/types";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Search, RefreshCw, Edit2, X, ShieldCheck, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ProvidersPage() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [commissionLimit, setCommissionLimit] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", location: "", ratePerHour: "" });
  const [pendingConfirm, setPendingConfirm] = useState<{ label: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ users: User[] }>("/api/admin/users");
      setProviders((res.users || []).filter((u) => u.role === "provider"));
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openProvider(p: User) {
    setSelectedProvider(p);
    setCommissionLimit(String(p.commissionLimit || 5000));
    setEditMode(false);
    setEditForm({ name: p.name || "", email: p.email || "", location: p.location || "", ratePerHour: p.ratePerHour ? String(p.ratePerHour) : "" });
  }

  const filtered = providers.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.phone.includes(q);
    const matchFilter =
      filter === "all" ||
      (filter === "blocked" && p.isBlocked) ||
      (filter === "verified" && p.isVerified) ||
      (filter === "unverified" && !p.isVerified) ||
      (filter === "deactivated" && p.isDeactivated);
    return matchSearch && matchFilter;
  });

  async function handleToggleBlock(provider: User, block: boolean) {
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${provider.id}/${block ? "block" : "unblock"}`, {
        method: "PATCH",
        body: JSON.stringify({ reason: block ? "Commission due limit reached" : null }),
      });
      await load();
      setSelectedProvider(null);
      toast({ title: block ? "Provider blocked" : "Provider unblocked", description: provider.name });
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  function handleToggleVerify(provider: User) {
    const next = !provider.isVerified;
    setPendingConfirm({
      label: `${next ? "Verify" : "Unverify"} ${provider.name}?`,
      action: async () => {
        setActionLoading(true);
        try {
          await api(`/api/admin/users/${provider.id}/verify`, {
            method: "PATCH",
            body: JSON.stringify({ isVerified: next }),
          });
          await load();
          setSelectedProvider(null);
          toast({ title: next ? "Provider verified" : "Provider unverified", description: provider.name });
        } catch (e) {
          toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
        } finally { setActionLoading(false); }
      },
    });
  }

  async function handleUpdateCommissionLimit(provider: User) {
    const limit = Number(commissionLimit);
    if (!Number.isFinite(limit) || limit < 100) {
      toast({ title: "Invalid limit", description: "Enter a valid limit (min 100)", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${provider.id}/commission-limit`, {
        method: "PATCH",
        body: JSON.stringify({ commissionLimit: limit }),
      });
      await load();
      setSelectedProvider(null);
      toast({ title: "Commission limit updated", description: `Rs ${limit.toLocaleString()}` });
    } catch (e) {
      toast({ title: "Failed to update limit", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  function handleMarkPaid(provider: User) {
    setPendingConfirm({
      label: `Mark all pending commission as paid for ${provider.name}?`,
      action: async () => {
        setActionLoading(true);
        try {
          await api(`/api/admin/users/${provider.id}/mark-commission-paid`, { method: "PATCH" });
          await load();
          setSelectedProvider(null);
          toast({ title: "Commission marked as paid", description: provider.name });
        } catch (e) {
          toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
        } finally { setActionLoading(false); }
      },
    });
  }

  async function handleSaveProfile(providerId: string) {
    if (!editForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${providerId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          location: editForm.location.trim() || null,
          ratePerHour: editForm.ratePerHour ? Number(editForm.ratePerHour) : null,
        }),
      });
      await load();
      setEditMode(false);
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Failed to update profile", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  return (
    <div className="space-y-5">
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-5">
              <ShieldX size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-slate-800">{pendingConfirm.label}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button
                onClick={async () => { const a = pendingConfirm; setPendingConfirm(null); await a.action(); }}
                disabled={actionLoading}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All providers</option>
            <option value="blocked">Commission blocked</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw size={16} />
          </button>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-200 flex items-center justify-between">
            <span>Failed to load providers: {loadError}</span>
            <button onClick={load} className="underline text-red-700 hover:text-red-900 ml-3">Retry</button>
          </div>
        )}
        <DataTable
          data={filtered}
          loading={loading}
          keyExtractor={(p) => p.id}
          emptyMessage="No providers found."
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
              header: "Status",
              render: (p) => (
                <div className="flex flex-col gap-1">
                  {p.isVerified ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}
                  {p.isBlocked && <StatusBadge status="blocked" />}
                </div>
              ),
            },
            {
              header: "Rating",
              render: (p) => (
                <span className="text-sm">{p.ratingCount > 0 ? `${p.rating}/5 (${p.ratingCount})` : "—"}</span>
              ),
            },
            { header: "Jobs", key: "totalJobs" },
            {
              header: "Pending Due",
              render: (p) => (
                <span className={p.pendingCommission > 0 ? "text-amber-700 font-medium text-xs" : "text-xs text-slate-400"}>
                  {currency(p.pendingCommission)}
                </span>
              ),
            },
            {
              header: "",
              render: (p) => (
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  onClick={() => openProvider(p)}
                >
                  Manage
                </button>
              ),
            },
          ]}
        />

        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {filtered.length} of {providers.length} providers
        </div>
      </div>

      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-800">{selectedProvider.name}</h3>
                  {selectedProvider.isVerified
                    ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">Verified</span>
                    : <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Unverified</span>
                  }
                </div>
                <p className="text-xs text-slate-400">{selectedProvider.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${editMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                >
                  <Edit2 size={13} />
                  {editMode ? "Cancel" : "Edit"}
                </button>
                <button onClick={() => { setSelectedProvider(null); setEditMode(false); }} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {editMode ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Edit Provider Profile</h4>
                  {[
                    { label: "Full Name *", key: "name", type: "text", placeholder: "Provider name" },
                    { label: "Email", key: "email", type: "email", placeholder: "email@example.com" },
                    { label: "Location", key: "location", type: "text", placeholder: "City / Area" },
                    { label: "Hourly Rate (Rs.)", key: "ratePerHour", type: "number", placeholder: "e.g. 1500" },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        type={type}
                        value={(editForm as any)[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => handleSaveProfile(selectedProvider.id)}
                    disabled={actionLoading}
                    className="w-full py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["Available", selectedProvider.isAvailable ? "Yes" : "No"],
                      ["Rating", selectedProvider.ratingCount > 0 ? `${selectedProvider.rating}/5 (${selectedProvider.ratingCount})` : "No ratings"],
                      ["Total Jobs", selectedProvider.totalJobs],
                      ["Rate/hr", selectedProvider.ratePerHour ? currency(selectedProvider.ratePerHour) : "—"],
                      ["Services", (selectedProvider.services || []).join(", ") || "—"],
                      ["Pending Commission", currency(selectedProvider.pendingCommission)],
                      ["Commission Limit", currency(selectedProvider.commissionLimit)],
                      ["Total Commission", currency(selectedProvider.totalCommission)],
                      ["Joined", formatDate(selectedProvider.joinedAt)],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className="text-sm font-medium text-slate-800 truncate">{String(val)}</p>
                      </div>
                    ))}
                  </div>

                  {selectedProvider.bio && (
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-500 mb-1">Bio</p>
                      <p className="text-sm text-slate-700">{selectedProvider.bio}</p>
                    </div>
                  )}

                  {selectedProvider.blockedReason && (
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-amber-500 mb-1">Block Reason</p>
                      <p className="text-sm text-amber-700">{selectedProvider.blockedReason}</p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                      Commission Due Limit (Rs.)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={commissionLimit}
                        onChange={(e) => setCommissionLimit(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="5000"
                        min="100"
                      />
                      <button
                        onClick={() => handleUpdateCommissionLimit(selectedProvider)}
                        disabled={actionLoading}
                        className="px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                      >
                        Update
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedProvider.pendingCommission > 0 && (
                      <button
                        onClick={() => handleMarkPaid(selectedProvider)}
                        disabled={actionLoading}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-2 rounded-lg"
                      >
                        Mark Commission Paid
                      </button>
                    )}

                    {selectedProvider.isVerified ? (
                      <button
                        onClick={() => handleToggleVerify(selectedProvider)}
                        disabled={actionLoading}
                        className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"
                      >
                        <ShieldX size={13} />
                        Unverify Provider
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleVerify(selectedProvider)}
                        disabled={actionLoading}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-2 rounded-lg flex items-center gap-1.5"
                      >
                        <ShieldCheck size={13} />
                        Verify Provider
                      </button>
                    )}

                    {selectedProvider.isBlocked ? (
                      <button
                        onClick={() => handleToggleBlock(selectedProvider, false)}
                        disabled={actionLoading}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-2 rounded-lg"
                      >
                        Unblock Account
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleBlock(selectedProvider, true)}
                        disabled={actionLoading}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-medium px-3 py-2 rounded-lg"
                      >
                        Block Account
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
