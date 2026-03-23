import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

// ---------------------------------------------------------------------------
// GET /api/og/matchup
//
// Edge Runtime — generates a 800×600 PNG card for social sharing.
// All styles are inline objects with flexbox only (Satori constraint).
//
// Query params:
//   p1, p2, p3, p4  — display names
//   pct             — integer win probability (0–100)
//   ml              — moneyline string (e.g. "-240", "+180", "Even")
//   rd              — ratingDiff string (e.g. "+82.0")
//   mo              — momentum label (e.g. "↑ Rising")
//   lc              — "1" if low confidence (prefix ~ on pct)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Font loading — fetch DM Mono 500 from Google Fonts at request time.
// Module-level cache so warm Edge instances reuse the ArrayBuffer.
// ---------------------------------------------------------------------------

let geistFont: ArrayBuffer | null = null;

// Loads Geist 400 (TTF) from public/fonts — same font as the rest of the app.
// TTF is required; Satori does not support woff2.
async function loadGeistFont(reqUrl: string): Promise<ArrayBuffer> {
  if (geistFont) return geistFont;
  const origin = new URL(reqUrl).origin;
  const buf = await fetch(`${origin}/fonts/geist-400.ttf`).then((r) => {
    if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
    return r.arrayBuffer();
  });
  geistFont = buf;
  return buf;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const font = await loadGeistFont(req.url);

  const p1 = searchParams.get("p1") ?? "P1";
  const p2 = searchParams.get("p2") ?? "P2";
  const p3 = searchParams.get("p3") ?? "P3";
  const p4 = searchParams.get("p4") ?? "P4";
  const pct = parseInt(searchParams.get("pct") ?? "50", 10);
  const ml = searchParams.get("ml") ?? "Even";
  const rd = searchParams.get("rd") ?? "0";
  const mo = searchParams.get("mo") ?? "→ Steady";
  const lc = searchParams.get("lc") === "1";

  const teamA = `${p1} / ${p2}`;
  const teamB = `${p3} / ${p4}`;
  const pctDisplay = lc ? `~${pct}%` : `${pct}%`;
  const oppPct = 100 - pct;

  // Colors
  const BG = "#09090b";
  const BORDER = "#27272a";
  const T1 = "#fafafa";
  const T3 = "#71717a";
  const T4 = "#52525b";
  const EM = "#34d399";
  const EM_MID = "#10b981";

  return new ImageResponse(
    (
      <div
        style={{
          width: 800,
          height: 600,
          background: BG,
          display: "flex",
          flexDirection: "column",
          padding: "40px 48px 40px",
          fontFamily: "'Geist', sans-serif",
          position: "relative",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: EM }} />
            <span style={{ fontSize: 15, fontWeight: 500, color: T1, letterSpacing: "0.07em" }}>Vector</span>
          </div>
          <span style={{ fontSize: 13, color: T4, letterSpacing: "0.05em" }}>vector.app</span>
        </div>

        {/* Teams */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 32 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: T1, letterSpacing: "-0.01em" }}>{teamA}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ fontSize: 11, color: T4, letterSpacing: "0.14em" }}>VS</span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 500, color: T3 }}>{teamB}</span>
        </div>

        {/* Probability section */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 28,
          paddingBottom: 28,
          borderBottom: `1px solid ${BORDER}`,
          marginBottom: 28,
        }}>
          {/* Big number */}
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <span style={{
              fontSize: 100,
              fontWeight: 500,
              color: T1,
              lineHeight: 0.92,
              letterSpacing: "-0.04em",
            }}>{pctDisplay}</span>
            <span style={{ fontSize: 14, color: EM, marginTop: 10, letterSpacing: "0.03em" }}>↑ {teamA} is favored</span>
          </div>

          {/* Probability bars */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 6 }}>
            {/* Team A bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, color: T3, letterSpacing: "0.04em" }}>{teamA}</span>
              <div style={{ height: 7, background: BORDER, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${EM_MID}, ${EM})`, borderRadius: 4 }} />
              </div>
            </div>
            {/* Team B bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, color: T3, letterSpacing: "0.04em" }}>{teamB}</span>
              <div style={{ height: 7, background: BORDER, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${oppPct}%`, height: "100%", background: T4, borderRadius: 4 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: T3, letterSpacing: "0.08em", textTransform: "uppercase" }}>Δ Rating</span>
            <span style={{ fontSize: 24, fontWeight: 500, color: T1 }}>{rd}</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingLeft: 20, borderLeft: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 11, color: T3, letterSpacing: "0.08em", textTransform: "uppercase" }}>Model Line</span>
            <span style={{ fontSize: 24, fontWeight: 500, color: T1 }}>{ml}</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingLeft: 20, borderLeft: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 11, color: T3, letterSpacing: "0.08em", textTransform: "uppercase" }}>Momentum</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: T1, paddingTop: 3 }}>{mo}</span>
          </div>
        </div>

        {/* Subtle corner glow */}
        <div style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          background: "radial-gradient(circle, rgba(52,211,153,0.07) 0%, transparent 65%)",
          borderRadius: "50%",
        }} />
      </div>
    ),
    {
      width: 800,
      height: 600,
      fonts: [{ name: "Geist", data: font, weight: 400 as const, style: "normal" as const }],
    },
  );
}
