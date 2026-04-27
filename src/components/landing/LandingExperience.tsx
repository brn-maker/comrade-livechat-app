"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/PasswordInput";

type Step = "closed" | "auth" | "declare";
type AuthMode = "login" | "signup" | "forgot";

const minBirthYear = 1900;

export function LandingExperience() {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("closed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [declaredGender, setDeclaredGender] = useState<
    "male" | "female" | "other" | ""
  >("");
  const [birthYear, setBirthYear] = useState("");
  const [seeking, setSeeking] = useState<"male" | "female" | "both" | "">("");

  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const supabase = useMemo(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createBrowserSupabaseClient();
    }
    return supabaseRef.current;
  }, []);

  const redirectIfComplete = useCallback(async () => {
    // Use getUser() to validate JWT with Supabase servers (more secure than getSession)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setCheckingSession(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error(profileError);
      setCheckingSession(false);
      return;
    }
    if (profile) {
      router.replace("/chat");
      return;
    }
    setStep("declare");
    setCheckingSession(false);
  }, [router, supabase]);

  useEffect(() => {
    void redirectIfComplete();
  }, [redirectIfComplete]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setStep((s) => (s === "declare" ? "auth" : s));
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (step === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStep("closed");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  const openModal = () => {
    setError(null);
    setEmail("");
    setPassword("");
    setIsSignUp(false);
    setAuthMode("login");
    setResetEmailSent(false);
    setStep("auth");
  };

  const closeModal = () => {
    setError(null);
    setAuthMode("login");
    setResetEmailSent(false);
    setStep("closed");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!email || !password) {
        throw new Error("Please enter email and password.");
      }
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setStep("declare");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        setStep("declare");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Authentication failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!email) {
        throw new Error("Please enter your email address.");
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetEmailSent(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send reset email.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const year = parseInt(birthYear, 10);
    if (!declaredGender || !seeking || Number.isNaN(year)) {
      setError("Please fill in every field.");
      return;
    }
    if (year < minBirthYear || year > new Date().getFullYear()) {
      setError(`Birth year must be between ${minBirthYear} and ${new Date().getFullYear()}.`);
      return;
    }

    // Use getUser() to validate JWT with Supabase servers (more secure than getSession)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Session expired. Please sign in again.");
      setStep("auth");
      return;
    }

    setLoading(true);
    try {
      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          gender: declaredGender,
          birth_year: year,
          seeking: seeking,
        },
        { onConflict: "id" },
      );
      if (upsertError) throw upsertError;
      router.push("/chat");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save your profile.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#0c0a09]">
        <p className="text-sm text-stone-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-full flex-1 overflow-hidden bg-[#0c0a09] text-stone-100">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(139, 92, 246, 0.35), transparent), radial-gradient(ellipse 60% 50% at 100% 50%, rgba(244, 63, 94, 0.12), transparent)",
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-full max-w-6xl flex-col px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:px-10">
        <header className="mb-16 flex items-center justify-between gap-4 sm:mb-24">
          <span className="text-sm font-semibold tracking-wide text-violet-300/90">
            Comrade
          </span>
          <button
            type="button"
            onClick={openModal}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 backdrop-blur transition hover:bg-white/10"
          >
            Sign in
          </button>
        </header>

        <main className="flex flex-1 flex-col justify-center">
          <div className="max-w-xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">
              Live video · Matched your way
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl sm:leading-[1.08]">
              Meet people on camera—with the filters and preferences{" "}
              <span className="text-transparent bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text">
                you choose
              </span>
              .
            </h1>
            <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-stone-400">
              Create an account to set your preferences and start matching with
              people on camera. Set who you are and who you want to meet, then
              go live.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={openModal}
                className="inline-flex h-12 items-center justify-center rounded-full bg-violet-500 px-8 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:bg-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0a09]"
              >
                Get started free
              </button>
              <p className="text-center text-xs text-stone-500 sm:text-left">
                ~60 seconds to your first match · Private &amp; moderated
              </p>
            </div>
          </div>
        </main>
      </div>

      {step !== "closed" && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/65 p-4 sm:bg-black/50 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-50 w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1917] p-6 shadow-2xl shadow-black/50 sm:p-8"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-lg p-1 text-stone-500 transition hover:bg-white/10 hover:text-stone-300"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {step === "auth" && authMode !== "forgot" && (
              <form onSubmit={handleAuth} className="pt-2">
                <h2
                  id={titleId}
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  {isSignUp ? "Create an account" : "Sign in"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">
                  {isSignUp
                    ? "Create an account to get started."
                    : "Sign in to continue."}
                </p>
                {error && (
                  <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}
                <div className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-stone-300"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40"
                    />
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    label="Password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-violet-500 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                >
                  {loading ? "Loading…" : isSignUp ? "Create account" : "Sign in"}
                </button>
                <div className="mt-4 space-y-3">
                  <p className="text-center text-sm text-stone-400">
                    {isSignUp ? "Already have an account? " : "Don't have an account? "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setError(null);
                      }}
                      className="text-violet-300 hover:text-violet-200"
                    >
                      {isSignUp ? "Sign in" : "Sign up"}
                    </button>
                  </p>
                  {!isSignUp && (
                    <p className="text-center text-sm text-stone-400">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("forgot");
                          setError(null);
                          setEmail("");
                        }}
                        className="text-violet-300 hover:text-violet-200"
                      >
                        Forgot password?
                      </button>
                    </p>
                  )}
                </div>
              </form>
            )}

            {step === "auth" && authMode === "forgot" && (
              <form onSubmit={handleForgotPassword} className="pt-2">
                <h2
                  id={titleId}
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  Reset password
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-400">
                  Enter your email and we'll send you a link to reset your password.
                </p>
                {error && (
                  <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}
                {resetEmailSent ? (
                  <div className="mt-6 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-300">
                    <p className="font-medium">Check your email!</p>
                    <p className="mt-2">We sent a password reset link to {email}</p>
                  </div>
                ) : (
                  <>
                    <div className="mt-6 space-y-4">
                      <div>
                        <label
                          htmlFor="reset-email"
                          className="block text-sm font-medium text-stone-300"
                        >
                          Email
                        </label>
                        <input
                          id="reset-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1.5 w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-violet-500 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                    >
                      {loading ? "Sending…" : "Send reset link"}
                    </button>
                  </>
                )}
                <p className="mt-4 text-center text-sm text-stone-400">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setError(null);
                      setEmail("");
                      setResetEmailSent(false);
                    }}
                    className="text-violet-300 hover:text-violet-200"
                  >
                    Back to sign in
                  </button>
                </p>
              </form>
            )}


            {step === "declare" && (
              <form onSubmit={(e) => void saveProfile(e)} className="pt-2">
                <h2
                  id={titleId}
                  className="text-xl font-semibold tracking-tight text-white"
                >
                  Almost there
                </h2>
                <p className="mt-2 text-sm text-stone-400">
                  This powers safer, better matches. You can update it anytime.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <label
                      htmlFor="declared-gender"
                      className="block text-sm font-medium text-stone-300"
                    >
                      Declared gender
                    </label>
                    <select
                      id="declared-gender"
                      required
                      value={declaredGender}
                      onChange={(e) =>
                        setDeclaredGender(
                          e.target.value as typeof declaredGender,
                        )
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40"
                    >
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="birth-year"
                      className="block text-sm font-medium text-stone-300"
                    >
                      Birth year
                    </label>
                    <input
                      id="birth-year"
                      type="number"
                      required
                      min={minBirthYear}
                      max={new Date().getFullYear()}
                      placeholder={`e.g. ${new Date().getFullYear() - 25}`}
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="seeking"
                      className="block text-sm font-medium text-stone-300"
                    >
                      Seeking
                    </label>
                    <select
                      id="seeking"
                      required
                      value={seeking}
                      onChange={(e) =>
                        setSeeking(e.target.value as typeof seeking)
                      }
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-stone-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40"
                    >
                      <option value="">Select…</option>
                      <option value="male">Men</option>
                      <option value="female">Women</option>
                      <option value="both">Everyone</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-violet-500 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
                >
                  {loading ? "Saving…" : "Enter chat"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
