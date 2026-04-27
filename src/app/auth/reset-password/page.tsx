"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/PasswordInput";

// Loading fallback for Suspense
function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-950 via-stone-900 to-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1917] p-6 shadow-2xl shadow-black/50 sm:p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-stone-400">Loading...</p>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Invalid reset link. Please request a new one.");
    }
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reset password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-950 via-stone-900 to-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1917] p-6 shadow-2xl shadow-black/50 sm:p-8">
        <h1 className="text-2xl font-bold text-white">Reset password</h1>
        <p className="mt-2 text-sm text-stone-400">
          Enter your new password below.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {success ? (
          <div className="mt-6 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <p className="font-medium">Password reset successful!</p>
            <p className="mt-2">Redirecting you to sign in...</p>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label="New password"
              required
            />

            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              label="Confirm password"
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-violet-500 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>

            <p className="text-center text-sm text-stone-400">
              <a href="/" className="text-violet-300 hover:text-violet-200">
                Back to home
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// Main page component with Suspense boundary
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
