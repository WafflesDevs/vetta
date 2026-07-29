import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Logo from "../Logo";

const HOLD_MS = 500;
const FADE_MS = 220;

// Survive React StrictMode remounts so we don't flash on first paint
let lastPath = null;

export default function PageTransition({ children }) {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [on, setOn] = useState(false);
  const timers = useRef([]);

  useEffect(() => {
    if (lastPath === null) {
      lastPath = location.pathname;
      return;
    }
    if (lastPath === location.pathname) return;
    lastPath = location.pathname;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    setActive(true);
    setOn(false);
    const frame = requestAnimationFrame(() => setOn(true));

    const fadeOut = setTimeout(() => setOn(false), HOLD_MS);
    const remove = setTimeout(() => setActive(false), HOLD_MS + FADE_MS);
    timers.current = [fadeOut, remove];

    return () => {
      cancelAnimationFrame(frame);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [location.pathname]);

  return (
    <>
      {children}
      {active ? (
        <div
          className={`page-transit ${on ? "on" : ""}`}
          aria-hidden={!on}
          aria-busy={on}
        >
          <div className="page-transit-inner">
            <Logo size={48} />
            <div className="page-transit-bar" />
          </div>
        </div>
      ) : null}
    </>
  );
}
