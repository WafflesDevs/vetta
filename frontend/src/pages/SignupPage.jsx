import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import Logo from "../Logo";

export default function SignupPage({ onAuth }) {
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [displayName, setDisplayName] = useState("");
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);
 const navigate = useNavigate();

 async function submit(e) {
 e.preventDefault();
 setError("");
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
 if (!data.session?.access_token) {
 setError(
 "Email sent! Check your inbox to confirm, then log in."
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

 return (
 <div className="auth-page">
 <aside className="auth-side">
 <img className="auth-photo" src="/brand/auth-signup.png" alt="" />
 <div className="auth-side-shade" />
 <Link to="/" className="brand brand-icon" aria-label="Vetta home">
 <Logo size={32} />
 </Link>
 <div className="quote">
 <p>Jumpstart your career.</p>
 <span>Create your Vetta account</span>
 </div>
 </aside>
 <div className="auth-form-wrap">
 <form className="auth-form" onSubmit={submit}>
 <h1>Sign up</h1>
 <p className="sub">Start free, no credit card.</p>
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
 </div>
 </div>
 );
}
