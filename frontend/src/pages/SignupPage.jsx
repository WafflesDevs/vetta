import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import Logo from "../Logo";

export default function SignupPage({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNote("");
    setBusy(true);
    try {
      const data = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
        }),
      });
      if (data.requires_email_confirmation || !data.session?.access_token) {
        setPendingConfirm(true);
        setNote(
          data.note ||
            "Check your email to confirm your account, then log in."
        );
        return;
      }
      setToken(data.session.access_token);
      await onAuth();
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email.trim()) return;
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
        <img className="auth-photo" src="/brand/auth-signup.png" alt="" />
        <div className="auth-side-shade" />
        <Link to="/" className="brand brand-icon" aria-label="Vetta home">
          <Logo size={32} />
        </Link>
        <div className="quote">
          <p>Your career loop starts here.</p>
          <span>Create your Vetta account</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        {pendingConfirm ? (
          <div className="auth-form">
            <h1>Check your email</h1>
            <p className="sub">
              We sent a confirmation link to <strong>{email}</strong>. Confirm it,
              then log in.
            </p>
            {note && <div className="alert alert-ok">{note}</div>}
            {error && <div className="alert alert-error">{error}</div>}
            <button
              type="button"
              className="btn btn-ghost btn-wide"
              disabled={busy}
              onClick={resend}
            >
              {busy ? "Sending…" : "Resend confirmation"}
            </button>
            <p className="switch">
              Ready? <Link to="/login">Log in</Link>
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <h1>Sign up</h1>
            <p className="sub">You’ll confirm your email before you can log in.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label>Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex"
              />
            </div>
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
              <label>Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-solid btn-wide" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
            <p className="switch">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
