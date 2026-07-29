import { Link, NavLink } from "react-router-dom";
import Logo from "../Logo";
import MadeBy from "./MadeBy";

export default function PublicNav({ user }) {
 return (
 <header className="site-nav">
 <Link to="/" className="brand brand-icon" aria-label="Vetta home">
 <Logo size={28} />
 </Link>
 <nav className="nav-links">
 <NavLink to="/features" className={({ isActive }) => (isActive ? "active" : "")}>
 Features
 </NavLink>
 <NavLink to="/pricing" className={({ isActive }) => (isActive ? "active" : "")}>
 Pricing
 </NavLink>
 </nav>
 <div className="nav-cta">
 {user ? (
 <Link className="btn btn-solid" to="/app">
 Dashboard
 </Link>
 ) : (
 <>
 <Link className="btn btn-ghost" to="/login">
 Log in
 </Link>
 <Link className="btn btn-solid" to="/signup">
 Sign up
 </Link>
 </>
 )}
 </div>
 </header>
 );
}

export function PublicFooter() {
 return (
 <footer className="site-footer site-footer-made">
 <Link to="/" className="brand" style={{ color: "var(--muted)", fontSize: "0.85rem" }} aria-label="Vetta home">
 <Logo size={18} />
 </Link>
 <MadeBy />
 </footer>
 );
}
