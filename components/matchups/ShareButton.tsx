"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareButtonProps {
  player1Id: string;
  player2Id: string;
  player3Id: string;
  player4Id: string;
}

interface ShareResult {
  token: string;
  url: string;
  snapshot?: {
    probability: number;
    moneyline: number | "Even";
    ratingDiff: number;
    momentum: string;
    minConfidence: number;
    players: {
      p1Name: string;
      p2Name: string;
      p3Name: string;
      p4Name: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoneyline(ml: number | "Even"): string {
  if (ml === "Even") return "Even";
  return ml >= 0 ? `+${ml}` : `${ml}`;
}

function getOgUrl(share: NonNullable<ShareResult["snapshot"]>, token: string): string {
  const pct = Math.round(share.probability * 100);
  const rdDisplay = share.ratingDiff >= 0 ? `+${share.ratingDiff}` : String(share.ratingDiff);
  return `/api/og/matchup?p1=${encodeURIComponent(share.players.p1Name)}&p2=${encodeURIComponent(share.players.p2Name)}&p3=${encodeURIComponent(share.players.p3Name)}&p4=${encodeURIComponent(share.players.p4Name)}&pct=${pct}&ml=${encodeURIComponent(String(share.moneyline))}&rd=${encodeURIComponent(rdDisplay)}&mo=${encodeURIComponent(share.momentum)}&lc=${share.minConfidence < 0.4 ? "1" : "0"}`;
  void token;
}

// ---------------------------------------------------------------------------
// ShareButton
// ---------------------------------------------------------------------------

export default function ShareButton({ player1Id, player2Id, player3Id, player4Id }: ShareButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function openSheet() {
    if (shareResult) {
      setSheetOpen(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/matchup/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1Id, player2Id, player3Id, player4Id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      }

      const { token, url } = await res.json() as { token: string; url: string };

      // Also fetch the snapshot to show the preview
      const snapRes = await fetch(`/api/share/${token}`);
      const snapshot = snapRes.ok ? await snapRes.json() : undefined;

      setShareResult({ token, url, snapshot });
      setSheetOpen(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function closeSheet() {
    setSheetOpen(false);
    setCopied(false);
    setError(null);
  }

  async function copyLink() {
    if (!shareResult) return;
    const fullUrl = `${window.location.origin}${shareResult.url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard access denied");
    }
  }

  async function shareNative() {
    if (!shareResult?.snapshot) return;
    setSharing(true);
    try {
      const ogUrl = getOgUrl(shareResult.snapshot, shareResult.token);
      const fullUrl = `${window.location.origin}${shareResult.url}`;

      const imgRes = await fetch(ogUrl);
      const blob = await imgRes.blob();
      const file = new File([blob], "vector-prediction.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Matchup Prediction",
          url: fullUrl,
        });
      } else {
        await navigator.share({ title: "Matchup Prediction", url: fullUrl });
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setError("Share failed");
      }
    } finally {
      setSharing(false);
    }
  }

  async function downloadPng() {
    if (!shareResult?.snapshot) return;
    const ogUrl = getOgUrl(shareResult.snapshot, shareResult.token);
    try {
      const imgRes = await fetch(ogUrl);
      const blob = await imgRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "vector-prediction.png";
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Download failed");
    }
  }

  const snap = shareResult?.snapshot;
  const pct = snap ? Math.round(snap.probability * 100) : null;
  const teamA = snap ? `${snap.players.p1Name} / ${snap.players.p2Name}` : null;
  const teamB = snap ? `${snap.players.p3Name} / ${snap.players.p4Name}` : null;
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      {/* Trigger button — flat row; parent card provides the border/rounded shell */}
      <button
        type="button"
        onClick={openSheet}
        disabled={loading}
        className="w-full flex items-center justify-between px-4 py-3.5 text-zinc-300 text-sm font-medium transition-colors hover:bg-white/[0.03] disabled:opacity-60"
      >
        <span className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <span>{loading ? "Generating…" : "Share this prediction"}</span>
        </span>
        <span className="text-zinc-500 text-lg leading-none">›</span>
      </button>

      {error && !sheetOpen && (
        <p className="text-xs text-red-400 px-1">{error}</p>
      )}

      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeSheet}>
          <div className="mx-auto w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
          <div
            className="bg-[#111113] border-t border-white/5 rounded-t-3xl px-4 pt-0 pb-10"
          >
            {/* Handle */}
            <div className="w-8 h-1 bg-zinc-700 rounded-full mx-auto mt-3 mb-5" />

            <p className="text-sm font-semibold text-zinc-50 mb-4">Share prediction</p>

            {/* Hero card */}
            {snap && pct !== null && teamA && teamB && (() => {
              const oppPct = 100 - pct;
              const lowConfidence = snap.minConfidence < 0.4;
              const pctDisplay = lowConfidence ? `~${pct}%` : `${pct}%`;
              return (
                <div className="rounded-2xl border border-[#374155] bg-gradient-to-br from-[#141418] to-[#111113] p-5 relative overflow-hidden mb-4">
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />

                  {/* Big % left (with moneyline below), team + label right */}
                  <div className="flex items-start justify-between mb-3 relative z-10">
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-[56px] font-medium leading-none tracking-tighter ${lowConfidence ? "text-zinc-400" : "text-zinc-50"}`}>
                        {pctDisplay}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">{formatMoneyline(snap.moneyline)}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end max-w-[55%]">
                      <span className="text-sm font-semibold text-zinc-50 truncate">{teamA}</span>
                      <span className="font-mono text-xs text-emerald-400 tracking-wider">win probability</span>
                    </div>
                  </div>

                  {/* Dual progress bars */}
                  <div className="flex flex-col gap-2 relative z-10">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between font-mono text-xs text-zinc-400">
                        <span>{teamA}</span><span>{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between font-mono text-xs text-zinc-400">
                        <span>{teamB}</span><span>{oppPct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full rounded-full bg-zinc-500" style={{ width: `${oppPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Primary: Share */}
            {canNativeShare && (
              <button
                type="button"
                onClick={shareNative}
                disabled={sharing || !snap}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-zinc-50 text-zinc-900 font-bold text-[15px] rounded-xl mb-2 disabled:opacity-60"
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10 2l4 4-4 4M14 6H6a4 4 0 000 8h2" />
                </svg>
                {sharing ? "Sharing…" : "Share"}
              </button>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-transparent border border-zinc-800 rounded-xl text-zinc-300 text-sm font-medium"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="4" width="10" height="10" rx="1.5" />
                  <path d="M2 12V2h10" />
                </svg>
                {copied ? "Copied!" : "Copy link"}
              </button>
              {snap && (
                <button
                  type="button"
                  onClick={downloadPng}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-transparent border border-zinc-800 rounded-xl text-zinc-500 text-sm font-medium"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 2v8M5 7l3 4 3-4M2 14h12" />
                  </svg>
                  Download Img
                </button>
              )}
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center mt-3">{error}</p>
            )}

            <button
              type="button"
              onClick={closeSheet}
              className="w-full text-center text-zinc-500 text-sm mt-4"
            >
              Cancel
            </button>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
