import crypto from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import InviteClaimButton from "./InviteClaimButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentMatch {
  date: string;
  result: "W" | "L";
  score: string;
  partnerName: string | null;
  opponentNames: string[];
}

interface InviteData {
  status: "active" | "expired" | "claimed";
  inviterName: string;
  inviterMatchCount: number;
  player: {
    id: string;
    displayName: string;
    matchCount: number;
    rating: number;
    winPct: number | null;
  };
  recentMatches: RecentMatch[];
  last7Results: boolean[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function formatMatchDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function InvitePage(
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Query DB directly (same data as API)
  const invite = await prisma.inviteToken.findUnique({
    where: { tokenHash },
    include: {
      player: true,
      invitedBy: true,
    },
  });

  if (!invite) notFound();

  const now = new Date();
  let status: InviteData["status"];
  if (invite.claimedAt) {
    status = "claimed";
  } else if (invite.expiresAt < now) {
    status = "expired";
  } else {
    status = "active";
  }

  const inviterName = invite.invitedBy.displayName;
  const player = invite.player;

  // Check current session for authenticated one-click claim
  const session = await getServerSession(authOptions);
  const currentUserId = session?.user?.id ?? null;

  let currentUserPlayer: { id: string; displayName: string } | null = null;
  if (currentUserId) {
    const userWithPlayer = await prisma.user.findUnique({
      where: { id: currentUserId },
      include: { player: true },
    });
    if (userWithPlayer?.player && !userWithPlayer.player.deletedAt) {
      currentUserPlayer = {
        id: userWithPlayer.player.id,
        displayName: userWithPlayer.player.displayName,
      };
    }
  }

  // ── Terminal states ──────────────────────────────────────────────────────

  if (status === "claimed") {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
        <NavBar />
        <div className="w-full max-w-xl px-4 py-16 flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
            <span className="text-emerald-400 text-lg">✓</span>
          </div>
          <p className="text-zinc-200 font-medium text-center">This profile has already been claimed.</p>
          <Link href="/register" className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
            Create your own account →
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
        <NavBar />
        <div className="w-full max-w-xl px-4 py-16 flex flex-col items-center gap-3">
          <p className="text-zinc-400 text-center">This invite link has expired.</p>
          <p className="text-zinc-500 text-sm text-center">Ask <span className="text-zinc-300">{inviterName}</span> to send a new one.</p>
        </div>
        <Footer />
      </div>
    );
  }

  // ── Active invite ─────────────────────────────────────────────────────────

  // Count shared matches
  const inviterUser = await prisma.user.findUnique({
    where: { id: invite.invitedByUserId },
    include: { player: true },
  });
  const inviterMatchCount = inviterUser?.player
    ? await prisma.matchParticipant.count({
        where: {
          playerId: inviterUser.player.id,
          match: {
            voidedAt: null,
            participants: { some: { playerId: player.id } },
          },
        },
      })
    : 0;

  // Recent matches
  const participations = await prisma.matchParticipant.findMany({
    where: {
      playerId: player.id,
      match: { voidedAt: null },
    },
    include: {
      match: {
        include: {
          participants: {
            include: { player: { select: { displayName: true } } },
          },
          games: { orderBy: { gameOrder: "asc" } },
        },
      },
    },
    orderBy: { match: { matchDate: "desc" } },
    take: 3,
  });

  const recentMatches: RecentMatch[] = participations.map((p) => {
    const myTeam = p.team;
    const games = p.match.games;
    let t1 = 0; let t2 = 0;
    for (const g of games) {
      if (g.team1Score > g.team2Score) t1++;
      else if (g.team2Score > g.team1Score) t2++;
    }
    const won = myTeam === 1 ? t1 > t2 : t2 > t1;
    const scoreStr = games
      .map((g) => myTeam === 1 ? `${g.team1Score}–${g.team2Score}` : `${g.team2Score}–${g.team1Score}`)
      .join(", ");
    const partner = p.match.participants.find(
      (mp) => mp.team === myTeam && mp.playerId !== player.id,
    );
    const opponents = p.match.participants
      .filter((mp) => mp.team !== myTeam)
      .map((mp) => mp.player.displayName);
    return {
      date: p.match.matchDate.toISOString(),
      result: won ? "W" : "L",
      score: scoreStr,
      partnerName: partner?.player.displayName ?? null,
      opponentNames: opponents,
    };
  });

  // Total match count
  const matchCount = await prisma.matchParticipant.count({
    where: { playerId: player.id, match: { voidedAt: null } },
  });

  // Last 7 results
  const last7 = await prisma.matchParticipant.findMany({
    where: { playerId: player.id, match: { voidedAt: null } },
    include: { match: { include: { games: true } } },
    orderBy: { match: { matchDate: "desc" } },
    take: 7,
  });
  const last7Results = last7.map((p) => {
    const games = p.match.games;
    let t1 = 0; let t2 = 0;
    for (const g of games) {
      if (g.team1Score > g.team2Score) t1++;
      else if (g.team2Score > g.team1Score) t2++;
    }
    return p.team === 1 ? t1 > t2 : t2 > t1;
  }).reverse();

  const winPct = player.winPct != null ? Math.round(player.winPct * 100) : null;

  // ── Authenticated: already has a player ──────────────────────────────────
  if (currentUserId && currentUserPlayer) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
        <NavBar />
        <div className="w-full max-w-xl px-4 py-8 flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111113] px-4 py-4 text-sm text-zinc-400 leading-relaxed">
            You already have a profile (<span className="text-zinc-200 font-medium">{currentUserPlayer.displayName}</span>).
            If you think this invite is for you, contact your group admin.
          </div>
          <PlayerProofCard
            player={{ ...player, matchCount, winPct }}
            last7Results={last7Results}
          />
        </div>
        <Footer />
      </div>
    );
  }

  // ── Authenticated: no player yet → one-click claim ───────────────────────
  if (currentUserId && !currentUserPlayer) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
        <NavBar />
        <div className="w-full max-w-xl px-4 py-6 flex flex-col gap-4">
          <HeroBlock
            inviterName={inviterName}
            inviterMatchCount={inviterMatchCount}
            playerName={player.displayName}
            matchCount={matchCount}
          />
          <PlayerProofCard
            player={{ ...player, matchCount, winPct }}
            last7Results={last7Results}
          />
          {recentMatches.length > 0 && (
            <MatchesSection matches={recentMatches} />
          )}
          <div className="flex flex-col gap-3 pb-2">
            <p className="font-mono text-xs text-zinc-400 text-center">
              Is <span className="text-zinc-200">{player.displayName}</span>&apos;s profile yours?
            </p>
            <InviteClaimButton token={token} playerName={player.displayName} />
            <Link
              href="/command"
              className="text-center font-mono text-xs text-zinc-500 hover:text-zinc-400"
            >
              Not me — dismiss
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center">
      <NavBar />
      <div className="w-full max-w-xl px-4 py-6 flex flex-col gap-4">
        <HeroBlock
          inviterName={inviterName}
          inviterMatchCount={inviterMatchCount}
          playerName={player.displayName}
          matchCount={matchCount}
        />

        <PlayerProofCard
          player={{ ...player, matchCount, winPct }}
          last7Results={last7Results}
        />

        {recentMatches.length > 0 && (
          <MatchesSection matches={recentMatches} />
        )}

        {/* CTA */}
        <div className="flex flex-col gap-3 pt-1 pb-2">
          <Link
            href={`/register?inviteToken=${token}`}
            className="block w-full text-center bg-zinc-50 text-zinc-900 font-semibold text-sm py-4 rounded-xl hover:bg-white transition-colors"
          >
            Create account to claim your stats →
          </Link>
          <p className="text-center font-mono text-xs text-zinc-500">or</p>
          <p className="text-center font-mono text-xs text-zinc-400">
            Already a member?{" "}
            <Link
              href={`/sign-in?inviteToken=${token}`}
              className="text-emerald-400 hover:text-emerald-300"
            >
              Sign in →
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NavBar() {
  return (
    <div className="w-full max-w-xl border-b border-zinc-800 flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="font-mono text-sm font-medium text-zinc-50 tracking-wider">Vector</span>
      </div>
      <span className="font-mono text-[10px] border border-zinc-700 rounded px-2 py-0.5 text-zinc-400">
        Your invite
      </span>
    </div>
  );
}

