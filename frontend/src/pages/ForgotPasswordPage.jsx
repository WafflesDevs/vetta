import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Logo from "../Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
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
          <span>Reset access to your career system</span>
        </div>
      </aside>
      <div className="auth-form-wrap">
        {sent ? (
          <div className="auth-form">
            <h1>Check your email</h1>
            <p className="sub">
              If an account exists for <strong>{email}</strong>, we sent a reset
              link. Open that email link (don&apos;t navigate to /reset-password
              yourself) to choose a new password.
            </p>
            <div className="alert alert-ok">
              Check your inbox (and spam) for the Vetta reset email. The link
              expires after a short time — request another if it fails.
            </div>
            <p className="switch">
              <Link to="/login">Back to log in</Link>
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <h1>Forgot password</h1>
            <p className="sub">
              Enter your email and we’ll send a reset link.
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button className="btn btn-solid btn-wide" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <p className="switch">
              Remember it? <Link to="/login">Log in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
