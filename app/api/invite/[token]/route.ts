import crypto from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/invite/[token]
// Public — returns invite data: player stats, inviter name, recent matches.
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const invite = await prisma.inviteToken.findUnique({
    where: { tokenHash },
    include: {
      player: true,
      invitedBy: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
  }

  const now = new Date();
  let status: "active" | "expired" | "claimed";
  if (invite.claimedAt) {
    status = "claimed";
  } else if (invite.expiresAt < now) {
    status = "expired";
  } else {
    status = "active";
  }

  // Always return inviter name and player name for status pages
  const inviterName = invite.invitedBy.displayName;
  const player = invite.player;

  // Count shared matches between inviter's player and the shadow
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

  // Fetch the 3 most recent matches for the shadow player
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

  const recentMatches = participations.map((p) => {
    const myTeam = p.team;
    const games = p.match.games;

    // Determine match result
    let team1GameWins = 0;
    let team2GameWins = 0;
    for (const g of games) {
      if (g.team1Score > g.team2Score) team1GameWins++;
      else if (g.team2Score > g.team1Score) team2GameWins++;
    }
    const myTeamWon = myTeam === 1 ? team1GameWins > team2GameWins : team2GameWins > team1GameWins;
    const result = myTeamWon ? "W" : "L";

    // Build score string (e.g. "21–17, 18–21, 11–8")
    const scoreStr = games
      .map((g) => (myTeam === 1 ? `${g.team1Score}–${g.team2Score}` : `${g.team2Score}–${g.team1Score}`))
      .join(", ");

    // Partner = same team, not this player
    const partner = p.match.participants.find(
      (mp) => mp.team === myTeam && mp.playerId !== player.id,
    );
    const opponents = p.match.participants
      .filter((mp) => mp.team !== myTeam)
      .map((mp) => mp.player.displayName);

    return {
      date: p.match.matchDate.toISOString(),
      result,
      score: scoreStr,
      partnerName: partner?.player.displayName ?? null,
      opponentNames: opponents,
    };
  });

  // Total match count for the shadow player
  const matchCount = await prisma.matchParticipant.count({
    where: { playerId: player.id, match: { voidedAt: null } },
  });

  // Last 7 results for streak dots
  const last7Participations = await prisma.matchParticipant.findMany({
    where: {
      playerId: player.id,
      match: { voidedAt: null },
    },
    include: {
      match: {
        include: { games: true },
      },
    },
    orderBy: { match: { matchDate: "desc" } },
    take: 7,
  });

  const last7Results = last7Participations.map((p) => {
    const games = p.match.games;
    let t1 = 0;
    let t2 = 0;
    for (const g of games) {
      if (g.team1Score > g.team2Score) t1++;
      else if (g.team2Score > g.team1Score) t2++;
    }
    return p.team === 1 ? t1 > t2 : t2 > t1;
  }).reverse(); // oldest → newest

  return NextResponse.json({
    status,
    inviterName,
    inviterMatchCount,
    player: {
      id: player.id,
      displayName: player.displayName,
      matchCount,
      rating: Math.round(player.rating),
      winPct: player.winPct,
    },
    recentMatches,
    last7Results,
  });
}
