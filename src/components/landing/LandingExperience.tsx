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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    // First try getSession, then fall back to getUser for OAuth redirects
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // For OAuth redirects, the session might be in the URL hash
      // getUser() will exchange the code for a session
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setCheckingSession(false);
        return;
      }
      // If we have a user but no session, wait a moment for the session to be established
      await new Promise(resolve => setTimeout(resolve, 500));
      const { data: { session: newSession } } = await supabase.auth.getSession();
      session = newSession;
    }
    
    if (!session?.user) {
      setCheckingSession(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
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

  const openModal = (signUp: boolean = false) => {
    setError(null);
    setEmail("");
    setPassword("");
    setIsSignUp(signUp);
    setStep("auth");
  };

  const closeModal = () => {
    setError(null);
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
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        
        // If we got a session directly from sign up, use it
        if (data?.session) {
          setStep("declare");
          return;
        }
        
        // Check if user needs to confirm email
        if (data?.user) {
          // User created but needs email confirmation
          setError("Please check your email to confirm your account before continuing.");
          setLoading(false);
          return;
        }
        
        // Otherwise wait for session to be established
        await new Promise(resolve => setTimeout(resolve, 2000));
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) {
          throw new Error("Session not established after sign up. Please check your email for confirmation link.");
        }
        setStep("declare");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // Wait for session to be established after sign in
        await new Promise(resolve => setTimeout(resolve, 800));
        setStep("declare");
      }
    } catch (e: any) {
      // Handle rate limit errors specifically
      const isRateLimit = e.status === 429 || 
                         e.message?.includes("Too Many Requests") ||
                         e.message?.includes("rate limit") ||
                         e.message?.includes("too many requests");
      
      if (isRateLimit) {
        setError("Too many requests. Please wait a few moments before trying again. For faster access, try Google Sign In.");
      } else {
        const message = e instanceof Error ? e.message : "Authentication failed.";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        });
      if (error) throw error;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google sign-in failed.";
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

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setError("Session expired. Please sign in again.");
      setStep("auth");
      return;
    }

    setLoading(true);
    try {
      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: session.user.id,
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
            onClick={() => openModal(false)}
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
                onClick={() => openModal(true)}
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

            {step === "auth" && (
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

                {/* Google Sign-In Button */}
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                      />
                    </svg>
                    Continue with Google
                  </button>
                </div>

                {/* Divider */}
                <div className="relative mt-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-[#1c1917] px-2 text-stone-500">or</span>
                  </div>
                </div>

                {/* Email/Password Form */}
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
                <p className="mt-4 text-center text-sm text-stone-400">
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
