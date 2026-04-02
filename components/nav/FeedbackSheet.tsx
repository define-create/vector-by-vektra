"use client";

import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  userEmail: string;
}

export function FeedbackSheet({ open, onClose, userEmail }: Props) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Reset form when sheet closes
  useEffect(() => {
    if (!open) {
      setSubject("");
      setMessage("");
      setError("");
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [success, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg z-[70] rounded-t-2xl bg-zinc-900 border-t border-zinc-700 px-5 pt-5 flex flex-col gap-5 transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full bg-zinc-600 mx-auto -mt-1" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-widest">
            Send Feedback
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-400"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p className="text-base font-semibold text-zinc-100">Thanks for the feedback!</p>
            <p className="text-sm text-zinc-400">We&apos;ll reply to {userEmail}</p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Reply-to info */}
            <p className="text-xs text-zinc-500">
              We&apos;ll reply to: <span className="text-zinc-400">{userEmail}</span>
            </p>

            {/* Subject */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="feedback-subject"
                className="text-xs font-medium uppercase tracking-widest text-zinc-500"
              >
                Subject <span className="normal-case tracking-normal text-zinc-600">(optional)</span>
              </label>
              <input
                id="feedback-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="e.g. Bug report, feature idea…"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="feedback-message"
                className="text-xs font-medium uppercase tracking-widest text-zinc-500"
              >
                Message
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Tell us what's on your mind…"
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Error */}
            {error && <p className="text-sm text-red-400">{error}</p>}

            {/* Submit */}
            <button
              type="submit"
              disabled={!message.trim() || submitting}
              className="w-full rounded-lg bg-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending…" : "Send Feedback"}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
