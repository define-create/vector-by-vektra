"use client";

import { useState } from "react";
import Link from "next/link";

const inputClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base outline-none focus:border-zinc-600 placeholder:text-zinc-600";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-8">Forgot password</h1>

        {submitted ? (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-base text-green-400">
              Check your email for a reset link.
            </div>
            <p className="text-sm text-zinc-500 text-center">
              <Link href="/sign-in" className="text-zinc-300 hover:text-white">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <>
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
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-100 text-zinc-900 rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50 mt-1"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="mt-6 text-sm text-zinc-500 text-center">
              <Link href="/sign-in" className="text-zinc-300 hover:text-white">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
