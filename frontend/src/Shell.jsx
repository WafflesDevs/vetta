import { Link, NavLink } from "react-router-dom";
import Logo from "./Logo";

export default function Shell({ user, profile, onLogout, children }) {
 const name = profile?.display_name || user?.email || "you";

 return (
 <div className="app-shell">
 <aside className="sidebar">
 <div className="sidebar-top">
 <Link to="/" className="brand-row" aria-label="Vetta home">
 <Logo />
 </Link>
 </div>

 <nav className="nav-links">
 <NavLink to="/chat" className={({ isActive }) => (isActive ? "active" : "")}>
 Chat
 </NavLink>
 <NavLink to="/hub" className={({ isActive }) => (isActive ? "active" : "")}>
 Career Hub
 </NavLink>
 <NavLink to="/quiz" className={({ isActive }) => (isActive ? "active" : "")}>
 Interview Quiz
 </NavLink>
 <NavLink to="/plans" className={({ isActive }) => (isActive ? "active" : "")}>
 Plans
 </NavLink>
 <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
 Resume & Prefs
 </NavLink>
 </nav>

 <div className="sidebar-foot">
 <div className="muted" style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem" }}>
 Signed in as<br />
 <strong style={{ color: "white" }}>{name}</strong>
 </div>
 <button className="btn btn-ghost" onClick={onLogout}>
 Log out
 </button>
 </div>
 </aside>
 <main className="main">{children}</main>
 </div>
 );
}
