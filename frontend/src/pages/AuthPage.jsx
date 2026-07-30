import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Logo from "../Logo";

export default function AuthPage({ onAuth }) {
 const [mode, setMode] = useState("login"); // login | signup
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [displayName, setDisplayName] = useState("");
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);

 async function submit(e) {
 e.preventDefault();
 setError("");
 setBusy(true);
 try {
 const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
 const body =
 mode === "login"
 ? { email, password }
 : { email, password, display_name: displayName };

 const data = await api(path, {
 method: "POST",
 body: JSON.stringify(body),
 });

 if (!data.session?.access_token) {
 setError(
 "Email sent! Check your inbox to confirm, then log in."
 );
 setMode("login");
 return;
 }
 await onAuth(data.session);
 } catch (err) {
 setError(err.message);
 } finally {
 setBusy(false);
 }
 }

 return (
 <div className="auth-shell">
 <section className="auth-visual">
 <div className="auth-brand">
 <Link to="/" aria-label="Vetta home">
 <Logo size={40} />
 </Link>
 </div>
 <div className="auth-copy">
 <h2>Your career coach that actually does the work.</h2>
 <p>
 Find roles, score fit, rewrite your resume, and drill interview
 questions, all in one place built around you.
 </p>
 </div>
 </section>

 <section className="auth-panel">
 <form className="auth-card" onSubmit={submit}>
 <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
 <p className="sub">Free tier · 1 chat · 60 messages</p>

 {error && <div className="error">{error}</div>}

 {mode === "signup" && (
 <div className="field">
 <label>Display name</label>
 <input
 value={displayName}
 onChange={(e) => setDisplayName(e.target.value)}
 placeholder="Alex"
 />
 </div>
 )}

 <div className="field">
 <label>Email</label>
 <input
 type="email"
 required
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 placeholder="you@email.com"
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
 placeholder="At least 6 characters"
 />
 </div>

 <button className="btn btn-lime btn-wide" disabled={busy}>
 {busy ? "Working…" : mode === "login" ? "Log in" : "Sign up"}
 </button>

 <div className="auth-switch">
 {mode === "login" ? (
 <>
 New here?{" "}
 <button type="button" onClick={() => setMode("signup")}>
 Sign up
 </button>
 </>
 ) : (
 <>
 Already have an account?{" "}
 <button type="button" onClick={() => setMode("login")}>
 Log in
 </button>
 </>
 )}
 </div>
 </form>
 </section>
 </div>
 );
}
