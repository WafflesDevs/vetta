import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import Logo from "../Logo";

const CONFIRM_STORAGE_KEY = "vetta_email_confirm";

function readParams() {
  const hash = window.location.hash.replace(/^#/, "");
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
  const hashParams = new URLSearchParams(hashQuery.replace(/^\//, ""));
  const queryParams = new URLSearchParams(window.location.search);
  return { hashParams, queryParams };
}

function readConfirmFromUrl() {
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
  const type = hashParams.get("type") || queryParams.get("type") || "signup";
  const tokenHash =
    queryParams.get("token_hash") ||
    hashParams.get("token_hash") ||
    queryParams.get("token") ||
    hashParams.get("token");

  if (accessToken) {
    return {
      accessToken,
      refreshToken: refreshToken || "",
      type: type || "signup",
      tokenHash: null,
    };
  }
  if (tokenHash) {
    return {
      accessToken: null,
      refreshToken: null,
      type: type || "signup",
      tokenHash,
    };
  }
  return null;
}

function storeConfirm(payload) {
  try {
    sessionStorage.setItem(CONFIRM_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function loadStoredConfirm() {
  try {
    const raw = sessionStorage.getItem(CONFIRM_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearStoredConfirm() {
  try {
    sessionStorage.removeItem(CONFIRM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function captureFromUrlOrStorage() {
  const fromUrl = readConfirmFromUrl();
  if (fromUrl) {
    if (!fromUrl.error) storeConfirm(fromUrl);
    else clearStoredConfirm();
    window.history.replaceState({}, "", "/confirm-email");
    return fromUrl;
  }
  return loadStoredConfirm();
}

/** Call early from App so Strict Mode cannot drop the hash. */
export function captureEmailConfirmFromLocation() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.replace(/\/$/, "") !== "/confirm-email") return;
  captureFromUrlOrStorage();
}

export default function ConfirmEmailPage({ onAuth }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState("working"); // working | ok | error
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = captureFromUrlOrStorage();
      if (!payload) {
        if (!cancelled) {
          setStatus("error");
          setMessage("This confirmation link is missing a token. Sign up again or resend from login.");
        }
        return;
      }
      if (payload.error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(payload.error);
        }
        clearStoredConfirm();
        return;
      }

      try {
        if (payload.accessToken) {
          setToken(payload.accessToken);
          await onAuth?.();
          clearStoredConfirm();
          if (!cancelled) {
            setStatus("ok");
            setMessage("Email confirmed. Taking you in…");
            navigate("/app", { replace: true });
          }
          return;
        }

        if (payload.tokenHash) {
          const data = await api("/api/auth/verify-recovery", {
            method: "POST",
            body: JSON.stringify({
              token_hash: payload.tokenHash,
              type: payload.type || "signup",
            }),
          });
          if (!data.session?.access_token) {
            throw new Error("Could not confirm that link.");
          }
          setToken(data.session.access_token);
          await onAuth?.();
          clearStoredConfirm();
          if (!cancelled) {
            setStatus("ok");
            setMessage("Email confirmed. Taking you in…");
            navigate("/app", { replace: true });
          }
          return;
        }

        throw new Error("This confirmation link is incomplete.");
      } catch (err) {
        clearStoredConfirm();
        if (!cancelled) {
          setStatus("error");
          setMessage(err.message || "Could not confirm email.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, onAuth]);

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <img className="auth-photo" src="/brand/auth-signup.png" alt="" />
        <div className="auth-side-shade" />
        <Link to="/" className="brand brand-icon" aria-label="Vetta home">
          <Logo size={32} />
        </Link>
        <div className="quote">
          <p>One more step.</p>
          <span>Confirm your email to open Vetta</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1>Confirm email</h1>
          {status === "working" && <p className="sub">{message}</p>}
          {status === "ok" && <div className="alert alert-ok">{message}</div>}
          {status === "error" && (
            <>
              <div className="alert alert-error">{message}</div>
              <p className="switch" style={{ marginTop: "1rem" }}>
                <Link to="/login">Back to log in</Link>
                {" · "}
                <Link to="/signup">Sign up again</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
