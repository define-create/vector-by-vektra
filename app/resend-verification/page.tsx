"use client";

import { useState } from "react";
import Link from "next/link";

const inputClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base outline-none focus:border-zinc-600 placeholder:text-zinc-600";

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2">Resend verification email</h1>
        <p className="text-sm text-zinc-500 mb-8">
          Enter your email and we&apos;ll send a new verification link.
        </p>

        {submitted ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base text-zinc-300">
            Check your inbox for a new verification link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-100 text-zinc-900 rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50 mt-1"
            >
              {loading ? "Sending…" : "Send verification email"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-zinc-500 text-center">
          <Link href="/sign-in" className="text-zinc-300 hover:text-white">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
