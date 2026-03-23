import { type Metadata } from "next";
import crypto from "crypto";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareSnapshot {
  probability: number;
  moneyline: number | "Even";
  ratingDiff: number;
  volatility: string;
  momentum: string;
  minConfidence: number;
  players: {
    p1Name: string;
    p2Name: string;
    p3Name: string;
    p4Name: string;
  };
}

// ---------------------------------------------------------------------------
// Metadata (OG tags)
// ---------------------------------------------------------------------------

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const share = await prisma.matchupShare.findUnique({ where: { tokenHash } });

  if (!share) {
    return { title: "Prediction not found — Vector" };
  }

  const snap = share.snapshotJson as unknown as ShareSnapshot;
  const { p1Name, p2Name, p3Name, p4Name } = snap.players;
  const pct = Math.round(snap.probability * 100);
  const title = `${p1Name}/${p2Name} vs ${p3Name}/${p4Name} — Vector prediction`;
  const rdDisplay = snap.ratingDiff >= 0 ? `+${snap.ratingDiff}` : String(snap.ratingDiff);
  const ogUrl = `/api/og/matchup?p1=${encodeURIComponent(p1Name)}&p2=${encodeURIComponent(p2Name)}&p3=${encodeURIComponent(p3Name)}&p4=${encodeURIComponent(p4Name)}&pct=${pct}&ml=${encodeURIComponent(String(snap.moneyline))}&rd=${encodeURIComponent(rdDisplay)}&mo=${encodeURIComponent(snap.momentum)}&lc=${snap.minConfidence < 0.4 ? "1" : "0"}`;

  return {
    title,
    openGraph: { title, images: [{ url: ogUrl, width: 800, height: 600 }] },
    twitter: { card: "summary_large_image", title, images: [ogUrl] },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SharePage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const share = await prisma.matchupShare.findUnique({ where: { tokenHash } });

  if (!share) notFound();

  // Increment view count (fire-and-forget)
  prisma.matchupShare.update({
    where: { id: share.id },
    data: { viewCount: { increment: 1 } },
  }).catch(() => {});

  const snap = share.snapshotJson as unknown as ShareSnapshot;
  const { p1Name, p2Name, p3Name, p4Name } = snap.players;
  const pct = Math.round(snap.probability * 100);
  const oppPct = 100 - pct;
  const lowConfidence = snap.minConfidence < 0.4;
  const pctDisplay = lowConfidence ? `~${pct}%` : `${pct}%`;
  const teamA = `${p1Name} / ${p2Name}`;
  const teamB = `${p3Name} / ${p4Name}`;
  const rdDisplay = snap.ratingDiff >= 0 ? `+${snap.ratingDiff}` : String(snap.ratingDiff);

  function formatMoneyline(ml: number | "Even"): string {
    if (ml === "Even") return "Even";
    return ml >= 0 ? `+${ml}` : `${ml}`;
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
      {/* Top bar */}
      <div className="w-full max-w-xl border-b border-zinc-800 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-sm font-medium text-zinc-50 tracking-wider">Vector</span>
        </div>
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">Prediction</span>
      </div>

      {/* Body */}
      <div className="w-full max-w-xl flex flex-col gap-3 px-4 py-5">

        {/* Hero card */}
        <div className="rounded-2xl border border-[#374155] bg-gradient-to-br from-[#141418] to-[#111113] p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />

          <div className="flex items-start justify-between mb-3 relative z-10">
            <span className={`font-mono text-[56px] font-medium leading-none tracking-tighter ${lowConfidence ? "text-zinc-400" : "text-zinc-50"}`}>
              {pctDisplay}
            </span>
            <div className="flex flex-col gap-1 items-end max-w-[55%]">
              <span className="text-sm font-semibold text-zinc-50 truncate">{teamA}</span>
              <span className="font-mono text-xs text-emerald-400 tracking-wider">win probability</span>
            </div>
          </div>

          {/* Probability bars */}
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

        {/* Teams block */}
        <div className="rounded-xl border border-zinc-800 bg-[#111113] overflow-hidden">
          <div className="flex items-center gap-2.5 px-3.5 py-3">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pct >= 50 ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <span className="text-sm font-medium text-zinc-50 flex-1">{teamA}</span>
            <span className={`font-mono text-xs tracking-wider ${pct >= 50 ? "text-emerald-400" : "text-zinc-400"}`}>{pct >= 50 ? "Favored" : "Underdog"}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-t border-zinc-800">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pct < 50 ? "bg-emerald-400" : "bg-zinc-500"}`} />
            <span className="text-sm font-medium text-zinc-50 flex-1">{teamB}</span>
            <span className={`font-mono text-xs tracking-wider ${pct < 50 ? "text-emerald-400" : "text-zinc-400"}`}>{pct < 50 ? "Favored" : "Underdog"}</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-zinc-800 bg-[#111113] px-3 py-2.5 flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">Δ Rating</span>
            <span className="font-mono text-base font-medium text-zinc-50">{rdDisplay}</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111113] px-3 py-2.5 flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">Line</span>
            <span className="font-mono text-base font-medium text-zinc-50">{formatMoneyline(snap.moneyline)}</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#111113] px-3 py-2.5 flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">Momentum</span>
            <span className="font-mono text-sm font-medium text-zinc-50 leading-tight pt-0.5">{snap.momentum}</span>
          </div>
        </div>

        {lowConfidence && (
          <p className="text-xs text-zinc-500 font-mono">~ Low confidence — fewer than ~10 matches on record</p>
        )}

        {/* CTA */}
        <Link
          href="/register"
          className="mt-1 block w-full text-center bg-zinc-50 text-zinc-900 font-semibold text-sm py-4 rounded-xl hover:bg-white transition-colors"
        >
          See your own stats — join Vector
        </Link>
        <p className="text-center font-mono text-xs text-zinc-500">
          Already a member?{" "}
          <Link href="/sign-in" className="text-zinc-300 underline underline-offset-2">Sign in →</Link>
        </p>
      </div>

      {/* Footer */}
      <div className="mt-auto w-full max-w-xl text-center py-4 border-t border-zinc-900 font-mono text-[10px] tracking-wider text-zinc-600">
        Powered by Vector · vector.app
      </div>
    </div>
  );
}
