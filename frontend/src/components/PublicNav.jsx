import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import Logo from "../Logo";

function quizClass({ isActive }) {
  return `nav-quiz-cta${isActive ? " active" : ""}`;
}

function linkClass({ isActive }) {
  return isActive ? "active" : "";
}

export default function PublicNav({ user }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-nav${menuOpen ? " nav-open" : ""}`}>
      <Link to="/" className="brand" aria-label="Vetta home" onClick={closeMenu}>
        <Logo size={28} />
        <span className="brand-name">Vetta</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        <NavLink to="/try" className={quizClass}>
          Take a quiz
        </NavLink>
        <NavLink to="/features" className={linkClass}>
          Features
        </NavLink>
        <NavLink to="/pricing" className={linkClass}>
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
        <button
          type="button"
          className="nav-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      {menuOpen ? (
        <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={closeMenu} />
      ) : null}
      <nav className="nav-drawer" aria-label="Mobile" aria-hidden={!menuOpen}>
        <NavLink to="/try" className={quizClass} onClick={closeMenu}>
          Take a quiz
        </NavLink>
        <NavLink to="/features" className={linkClass} onClick={closeMenu}>
          Features
        </NavLink>
        <NavLink to="/pricing" className={linkClass} onClick={closeMenu}>
          Pricing
        </NavLink>
        <div className="nav-drawer-cta">
          {user ? (
            <Link className="btn btn-solid" to="/app" onClick={closeMenu}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login" onClick={closeMenu}>
                Log in
              </Link>
              <Link className="btn btn-solid" to="/signup" onClick={closeMenu}>
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <Link to="/" className="brand brand-footer" aria-label="Vetta home">
        <Logo size={18} />
        <span className="brand-name">Vetta</span>
      </Link>
      <nav className="footer-links">
        <Link to="/try">Take a quiz</Link>
        <Link to="/features">Features</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/signup">Start free</Link>
      </nav>
      <p className="site-footer-copy">© 2026 Vetta</p>
    </footer>
  );
}
