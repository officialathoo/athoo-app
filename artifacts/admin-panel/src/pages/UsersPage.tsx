import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { User } from "@/lib/types";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Search, RefreshCw, ChevronDown, ChevronUp, Edit2, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SortKey = "name" | "role" | "joinedAt" | "totalJobs";

export function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("joinedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", location: "" });
  const [pendingConfirm, setPendingConfirm] = useState<{ label: string; action: () => Promise<void> } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ users: User[] }>("/api/admin/users");
      setUsers(res.users || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openUser(u: User) {
    setSelectedUser(u);
    setNotes(u.adminNotes || "");
    setEditMode(false);
    setEditForm({ name: u.name || "", email: u.email || "", phone: u.phone || "", location: u.location || "" });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  const filtered = users
    .filter((u) => {
      const q = search.toLowerCase();
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.phone.includes(q) || (u.email || "").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    })
    .sort((a, b) => {
      let aVal = a[sortKey] as any;
      let bVal = b[sortKey] as any;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

  async function handleBlock(user: User, block: boolean) {
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${user.id}/${block ? "block" : "unblock"}`, { method: "PATCH", body: JSON.stringify({ reason: block ? "Blocked by admin" : null }) });
      await load();
      setSelectedUser(null);
      toast({ title: block ? "User blocked" : "User unblocked", description: user.name });
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  function handleDeactivate(user: User, deactivate: boolean) {
    setPendingConfirm({
      label: `${deactivate ? "Deactivate" : "Reactivate"} ${user.name}?`,
      action: async () => {
        setActionLoading(true);
        try {
          await api(`/api/admin/users/${user.id}/${deactivate ? "deactivate" : "reactivate"}`, { method: "PATCH" });
          await load();
          setSelectedUser(null);
          toast({ title: deactivate ? "User deactivated" : "User reactivated", description: user.name });
        } catch (e) {
          toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
        } finally { setActionLoading(false); }
      },
    });
  }

  async function handleSaveNotes(userId: string) {
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${userId}/notes`, { method: "PATCH", body: JSON.stringify({ notes }) });
      await load();
      toast({ title: "Notes saved" });
    } catch (e) {
      toast({ title: "Failed to save notes", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  async function handleSaveProfile(userId: string) {
    if (!editForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setActionLoading(true);
    try {
      await api(`/api/admin/users/${userId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim() || null,
          phone: editForm.phone.trim() || undefined,
          location: editForm.location.trim() || null,
        }),
      });
      await load();
      setEditMode(false);
      toast({ title: "Profile updated" });
    } catch (e) {
      toast({ title: "Failed to update profile", description: (e as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp size={13} className="inline ml-1" /> : <ChevronDown size={13} className="inline ml-1" />;
  }

  return (
    <div className="space-y-5">
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-5">
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
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
              placeholder="Search by name, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            <option value="customer">Customers</option>
            <option value="provider">Providers</option>
            <option value="admin">Admins</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw size={16} />
          </button>
        </div>

        <DataTable
          data={filtered}
          loading={loading}
          keyExtractor={(u) => u.id}
          emptyMessage="No users found matching your search."
          columns={[
            {
              header: "User",
              render: (u) => (
                <div>
                  <p className="font-medium text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.phone}</p>
                </div>
              ),
            },
            {
              header: "Role",
              render: (u) => <StatusBadge status={u.role} />,
            },
            {
              header: "Status",
              render: (u) => (
                <div className="flex flex-col gap-1">
                  {u.isDeactivated && <StatusBadge status="blocked" />}
                  {u.isBlocked && !u.isDeactivated && <span className="text-xs text-red-600 font-medium">Commission blocked</span>}
                  {!u.isDeactivated && !u.isBlocked && <StatusBadge status="active" />}
                </div>
              ),
            },
            { header: "Jobs", key: "totalJobs" },
            {
              header: "Joined",
              render: (u) => <span className="text-xs text-slate-500">{formatDate(u.joinedAt)}</span>,
            },
            {
              header: "",
              render: (u) => (
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  onClick={() => openUser(u)}
                >
                  View
                </button>
              ),
            },
          ]}
        />

        <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
          {filtered.length} of {users.length} users
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{selectedUser.name}</h3>
                <p className="text-xs text-slate-400">{selectedUser.phone} · {selectedUser.email || "No email"}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${editMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                >
                  <Edit2 size={13} />
                  {editMode ? "Cancel Edit" : "Edit"}
                </button>
                <button onClick={() => { setSelectedUser(null); setEditMode(false); }} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {editMode ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Edit User Profile</h4>
                  {[
                    { label: "Full Name *", key: "name", type: "text", placeholder: "User's full name" },
                    { label: "Email", key: "email", type: "email", placeholder: "email@example.com" },
                    { label: "Phone", key: "phone", type: "tel", placeholder: "03001234567" },
                    { label: "Location", key: "location", type: "text", placeholder: "City / Area" },
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
                    onClick={() => handleSaveProfile(selectedUser.id)}
                    disabled={actionLoading}
                    className="w-full py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Role", selectedUser.role],
                    ["Verified", selectedUser.isVerified ? "Yes" : "No"],
                    ["Rating", selectedUser.ratingCount > 0 ? `${selectedUser.rating}/5 (${selectedUser.ratingCount})` : "No ratings"],
                    ["Total Jobs", selectedUser.totalJobs],
                    ["Rate/hr", selectedUser.ratePerHour ? currency(selectedUser.ratePerHour) : "—"],
                    ["Services", (selectedUser.services || []).join(", ") || "—"],
                    ["Pending Commission", currency(selectedUser.pendingCommission)],
                    ["Commission Limit", currency(selectedUser.commissionLimit)],
                    ["Total Commission", currency(selectedUser.totalCommission)],
                    ["Location", selectedUser.location || "—"],
                    ["Joined", formatDate(selectedUser.joinedAt)],
                    ["Updated", formatDate(selectedUser.updatedAt)],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="text-sm font-medium text-slate-800 truncate">{String(val)}</p>
                    </div>
                  ))}
                </div>
              )}

              {!editMode && selectedUser.bio && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1">Bio</p>
                  <p className="text-sm text-slate-700">{selectedUser.bio}</p>
                </div>
              )}

              {!editMode && selectedUser.blockedReason && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-500 mb-1">Block Reason</p>
                  <p className="text-sm text-red-700">{selectedUser.blockedReason}</p>
                </div>
              )}

              {!editMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Admin Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Internal notes about this user..."
                  />
                  <button
                    onClick={() => handleSaveNotes(selectedUser.id)}
                    disabled={actionLoading}
                    className="mt-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Save Notes
                  </button>
                </div>
              )}

              {!editMode && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  {selectedUser.isBlocked ? (
                    <button
                      onClick={() => handleBlock(selectedUser, false)}
                      disabled={actionLoading}
                      className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Unblock Commission
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBlock(selectedUser, true)}
                      disabled={actionLoading}
                      className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Block Commission
                    </button>
                  )}

                  {selectedUser.isDeactivated ? (
                    <button
                      onClick={() => handleDeactivate(selectedUser, false)}
                      disabled={actionLoading}
                      className="text-xs bg-green-50 hover:bg-green-100 text-green-700 font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Reactivate Account
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeactivate(selectedUser, true)}
                      disabled={actionLoading}
                      className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Deactivate Account
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
