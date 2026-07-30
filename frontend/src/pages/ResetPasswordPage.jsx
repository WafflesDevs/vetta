import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import Logo from "../Logo";

const RECOVERY_STORAGE_KEY = "vetta_password_recovery";

function readParams() {
  const hash = window.location.hash.replace(/^#/, "");
  // Supabase sometimes lands as #access_token=... or #/?... nested query.
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
  const hashParams = new URLSearchParams(hashQuery.replace(/^\//, ""));
  const queryParams = new URLSearchParams(window.location.search);
  return { hashParams, queryParams };
}

function readRecoveryFromUrl() {
  const { hashParams, queryParams } = readParams();

  const error =
    hashParams.get("error_description") ||
    hashParams.get("error") ||
    queryParams.get("error_description") ||
    queryParams.get("error");
  if (error) {
    return {
      error: decodeURIComponent(String(error).replace(/\+/g, " ")),
    };
  }

  const accessToken =
    hashParams.get("access_token") || queryParams.get("access_token");
  const refreshToken =
    hashParams.get("refresh_token") || queryParams.get("refresh_token");
  const type = hashParams.get("type") || queryParams.get("type") || "";
  const tokenHash =
    queryParams.get("token_hash") ||
    hashParams.get("token_hash") ||
    queryParams.get("token") ||
    hashParams.get("token");

  // Implicit / hash recovery session from the email redirect.
  if (accessToken && refreshToken) {
    return { accessToken, refreshToken, type: type || "recovery", tokenHash: null };
  }
  // Query flow: ?token_hash=...&type=recovery (token is an alias used in some templates)
  if (tokenHash && (!type || type === "recovery")) {
    return {
      accessToken: null,
      refreshToken: null,
      type: type || "recovery",
      tokenHash,
    };
  }
  return null;
}

function loadStoredRecovery() {
  try {
    const raw = sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeRecovery(recovery) {
  try {
    sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recovery));
  } catch {
    // ignore quota / private mode
  }
}

function clearStoredRecovery() {
  try {
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Read tokens from the URL synchronously and stash them in sessionStorage
 * before any effect can clear the hash (React Strict Mode remounts).
 */
function captureFromUrlOrStorage() {
  const fromUrl = readRecoveryFromUrl();
  if (fromUrl) {
    if (!fromUrl.error) {
      storeRecovery(fromUrl);
    } else {
      clearStoredRecovery();
    }
    // Strip secrets (and error params) from the address bar immediately.
    window.history.replaceState({}, "", "/reset-password");
    return fromUrl;
  }
  return loadStoredRecovery();
}

/** Mutable so a successful verify_otp can win over a stale token_hash on remount. */
let recoveryCache = null;

function resolveRecovery() {
  // Prefer a fresh URL capture (module may have loaded on another route first).
  const captured = captureFromUrlOrStorage();
  if (captured) {
    recoveryCache = captured.error ? null : captured;
    return captured;
  }
  if (recoveryCache?.accessToken && recoveryCache?.refreshToken) {
    return recoveryCache;
  }
  return recoveryCache;
}

/** Call as early as possible (e.g. from App) so the loading screen cannot race the hash. */
export function capturePasswordRecoveryFromLocation() {
  return resolveRecovery();
}

export default function ResetPasswordPage({ onAuth }) {
  // Sync capture on first render (lazy initializers) — before effects / Strict Mode remount.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(() => resolveRecovery()?.error || "");
  const [busy, setBusy] = useState(false);
  const [accessToken, setAccessToken] = useState(() => {
    const r = resolveRecovery();
    return r?.accessToken && r?.refreshToken ? r.accessToken : "";
  });
  const [refreshToken, setRefreshToken] = useState(() => {
    const r = resolveRecovery();
    return r?.accessToken && r?.refreshToken ? r.refreshToken : "";
  });
  const [ready, setReady] = useState(() => {
    const r = resolveRecovery();
    if (!r || r.error) return true;
    if (r.accessToken && r.refreshToken) return true;
    return false; // token_hash still needs verify-recovery
  });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const recovery = resolveRecovery();

      if (!recovery || recovery.error) {
        if (!cancelled) {
          setError(
            recovery?.error ||
              "This page needs the reset link from your email. Visiting /reset-password directly will not work."
          );
          setReady(true);
        }
        return;
      }

      // Already have a session (hash flow, or verify completed on a Strict Mode remount).
      if (recovery.accessToken && recovery.refreshToken) {
        if (!cancelled) {
          setAccessToken(recovery.accessToken);
          setRefreshToken(recovery.refreshToken);
          setToken(recovery.accessToken);
          setReady(true);
        }
        return;
      }

      if (!recovery.tokenHash) {
        if (!cancelled) {
          setError("Reset link is missing session tokens.");
          setReady(true);
        }
        return;
      }

      try {
        const data = await api("/api/auth/verify-recovery", {
          method: "POST",
          body: JSON.stringify({
            token_hash: recovery.tokenHash,
            type: recovery.type || "recovery",
          }),
        });
        if (!data.session?.access_token || !data.session?.refresh_token) {
          throw new Error("Could not verify reset link.");
        }
        const session = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          type: "recovery",
          tokenHash: null,
        };
        // Persist before any cancelled check so Strict Mode remount reuses the session.
        storeRecovery(session);
        recoveryCache = session;
        if (cancelled) return;
        setAccessToken(session.accessToken);
        setRefreshToken(session.refreshToken);
        setToken(session.accessToken);
      } catch (err) {
        // If a parallel Strict Mode invoke already exchanged the OTP, reuse it.
        const raced = resolveRecovery();
        if (raced?.accessToken && raced?.refreshToken) {
          if (!cancelled) {
            setAccessToken(raced.accessToken);
            setRefreshToken(raced.refreshToken);
            setToken(raced.accessToken);
          }
          return;
        }
        clearStoredRecovery();
        recoveryCache = null;
        if (!cancelled) {
          setError(err.message || "Reset link is invalid or expired.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!accessToken || !refreshToken) {
      setError("Missing recovery session. Open the link from your email again.");
      return;
    }

    setBusy(true);
    try {
      setToken(accessToken);
      await api("/api/auth/reset-password", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          password,
          refresh_token: refreshToken,
        }),
      });
      clearStoredRecovery();
      recoveryCache = null;
      await onAuth();
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = ready && !!accessToken && !!refreshToken && !busy;
  const missingLink = ready && !(accessToken && refreshToken);

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <img className="auth-photo" src="/brand/auth-login.png" alt="" />
        <div className="auth-side-shade" />
        <Link to="/" className="brand brand-icon" aria-label="Vetta home">
          <Logo size={32} />
        </Link>
        <div className="quote">
          <p>Find. Score. Tailor. Practice.</p>
          <span>Choose a new password</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Reset password</h1>
          <p className="sub">Pick a new password for your Vetta account.</p>
          {error && <div className="alert alert-error">{error}</div>}
          {!ready && (
            <p className="sub" style={{ marginTop: 0 }}>
              Verifying reset link…
            </p>
          )}
          {ready && accessToken && refreshToken && (
            <>
              <div className="field">
                <label>New password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button className="btn btn-solid btn-wide" disabled={!canSubmit}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </>
          )}
          {missingLink && (
            <div className="sub" style={{ marginTop: 8 }}>
              <p style={{ marginBottom: 8 }}>To reset your password:</p>
              <ol style={{ margin: "0 0 12px", paddingLeft: 18 }}>
                <li>
                  Open{" "}
                  <Link to="/forgot-password">Forgot password</Link> and request
                  a link
                </li>
                <li>Check your email (and spam) for the Vetta message</li>
                <li>Use the button/link in that email — it brings tokens with it</li>
              </ol>
              <p className="switch" style={{ marginTop: 0 }}>
                <Link to="/forgot-password">Request a new reset link</Link>
              </p>
            </div>
          )}
          <p className="switch">
            <Link to="/login">Back to log in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