function HeroBlock({
  inviterName,
  inviterMatchCount,
  playerName,
  matchCount,
}: {
  inviterName: string;
  inviterMatchCount: number;
  playerName: string;
  matchCount: number;
}) {
  const initials = inviterName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  return (
    <div className="relative rounded-2xl overflow-hidden bg-[#0f0f11] border border-zinc-800 px-5 py-6">
      {/* Subtle emerald radial glow */}
      <div
        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 200px 120px at 20% 0%, rgba(52,211,153,0.07) 0%, transparent 70%)" }}
      />

      {/* Inviter context */}
      <div className="flex items-center gap-3 mb-5 relative z-10">
        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-mono text-sm font-semibold text-emerald-400 flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">{inviterName}</p>
          <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
            Played {inviterMatchCount} match{inviterMatchCount === 1 ? "" : "es"} with you · invited you
          </p>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-zinc-50">
          Your pickleball stats<br />are{" "}
          <span className="text-emerald-400">already here</span>.
        </h1>
        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
          {inviterName} thinks this profile is yours. {matchCount} match{matchCount === 1 ? "" : "es"}. Real ratings. All tracked.
        </p>
      </div>
    </div>
  );
}

function PlayerProofCard({
  player,
  last7Results,
}: {
  player: { displayName: string; rating: number; matchCount: number; winPct: number | null };
  last7Results: boolean[];
}) {
  return (
    <div
      className="rounded-2xl border border-[#374155] overflow-hidden"
      style={{ boxShadow: "0 0 0 1px rgba(52,211,153,0.08), inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      <div className="bg-[#18181b] px-4 py-3.5 flex items-center justify-between border-b border-zinc-800">
        <span className="text-base font-semibold text-zinc-50">{player.displayName}</span>
        <div className="flex items-center gap-1.5 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="font-mono text-[9px] text-emerald-400 tracking-wide">Unclaimed</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800 bg-[#111113]">
        <div className="px-4 py-3.5">
          <p className="font-mono text-xl font-medium text-zinc-50">{player.matchCount}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">Matches</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-xl font-medium text-emerald-400">{player.rating.toLocaleString()}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">Rating</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="font-mono text-xl font-medium text-zinc-50">
            {player.winPct != null ? `${player.winPct}%` : "—"}
          </p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">Win rate</p>
        </div>
      </div>

      {/* Win streak dots */}
      {last7Results.length > 0 && (
        <div className="bg-[#111113] px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-500">Last {last7Results.length} results —</span>
          <div className="flex gap-1">
            {last7Results.map((won, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-sm ${won ? "bg-emerald-500" : "bg-rose-500/70"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchesSection({ matches }: { matches: RecentMatch[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        Recent matches
      </p>
      {matches.map((m, i) => {
        const isWin = m.result === "W";
        const vsStr = [
          m.partnerName ? `w/ ${m.partnerName}` : null,
          m.opponentNames.length > 0 ? `vs ${m.opponentNames.join(" / ")}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={i}
            className="flex items-center gap-3 bg-[#18181b] border border-zinc-800 rounded-xl px-4 py-3"
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-[11px] font-medium flex-shrink-0 ${
                isWin
                  ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                  : "bg-rose-400/10 text-rose-400 border border-rose-400/18"
              }`}
            >
              {m.result}
            </div>
            <div className="flex-1 min-w-0">
              {vsStr && (
                <p className="text-xs text-zinc-300 truncate">{vsStr}</p>
              )}
              {m.score && (
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{m.score}</p>
              )}
            </div>
            <span className="font-mono text-[10px] text-zinc-600 flex-shrink-0">
              {formatMatchDate(m.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-auto w-full max-w-xl text-center py-4 border-t border-zinc-900 font-mono text-[10px] tracking-wider text-zinc-600">
      Powered by Vector · vector.app
    </div>
  );
}

// Suppress unused warning for getInitials — used in tests/utils
void getInitials;
