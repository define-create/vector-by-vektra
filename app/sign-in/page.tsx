"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const registered = searchParams.get("registered") === "true";
  const registeredEmail = searchParams.get("email") ?? "";
  const verified = searchParams.get("verified") === "true";
  const errorParam = searchParams.get("error");

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [showPassword, setShowPassword] = useState(false);

  async function handleResend() {
    if (!registeredEmail || resendStatus !== "idle") return;
    setResendStatus("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      });
    } finally {
      setResendStatus("sent");
      setTimeout(() => setResendStatus("idle"), 3000);
    }
  }

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        return;
      }

      router.push("/command");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base outline-none focus:border-zinc-600 placeholder:text-zinc-600";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-8">Sign in</h1>

        {registered && (
          <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 space-y-2">
            <p className="font-medium">Account created — check your email</p>
            <p className="text-zinc-500">
              We sent a verification link{registeredEmail ? <> to <span className="text-zinc-300">{registeredEmail}</span></> : ""}.
            </p>
            <button
              onClick={handleResend}
              disabled={resendStatus !== "idle"}
              className="text-zinc-400 hover:text-zinc-200 disabled:opacity-50 underline underline-offset-2 text-sm"
            >
              {resendStatus === "sent" ? "Sent!" : resendStatus === "sending" ? "Sending…" : "Resend email"}
            </button>
          </div>
        )}

        {verified && (
          <div className="mb-4 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-base text-green-400">
            Email verified. You can now sign in.
          </div>
        )}

        {(errorParam === "InvalidToken" || errorParam === "InvalidOrExpiredToken") && (
          <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base text-red-400">
            Verification link is invalid or expired. Please register again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={update("email")}
            required
            autoComplete="email"
            className={inputClass}
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={update("password")}
              required
              autoComplete="current-password"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-100 text-zinc-900 rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50 mt-1"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-500 text-center">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-zinc-300 hover:text-white">
            Create one
          </Link>
        </p>

      </div>
    </div>
  );
}

// useSearchParams requires Suspense boundary in Next.js App Router
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
