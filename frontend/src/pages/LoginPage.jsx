import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken } from "../api";
import Logo from "../Logo";

export default function LoginPage({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const confirmedBanner = useMemo(
    () => params.get("confirmed") === "1",
    [params]
  );

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNote("");
    setNeedsConfirm(false);
    setBusy(true);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!data.session?.access_token) throw new Error("Login failed.");
      setToken(data.session.access_token);
      await onAuth();
      navigate("/app");
    } catch (err) {
      const msg = err.message || "Login failed.";
      setError(msg);
      if (/confirm your email/i.test(msg)) setNeedsConfirm(true);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email.trim()) {
      setError("Enter your email above, then resend.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/resend-confirmation", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setNote(data.message || "If that email needs confirmation, we sent another link.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

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
          <span>Sign in to your career system</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Log in</h1>
          <p className="sub">Welcome back to Vetta.</p>
          {confirmedBanner && (
            <div className="alert alert-ok">Email confirmed — you can log in now.</div>
          )}
          {note && <div className="alert alert-ok">{note}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <div className="field-label-row">
              <label>Password</label>
              <Link to="/forgot-password" className="forgot-link">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-solid btn-wide" disabled={busy}>
            {busy ? "Signing in…" : "Log in"}
          </button>
          {needsConfirm && (
            <button
              type="button"
              className="btn btn-ghost btn-wide"
              style={{ marginTop: "0.75rem" }}
              disabled={busy}
              onClick={resend}
            >
              Resend confirmation email
            </button>
          )}
          <p className="switch">
            No account? <Link to="/signup">Sign up</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
