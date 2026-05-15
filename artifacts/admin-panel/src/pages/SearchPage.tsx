import { useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { SearchResults } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Search, Users, ClipboardList, Receipt, Loader2, Globe } from "lucide-react";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function doSearch() {
    if (!query.trim() || query.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<SearchResults>("/api/admin/search", { params: { q: query.trim() } });
      setResults(res);
      setSearched(true);
    } catch (e) {
      setError((e as Error).message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const totalResults = results ? results.users.length + results.bookings.length + results.invoices.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Globe size={24} className="text-blue-600" /> Global Search
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Search across users, bookings, and invoices by ID, name, phone, or service
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, ID, service, invoice number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            className="w-full pl-10 pr-4 py-3 text-sm border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <button
          onClick={doSearch}
          disabled={loading || query.trim().length < 2}
          className="px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Search
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {searched && results && (
        <div className="space-y-6">
          <p className="text-sm text-slate-500">{totalResults} result{totalResults !== 1 ? "s" : ""} found</p>

          {/* Users */}
          {results.users.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                <Users size={16} className="text-blue-600" />
                <h3 className="font-semibold text-slate-700">Users ({results.users.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Name</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Phone</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Email</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Role</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {results.users.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{u.name}</td>
                      <td className="px-4 py-2">{u.phone}</td>
                      <td className="px-4 py-2 text-slate-500">{u.email || "—"}</td>
                      <td className="px-4 py-2"><StatusBadge status={u.role} /></td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">{u.id.slice(0, 8)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bookings */}
          {results.bookings.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                <ClipboardList size={16} className="text-purple-600" />
                <h3 className="font-semibold text-slate-700">Bookings ({results.bookings.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Public ID</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Service</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Customer</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Provider</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.bookings.map((b) => (
                    <tr key={b.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{b.publicId || b.id.slice(0, 8)}</td>
                      <td className="px-4 py-2">{b.service}</td>
                      <td className="px-4 py-2">{b.customerName}</td>
                      <td className="px-4 py-2">{b.providerName}</td>
                      <td className="px-4 py-2 text-center"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Invoices */}
          {results.invoices.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center gap-2">
                <Receipt size={16} className="text-emerald-600" />
                <h3 className="font-semibold text-slate-700">Invoices ({results.invoices.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Invoice #</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Customer</th>
                    <th className="text-left px-4 py-2 font-medium text-slate-600">Provider</th>
                    <th className="text-right px-4 py-2 font-medium text-slate-600">Total</th>
                    <th className="text-center px-4 py-2 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-blue-600">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2">{inv.customerName}</td>
                      <td className="px-4 py-2">{inv.providerName}</td>
                      <td className="px-4 py-2 text-right font-medium">{currency(inv.totalAmount)}</td>
                      <td className="px-4 py-2 text-center"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalResults === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Search size={40} className="mx-auto mb-3 opacity-40" />
              <p>No results found for "{query}"</p>
            </div>
          )}
        </div>
      )}

      {!searched && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-3 opacity-30" />
          <p>Enter a search term to find users, bookings, or invoices</p>
        </div>
      )}
    </div>
  );
}
