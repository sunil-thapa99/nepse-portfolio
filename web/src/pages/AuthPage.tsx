import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { PasswordInput } from "../components/PasswordInput";

type Tab = "register" | "login";

export default function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSignupMessage(null);
    setPending(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (data.session) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setSignupMessage(
        "Check your email to confirm your account before signing in."
      );
    } finally {
      setPending(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSignupMessage(null);
    setPending(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (data.session) {
        navigate("/dashboard", { replace: true });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-surface-raised/80 p-8 shadow-xl">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-100">
          NEPSE portfolio
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Sign in with your Supabase account
        </p>

        <div className="mt-8 flex rounded-lg border border-slate-700 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("login");
              setShowPassword(false);
              setError(null);
              setSignupMessage(null);
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "login"
                ? "bg-accent/20 text-accent"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setShowPassword(false);
              setError(null);
              setSignupMessage(null);
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "register"
                ? "bg-accent/20 text-accent"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Register
          </button>
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm text-slate-400">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-600 bg-surface-overlay px-3 py-2.5 text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm text-slate-400">
                Password
              </label>
              <PasswordInput
                id="login-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword((s) => !s)}
              />
            </div>
            {error && (
              <p className="text-sm text-rose-300" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || loading}
              className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <div>
              <label htmlFor="register-email" className="block text-sm text-slate-400">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-600 bg-surface-overlay px-3 py-2.5 text-slate-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="register-password" className="block text-sm text-slate-400">
                Password
              </label>
              <PasswordInput
                id="register-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                showPassword={showPassword}
                onToggleShow={() => setShowPassword((s) => !s)}
              />
            </div>
            {error && (
              <p className="text-sm text-rose-300" role="alert">
                {error}
              </p>
            )}
            {signupMessage && (
              <p className="text-sm text-emerald-300/90" role="status">
                {signupMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || loading}
              className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
