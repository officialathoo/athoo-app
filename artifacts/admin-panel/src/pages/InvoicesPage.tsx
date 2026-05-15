import { useEffect, useState } from "react";
import { api, currency, formatDate } from "@/lib/api";
import type { Invoice } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Search, RefreshCw, Download, ChevronLeft, ChevronRight, X, Receipt, FileText } from "lucide-react";

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "issued", label: "Issued" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 500 };
      if (statusFilter !== "all") params.status = statusFilter;
      const res = await api<{ invoices: Invoice[] }>("/api/admin/invoices", { params });
      setInvoices(res.invoices || []);
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.providerName?.toLowerCase().includes(q) ||
      inv.bookingId?.toLowerCase().includes(q) ||
      inv.service?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalRevenue = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const totalCommission = invoices.reduce((s, i) => s + (i.commissionAmount || 0), 0);
  const totalProviderEarnings = invoices.reduce((s, i) => s + (i.providerAmount || 0), 0);

  function exportCSV() {
    const rows = [
      ["Invoice #", "Booking ID", "Customer", "Provider", "Service", "Rate/hr", "Hours", "Subtotal", "Travel", "Total", "Commission", "Provider Earning", "Status", "Date"],
      ...filtered.map((i) => [
        i.invoiceNumber, i.bookingId, i.customerName, i.providerName, i.service || "",
        i.ratePerHour || 0, i.hours || 0, i.subtotal, i.visitCharge, i.totalAmount,
        i.commissionAmount, i.providerAmount, i.status, i.createdAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athoo-invoices-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">
            {invoices.length} total invoices
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-slate-50">
            <Download size={14} /> Export
          </button>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Revenue</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{currency(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Platform Commission</p>
          <p className="text-xl font-bold text-emerald-600 mt-1">{currency(totalCommission)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Provider Earnings</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{currency(totalProviderEarnings)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Search invoices..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border rounded-lg bg-white"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{loadError}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice #</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Service</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Rate/hr</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Hours</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Travel</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Commission</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">Loading...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">No invoices found</td></tr>
              ) : paginated.map((inv) => (
                <tr key={inv.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(inv)}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{inv.customerName}</td>
                  <td className="px-4 py-3">{inv.providerName}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.service || "—"}</td>
                  <td className="px-4 py-3 text-right">{inv.ratePerHour ? currency(inv.ratePerHour) : "—"}</td>
                  <td className="px-4 py-3 text-right">{inv.hours || "—"}</td>
                  <td className="px-4 py-3 text-right">{currency(inv.visitCharge)}</td>
                  <td className="px-4 py-3 text-right font-medium">{currency(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{currency(inv.commissionAmount)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
            <span className="text-xs text-slate-500">Page {page} of {totalPages} ({filtered.length} results)</span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold">{selected.invoiceNumber}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded-full hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Booking ID</span><p className="font-mono text-xs mt-0.5">{selected.bookingId}</p></div>
                <div><span className="text-slate-500">Status</span><p className="mt-0.5"><StatusBadge status={selected.status} /></p></div>
                <div><span className="text-slate-500">Customer</span><p className="font-medium mt-0.5">{selected.customerName}</p></div>
                <div><span className="text-slate-500">Provider</span><p className="font-medium mt-0.5">{selected.providerName}</p></div>
                <div><span className="text-slate-500">Service</span><p className="mt-0.5">{selected.service || "—"}</p></div>
                <div><span className="text-slate-500">Date</span><p className="mt-0.5">{formatDate(selected.createdAt)}</p></div>
              </div>

              <div className="border rounded-lg p-4 space-y-2 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">Pricing Breakdown</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Per Hour Rate</span>
                  <span>{selected.ratePerHour ? currency(selected.ratePerHour) : "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Hours</span>
                  <span>{selected.hours || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Service Charge</span>
                  <span>{currency(selected.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Travelling/Visit Charge</span>
                  <span>{currency(selected.visitCharge)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Total Payable</span>
                  <span>{currency(selected.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Platform Commission ({selected.commissionRate || 0}%)</span>
                  <span>{currency(selected.commissionAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-600 font-medium">
                  <span>Provider Earning</span>
                  <span>{currency(selected.providerAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
