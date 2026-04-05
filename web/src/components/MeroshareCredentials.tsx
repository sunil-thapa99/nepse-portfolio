import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { apiUrl } from "../lib/apiUrl";
import { supabase } from "../lib/supabaseClient";
import { PasswordInput } from "./PasswordInput";

type SavedRow = { username: string; dp_id: string };

function formatFastApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (
          item &&
          typeof item === "object" &&
          "msg" in item &&
          typeof (item as { msg: unknown }).msg === "string"
        ) {
          return (item as { msg: string }).msg;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter(Boolean)
      .join("; ");
  }
  if (detail != null && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail ?? "");
}

export function MeroshareCredentials() {
  const { session, loading: authLoading } = useAuth();
  const [saved, setSaved] = useState<SavedRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRow, setLoadingRow] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [dpId, setDpId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const refreshSaved = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s) {
      setSaved(null);
      setLoadingRow(false);
      return;
    }
    setLoadingRow(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("meroshare_credentials")
      .select("username, dp_id")
      .maybeSingle();
    setLoadingRow(false);
    if (error) {
      setLoadError(error.message);
      setSaved(null);
      return;
    }
    if (data && typeof data.username === "string" && typeof data.dp_id === "string") {
      setSaved({ username: data.username, dp_id: data.dp_id });
      setUsername(data.username);
      setDpId(data.dp_id);
      setEditing(false);
    } else {
      setSaved(null);
      setEditing(true);
      setUsername("");
      setDpId("");
    }
    setPassword("");
    setShowPassword(false);
  }, []);

  const sessionUserId = session?.user?.id;

  useEffect(() => {
    if (authLoading) return;
    if (!sessionUserId) {
      setSaved(null);
      setLoadingRow(false);
      setUsername("");
      setDpId("");
      setPassword("");
      setShowPassword(false);
      setEditing(true);
      return;
    }
    void refreshSaved();
  }, [authLoading, sessionUserId, refreshSaved]);

  const showForm = !saved || editing;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!session?.access_token) {
      setSubmitError("Not signed in.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/meroshare/credentials"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          dp_id: dpId.trim(),
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try {
          const j = JSON.parse(text) as { detail?: unknown };
          if (j.detail !== undefined) detail = formatFastApiDetail(j.detail);
        } catch {
          /* use raw */
        }
        throw new Error(detail || `Request failed (${res.status})`);
      }
      setSuccessFlash(true);
      setTimeout(() => setSuccessFlash(false), 4000);
      await refreshSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loadingRow) {
    return (
      <section className="rounded-2xl border border-slate-700/80 bg-surface-raised/60 p-6 text-sm text-slate-400">
        Loading MeroShare credentials…
      </section>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-700/80 bg-surface-raised/60 p-6">
      <h2 className="text-lg font-semibold text-slate-100">MeroShare login</h2>
      <p className="mt-1 text-sm text-slate-500">
        Stored encrypted on the server. Used when you run integrations that need MeroShare access.
      </p>

      {loadError && (
        <p className="mt-3 text-sm text-amber-400" role="alert">
          Could not load saved credentials: {loadError}
        </p>
      )}

      {successFlash && (
        <p className="mt-3 text-sm text-emerald-400" role="status">
          Credentials saved.
        </p>
      )}

      {saved && !editing && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">
            Credentials saved. Click to update.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setUsername(saved.username);
              setDpId(saved.dp_id);
              setPassword("");
              setShowPassword(false);
              setSubmitError(null);
            }}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:border-accent/60 hover:bg-slate-800/50"
          >
            Edit
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label htmlFor="ms-username" className="block text-sm font-medium text-slate-300">
              MeroShare Username
            </label>
            <input
              id="ms-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-surface-overlay px-3 py-2 text-slate-100 outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="ms-password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <PasswordInput
              id="ms-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((s) => !s)}
              inputClassName="w-full rounded-lg border border-slate-600 bg-surface-overlay px-3 py-2 pr-10 text-slate-100 outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="ms-dp" className="block text-sm font-medium text-slate-300">
              DP ID
            </label>
            <input
              id="ms-dp"
              type="text"
              autoComplete="off"
              value={dpId}
              onChange={(e) => setDpId(e.target.value)}
              required
              placeholder="Depository Participant name as on the login page"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-surface-overlay px-3 py-2 text-slate-100 outline-none ring-accent/30 focus:border-accent focus:ring-2"
            />
          </div>
          {submitError && (
            <p className="text-sm text-red-400" role="alert">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-slate-950 transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save credentials"}
          </button>
        </form>
      )}
    </section>
  );
}
