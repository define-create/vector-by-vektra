"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const inputClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base outline-none focus:border-zinc-600 placeholder:text-zinc-600";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-base text-red-400">
          Invalid reset link.
        </div>
        <p className="text-sm text-zinc-500 text-center">
          <Link href="/forgot-password" className="text-zinc-300 hover:text-white">
            Request a new one
          </Link>
        </p>
      </div>
    );
  }

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: form.password }),
      });

      if (res.ok) {
        router.push("/sign-in?reset=true");
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          placeholder="New password"
          value={form.password}
          onChange={update("password")}
          required
          autoComplete="new-password"
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={form.confirm}
          onChange={update("confirm")}
          required
          autoComplete="new-password"
          className={inputClass}
        />

        {error && (
          <p className="text-red-400 text-sm">
            {error}{" "}
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-zinc-100 text-zinc-900 rounded-lg px-4 py-3 text-base font-medium disabled:opacity-50 mt-1"
        >
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500 text-center">
        <Link href="/sign-in" className="text-zinc-300 hover:text-white">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-8">Reset password</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
