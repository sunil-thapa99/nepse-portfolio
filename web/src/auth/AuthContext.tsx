import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Email/password users must have a confirmed email before we treat them as signed in. */
export function shouldRejectSession(session: Session | null): boolean {
  const u = session?.user;
  return Boolean(u?.email && !u.email_confirmed_at);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, s: Session | null) => {
        if (cancelled) return;
        if (shouldRejectSession(s)) {
          await supabase.auth.signOut();
          if (!cancelled) {
            setSession(null);
            setLoading(false);
          }
        } else {
          setSession(s);
          setLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signOut,
    }),
    [session, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
