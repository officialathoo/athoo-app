import { useEffect, useState } from "react";
import { api, formatDate } from "@/lib/api";
import type { ProviderDocument, User } from "@/lib/types";
import { StorageImage } from "@/components/ui/StorageImage";
import { getPrivateFileUrl } from "@/lib/storage";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ShieldCheck,
  ShieldX,
  Clock,
  RefreshCw,
  User as UserIcon,
  Star,
  Briefcase,
  MapPin,
  X,
  Eye,
  FileText,
  Hourglass,
} from "lucide-react";

type Tab = "pending" | "in_process" | "approved" | "rejected";

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pending",
  in_process: "In Process",
  approved: "Approved",
  rejected: "Rejected",
};

function getStatus(p: User): Tab {
  const s = p.verificationStatus;
  if (s === "approved" || s === "rejected" || s === "in_process") return s;
  if (p.isVerified) return "approved";
  return "pending";
}

export function VerificationPage() {
  const [providers, setProviders] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("pending");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [docs, setDocs] = useState<ProviderDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [imageModal, setImageModal] = useState<string | null>(null);
  const [rejectionDialog, setRejectionDialog] = useState<{
    target: User;
    note: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ users: User[] }>("/api/admin/users", {
        params: { role: "provider" },
      });
      setProviders((res.users || []).filter((u) => !u.isDeactivated));
    } catch (e) {
      setLoadError((e as Error).message || "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs(userId: string) {
    setDocsLoading(true);
    try {
      const res = await api<{ documents: ProviderDocument[] }>(
        `/api/admin/users/${userId}/documents`
      );
      setDocs(res.documents || []);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selected) loadDocs(selected.id);
    else setDocs([]);
  }, [selected]);

  async function setStatus(user: User, status: Tab, note?: string) {
    setActionLoading(user.id);
    try {
      await api(`/api/admin/users/${user.id}/verification-status`, {
        method: "PATCH",
        body: JSON.stringify({ status, note: note || "" }),
      });
      await load();
      setSelected(null);
      setRejectionDialog(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const grouped: Record<Tab, User[]> = {
    pending: [],
    in_process: [],
    approved: [],
    rejected: [],
  };
  providers.forEach((p) => grouped[getStatus(p)].push(p));
  const displayList = grouped[tab];

  const columns = [
    {
      header: "Provider",
      render: (p: User) => (
        <div className="flex items-center gap-3">
          {p.profileImage ? (
            <button onClick={() => setImageModal(p.profileImage!)} className="shrink-0">
              <StorageImage
                objectPath={p.profileImage}
                alt={p.name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-200 hover:ring-blue-400 transition-all"
              />
            </button>
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: p.profileColor || "#1A6EE0" }}
            >
              {p.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-slate-800">{p.name}</p>
            <p className="text-xs text-slate-400">{p.phone}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Services",
      render: (p: User) => (
        <p className="text-xs text-slate-600 max-w-xs truncate">
          {(p.services || []).join(", ") || "—"}
        </p>
      ),
    },
    {
      header: "Location",
      render: (p: User) => (
        <span className="text-xs text-slate-500">{p.location || "—"}</span>
      ),
    },
    {
      header: "Rating",
      render: (p: User) => (
        <div className="flex items-center gap-1">
          <Star size={12} className="text-amber-400 fill-amber-400" />
          <span className="text-xs text-slate-600">
            {p.rating || 0} ({p.ratingCount || 0})
          </span>
        </div>
      ),
    },
    {
      header: "Joined",
      render: (p: User) => (
        <span className="text-xs text-slate-500">{formatDate(p.joinedAt)}</span>
      ),
    },
    {
      header: "",
      render: (p: User) => (
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-2 py-1 rounded-lg transition-colors"
            onClick={() => setSelected(p)}
          >
            <Eye size={13} />
            Review
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Provider Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review documents and approve, mark in process, or reject providers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {TAB_LABEL[t]} ({grouped[t].length})
                </button>
              ))}
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-200 flex items-center justify-between">
            <span>Failed to load providers: {loadError}</span>
            <button onClick={load} className="underline text-red-700 hover:text-red-900 ml-3">Retry</button>
          </div>
        )}
        <DataTable
          data={displayList}
          loading={loadError ? false : loading}
          keyExtractor={(p) => p.id}
          emptyMessage={`No providers in ${TAB_LABEL[tab].toLowerCase()}.`}
          columns={columns}
        />
      </div>

      {/* Provider Review Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {selected.profileImage ? (
                  <button
                    onClick={() => setImageModal(selected.profileImage!)}
                    className="shrink-0"
                  >
                    <StorageImage
                      objectPath={selected.profileImage}
                      alt={selected.name}
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-slate-200 hover:ring-blue-400 cursor-zoom-in"
                    />
                  </button>
                ) : (
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                    style={{ background: selected.profileColor || "#1A6EE0" }}
                  >
                    {selected.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-semibold text-slate-800">
                    {selected.name}
                  </h3>
                  <p className="text-xs text-slate-400">{selected.phone}</p>
                  <div className="mt-1">
                    <StatusBadge status={getStatus(selected)} />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Services", (selected.services || []).join(", ") || "—"],
                  ["Location", selected.location || "—"],
                  ["Experience", selected.experience || "—"],
                  ["Rate/hr", selected.ratePerHour ? `Rs. ${selected.ratePerHour}` : "—"],
                  ["Rating", `${selected.rating || 0}/5 (${selected.ratingCount || 0})`],
                  ["Total Jobs", selected.totalJobs || 0],
                  ["Joined", formatDate(selected.joinedAt)],
                  ["Availability", selected.isAvailable ? "Available" : "Unavailable"],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-slate-50 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {label === "Services" && <Briefcase size={10} />}
                      {label === "Location" && <MapPin size={10} />}
                      {label === "Rating" && <Star size={10} />}
                      {label}
                    </p>
                    <p className="text-sm font-medium text-slate-800 mt-0.5">
                      {String(val)}
                    </p>
                  </div>
                ))}
              </div>

              {selected.bio && (
                <div className="bg-slate-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <UserIcon size={10} /> Bio / About
                  </p>
                  <p className="text-sm text-slate-700">{selected.bio}</p>
                </div>
              )}

              {selected.verificationNote && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-600 font-medium mb-1">
                    Last verification note
                  </p>
                  <p className="text-sm text-amber-800">
                    {selected.verificationNote}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <FileText size={12} /> Submitted Documents
                </p>
                {docsLoading ? (
                  <p className="text-xs text-slate-400">Loading documents...</p>
                ) : docs.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-3">
                    No documents uploaded yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {docs.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setImageModal(d.url)}
                        className="border border-slate-200 rounded-lg p-2 text-left hover:border-blue-400 transition-colors"
                      >
                        <div className="aspect-video bg-slate-100 rounded mb-1 overflow-hidden flex items-center justify-center">
                          <StorageImage
                            objectPath={d.url}
                            alt={d.type}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs font-medium text-slate-700">
                          {d.label || d.type}
                        </p>
                        <p className="text-[10px] text-slate-400 capitalize">
                          {d.type.replace(/_/g, " ")} · {d.status}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setStatus(selected, "approved")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <ShieldCheck size={16} /> Approve
                </button>
                <button
                  onClick={() => setStatus(selected, "in_process")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <Hourglass size={16} /> Mark In Process
                </button>
                <button
                  onClick={() =>
                    setRejectionDialog({ target: selected, note: "" })
                  }
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <ShieldX size={16} /> Reject
                </button>
                <button
                  onClick={() => setStatus(selected, "pending")}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  <Clock size={16} /> Reset to Pending
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="ml-auto px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection note dialog */}
      {rejectionDialog && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">
                Reject {rejectionDialog.target.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                The provider will be notified with the reason below.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={rejectionDialog.note}
                onChange={(e) =>
                  setRejectionDialog({
                    ...rejectionDialog,
                    note: e.target.value,
                  })
                }
                rows={4}
                placeholder="e.g. CNIC photo is blurry. Please re-upload a clear image of the front side."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectionDialog(null)}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    setStatus(
                      rejectionDialog.target,
                      "rejected",
                      rejectionDialog.note
                    )
                  }
                  disabled={!!actionLoading}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  Reject Provider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-size Image Modal */}
      {imageModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
          onClick={() => setImageModal(null)}
        >
          <div
            className="relative max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setImageModal(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg text-slate-600 hover:text-slate-900 z-10"
            >
              <X size={18} />
            </button>
            <StorageImage
              objectPath={imageModal}
              alt="Document"
              className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

