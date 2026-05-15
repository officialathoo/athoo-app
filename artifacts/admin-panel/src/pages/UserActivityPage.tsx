import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { User, UserActivity } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Search, RefreshCw, X, ChevronLeft, Loader2,
  ClipboardList, Receipt, Bell, MessageSquare, History, User as UserIcon,
} from "lucide-react";

type ActivityTab = "bookings" | "invoices" | "notifications" | "chats" | "logins";

const TABS: { key: ActivityTab; label: string; icon: typeof ClipboardList }[] = [
  { key: "bookings", label: "Bookings", icon: ClipboardList },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "chats", label: "Chats", icon: MessageSquare },
  { key: "logins", label: "Login History", icon: History },
];

export function UserActivityPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [tab, setTab] = useState<ActivityTab>("bookings");
  const [error, setError] = useState<string | null>(null);

  async function searchUsers() {
    if (!searchQuery.trim()) return;
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await api<{ users: Array<{ id: string; name: string; phone: string; email?: string | null; role: string }> }>(
        "/api/admin/search", { params: { q: searchQuery.trim() } }
      );
      setUsers(res.users as User[] || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadActivity(userId: string) {
    setLoadingActivity(true);
    setError(null);
    try {
      const res = await api<UserActivity>(`/api/admin/users/${userId}/activity`);
      setActivity(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingActivity(false);
    }
  }

  function selectUser(user: User) {
    setSelectedUser(user);
    setTab("bookings");
    loadActivity(user.id);
  }

  function goBack() {
    setSelectedUser(null);
    setActivity(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <UserIcon size={24} className="text-blue-600" /> User Activity
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View complete activity history for any user
        </p>
      </div>

      {!selectedUser ? (
        <>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search user by name, phone, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                className="w-full pl-10 pr-4 py-3 text-sm border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={searchUsers}
              disabled={loadingUsers || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingUsers ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          {users.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3">{u.phone}</td>
                      <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{u.id.slice(0, 8)}...</td>
                      <td className="px-4 py-3">
                        <button onClick={() => selectUser(u)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                          View Activity
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft size={20} /></button>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{selectedUser.name}</h2>
              <p className="text-sm text-slate-500">{selectedUser.phone} · <StatusBadge status={selectedUser.role} /></p>
            </div>
            <button onClick={() => loadActivity(selectedUser.id)} disabled={loadingActivity} className="ml-auto p-2 rounded-lg hover:bg-slate-100">
              <RefreshCw size={16} className={loadingActivity ? "animate-spin" : ""} />
            </button>
          </div>

          {/* Stats */}
          {activity && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {TABS.map((t) => {
                const count = activity[t.key]?.length || 0;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${tab === t.key ? "bg-blue-50 border-blue-200 ring-1 ring-blue-300" : "bg-white hover:bg-slate-50"}`}>
                    <t.icon size={16} className={tab === t.key ? "text-blue-600" : "text-slate-400"} />
                    <p className="text-lg font-bold mt-1">{count}</p>
                    <p className="text-xs text-slate-500">{t.label}</p>
                  </button>
                );
              })}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          {loadingActivity ? (
            <div className="text-center py-12"><Loader2 size={24} className="animate-spin mx-auto text-slate-400" /></div>
          ) : activity ? (
            <div className="bg-white rounded-xl border overflow-hidden">
              {tab === "bookings" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">ID</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Service</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Price</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.bookings.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No bookings</td></tr>
                    ) : activity.bookings.map((b) => (
                      <tr key={b.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{b.publicId || b.id.slice(0, 8)}</td>
                        <td className="px-4 py-2">{b.service}</td>
                        <td className="px-4 py-2 text-center"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-2 text-right">{b.price ? currency(b.price) : "—"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(b.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "invoices" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice #</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Commission</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.invoices.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-400">No invoices</td></tr>
                    ) : activity.invoices.map((inv) => (
                      <tr key={inv.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-blue-600">{inv.invoiceNumber}</td>
                        <td className="px-4 py-2 text-right font-medium">{currency(inv.totalAmount)}</td>
                        <td className="px-4 py-2 text-right text-emerald-600">{currency(inv.commissionAmount)}</td>
                        <td className="px-4 py-2 text-center"><StatusBadge status={inv.status} /></td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(inv.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "notifications" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Title</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600">Read</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.notifications.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-slate-400">No notifications</td></tr>
                    ) : activity.notifications.map((n) => (
                      <tr key={n.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2">{n.title}</td>
                        <td className="px-4 py-2"><StatusBadge status={n.type} /></td>
                        <td className="px-4 py-2 text-center">{n.isRead ? "Yes" : "No"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(n.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "chats" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Chat ID</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Participant 1</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Participant 2</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.chats.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-slate-400">No chats</td></tr>
                    ) : activity.chats.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{c.id.slice(0, 8)}...</td>
                        <td className="px-4 py-2 font-mono text-xs">{c.participant1Id.slice(0, 8)}...</td>
                        <td className="px-4 py-2 font-mono text-xs">{c.participant2Id.slice(0, 8)}...</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === "logins" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 font-medium text-slate-600">IP Address</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">User Agent</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.loginHistory.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-8 text-slate-400">No login history</td></tr>
                    ) : activity.loginHistory.map((l) => (
                      <tr key={l.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{l.ipAddress || "—"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500 max-w-xs truncate">{l.userAgent || "—"}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatDate(l.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
