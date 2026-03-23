"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  playerId: string;
  playerName: string;
  playerFirstName: string;
}

// ---------------------------------------------------------------------------
// InviteButton
// ---------------------------------------------------------------------------

export default function InviteButton({ playerId, playerName, playerFirstName }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  async function getOrCreateToken(): Promise<string | null> {
    if (inviteToken) return inviteToken;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to generate invite link.");
        return null;
      }
      const { token } = await res.json() as { token: string };
      setInviteToken(token);
      return token;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function openSheet() {
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setError(null);
    setCopied(false);
    setEmailSent(false);
    setEmail("");
  }

  async function copyLink() {
    const token = await getOrCreateToken();
    if (!token) return;
    const fullUrl = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Clipboard access denied.");
    }
  }

  async function sendEmail() {
    if (!email.trim()) return;
    setEmailSending(true);
    setError(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Failed to send invite email.");
        return;
      }
      const { token } = await res.json() as { token: string };
      if (!inviteToken) setInviteToken(token);
      setEmailSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setEmailSending(false);
    }
  }

  const truncatedUrl = inviteToken
    ? `vector.app/invite/${inviteToken.slice(0, 6)}…`
    : "vector.app/invite/…";

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={openSheet}
        className="flex-1 py-2.5 rounded-lg text-xs font-medium text-center text-emerald-400 border border-emerald-400/22 transition-colors"
        style={{ background: "rgba(52,211,153,0.10)" }}
      >
        ✦ Invite {playerFirstName}
      </button>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          onClick={closeSheet}
        >
          <div
            className="mx-auto w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#09090b] border-t border-white/5 rounded-t-3xl px-4 pt-0 pb-10">
              {/* Handle */}
              <div className="w-8 h-1 bg-zinc-700 rounded-full mx-auto mt-3 mb-5" />

              {/* Header */}
              <h2 className="text-xl font-bold text-zinc-50 tracking-tight">Invite {playerName}</h2>
              <p className="font-mono text-xs text-zinc-500 mt-1 mb-6">
                to join Vector and claim their stats.
              </p>

              {/* Copy invite link */}
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-50 mb-2.5">
                Copy invite link
              </p>
              <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-3.5 mb-5">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="font-mono text-xs text-zinc-500 flex-1 truncate">{truncatedUrl}</span>
                  <button
                    type="button"
                    onClick={copyLink}
                    disabled={loading}
                    className="bg-zinc-50 text-zinc-900 font-mono text-xs font-bold rounded-lg px-3 py-1.5 flex-shrink-0 disabled:opacity-50"
                  >
                    {loading ? "…" : copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-zinc-600">
                  Paste into WhatsApp, iMessage, or any group chat
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-[#1c1c1f] mb-5" />

              {/* Send by email */}
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-50 mb-2.5">
                Send by email{" "}
                <span className="font-normal normal-case tracking-normal text-zinc-500">— optional</span>
              </p>
              {emailSent ? (
                <p className="text-sm text-emerald-400 font-medium">Invite sent!</p>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="their@email.com"
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl px-3.5 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600 mb-2.5"
                  />
                  <button
                    type="button"
                    onClick={sendEmail}
                    disabled={emailSending || !email.trim()}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-xl py-3 text-sm font-semibold text-zinc-400 disabled:opacity-50"
                  >
                    {emailSending ? "Sending…" : "Send invite email →"}
                  </button>
                </>
              )}

              {error && (
                <p className="text-xs text-red-400 text-center mt-3">{error}</p>
              )}

              <button
                type="button"
                onClick={closeSheet}
                className="w-full text-center font-mono text-[11px] uppercase tracking-widest text-zinc-600 mt-5"
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
