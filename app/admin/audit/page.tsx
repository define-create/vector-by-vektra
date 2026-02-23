"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEvent {
  id: string;
  createdAt: string;
  actionType: string;
  entityType: string;
  entityId: string;
  adminUserId: string | null;
  metadata: unknown;
  admin: { id: string; handle: string } | null;
}

// ---------------------------------------------------------------------------
// AdminAuditPage
// ---------------------------------------------------------------------------

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/audit-events?page=${page}`)
      .then((r) => r.json())
      .then((data: { events: AuditEvent[]; pagination: { total: number } }) => {
        setEvents(data.events ?? []);
        setTotal(data.pagination?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function metadataPreview(meta: unknown): string {
    if (!meta) return "—";
    try {
      const s = JSON.stringify(meta);
      return s.length > 80 ? s.slice(0, 77) + "…" : s;
    } catch {
      return "—";
    }
  }

  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Audit Log</h1>
        <p className="text-sm text-zinc-500">{total} events total</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900">
            <tr>
              {["Timestamp", "Action", "Entity", "Entity ID", "Admin", "Metadata"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No audit events yet
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                    {formatDate(e.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                      {e.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{e.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {e.entityId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {e.admin?.handle ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500 max-w-[200px] truncate">
                    {metadataPreview(e.metadata)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
