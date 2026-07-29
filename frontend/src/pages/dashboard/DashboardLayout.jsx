import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Logo from "../../Logo";
import OnboardingModal, { needsOnboarding } from "../../components/OnboardingModal";
import { prefetchJobs } from "../../jobsCache";

function Icon({ children }) {
  return (
    <svg
      className="nav-ico"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONS = {
  overview: (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  chat: (
    <Icon>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />
    </Icon>
  ),
  jobs: (
    <Icon>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M2 13h20" />
    </Icon>
  ),
  quiz: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
      <path d="M12 17.5h.01" />
    </Icon>
  ),
  resume: (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  plans: (
    <Icon>
      <path d="M12 2l2.4 7.2H22l-6 4.4 2.3 7.1L12 16.8 5.7 20.7 8 13.6 2 9.2h7.6z" />
    </Icon>
  ),
};

const LINKS = [
  { to: "/app", end: true, label: "Overview", icon: ICONS.overview },
  { to: "/app/chat", label: "Chat", icon: ICONS.chat },
  { to: "/app/hub", label: "Jobs", icon: ICONS.jobs },
  { to: "/app/quiz", label: "Interview Quiz", icon: ICONS.quiz },
  { to: "/app/resume", label: "Resume", icon: ICONS.resume },
  { to: "/app/settings", label: "Settings", icon: ICONS.settings },
  { to: "/pricing", label: "Plans", icon: ICONS.plans },
];

export default function DashboardLayout({ user, profile, onLogout, onProfile }) {
  const name = profile?.display_name || user?.email || "you";
  const [onboardingOpen, setOnboardingOpen] = useState(() => needsOnboarding(profile));

  useEffect(() => {
    if (needsOnboarding(profile)) setOnboardingOpen(true);
  }, [profile]);

  useEffect(() => {
    if (onboardingOpen) return;
    if (!(profile?.target_roles || "").trim()) return;
    prefetchJobs(profile)?.catch(() => {});
  }, [profile?.target_roles, profile?.locations, onboardingOpen]);

  return (
    <div className="dash">
      {onboardingOpen && (
        <OnboardingModal
          profile={profile}
          onDone={(nextProfile, finished) => {
            if (nextProfile) onProfile?.(nextProfile);
            if (finished) {
              setOnboardingOpen(false);
              if ((nextProfile?.target_roles || profile?.target_roles || "").trim()) {
                prefetchJobs(nextProfile || profile)?.catch(() => {});
              }
            }
          }}
        />
      )}

      <aside className="dash-side">
        <Link to="/" className="brand brand-icon" aria-label="Vetta home">
          <Logo size={28} />
        </Link>
        <nav className="dash-nav">
          {LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="dash-foot">
          <div className="dash-user">
            <Link to="/pricing" className="plan-chip" title="Current plan">
              Free
            </Link>
            <div className="dash-user-meta">
              Signed in as
              <br />
              <strong style={{ color: "var(--white)" }}>{name}</strong>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="dash-main">
        <Outlet />
      </main>
    </div>
  );
}
