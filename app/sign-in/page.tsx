"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const registered = searchParams.get("registered") === "true";
  const verified = searchParams.get("verified") === "true";
  const errorParam = searchParams.get("error");

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base text-zinc-300">
            Account created. Check your email to verify your address.
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
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={update("password")}
            required
            autoComplete="current-password"
            className={inputClass}
          />

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
