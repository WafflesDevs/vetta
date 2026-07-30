import { Link } from "react-router-dom";
import Logo from "../../Logo";

const LANES = [
  {
    to: "/app/hub",
    phase: "Find",
    title: "Jobs",
    meta: (profile) =>
      profile?.target_roles
        ? `Recommended for: ${profile.target_roles}`
        : "Recommended · Liked · Applied · External",
  },
  {
    to: "/app/chat",
    phase: "Score",
    title: "Chat",
    meta: () => "Fit scores · rewrites · cover letters",
  },
  {
    to: "/app/resume",
    phase: "Tailor",
    title: "Resume",
    meta: () => "Live PDF editor · locked on Free",
  },
  {
    to: "/app/quiz",
    phase: "Practice",
    title: "Interview Quiz",
    meta: () => "MCQ rounds from your goals",
  },
];

export default function OverviewPage({ profile }) {
  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Your career loop</h1>
          <p>Find → score → tailor → practice. Everything syncs to your resume and preferences.</p>
        </div>
        <Logo size={36} onDark />
      </div>

      <div className="overview-loop" aria-hidden>
        <span>Find</span>
        <span className="overview-loop-sep" />
        <span>Score</span>
        <span className="overview-loop-sep" />
        <span>Tailor</span>
        <span className="overview-loop-sep" />
        <span>Practice</span>
      </div>

 <div className="grid-3 overview-lanes">
        {LANES.map((lane) => (
          <Link key={lane.to} to={lane.to} className="stat-tile">
            <span className="tag">{lane.phase}</span>
            <h3 style={{ fontFamily: "var(--display)", margin: "0.7rem 0 0.3rem" }}>{lane.title}</h3>
            <p className="meta">{lane.meta(profile)}</p>
          </Link>
        ))}
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <p className="meta" style={{ margin: 0 }}>
          Free tier · 1 chat · 60 messages · hub limits · light quiz · Resume upload in Settings · Live PDF on Expert+
        </p>
      </div>
    </div>
  );
}
