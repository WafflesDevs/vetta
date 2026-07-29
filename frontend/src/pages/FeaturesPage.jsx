import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PublicNav, { PublicFooter } from "../components/PublicNav";

const FEATURES = [
  {
    id: "overview",
    tag: "Overview",
    title: "Dashboard home",
    blurb: "Jump into Chat, Jobs, Quiz, and Resume from one place.",
    detail:
      "Your signed-in home. Free plan chip, quick lanes into every tool, and the same profile that powers the rest of Vetta.",
  },
  {
    id: "chat",
    tag: "Chat",
    title: "Coach chat",
    blurb: "Streaming coaching for fit, rewrites, and cover letters.",
    detail:
      "Two chats, thirty messages each. Status lines cycle Thinking, Querying, Generating while tools search and score in the background.",
  },
  {
    id: "jobs",
    tag: "Jobs",
    title: "Live job hub",
    blurb: "Recommended, Liked, Applied, External in one board.",
    detail:
      "Jobs from free providers matched to your roles and locations. Like, mark applied, and open listings without losing your place.",
  },
  {
    id: "quiz",
    tag: "Interview Quiz",
    title: "Interview quiz",
    blurb: "MCQ drills grounded in your resume and goals.",
    detail:
      "A separate practice mode so drills do not clog chat. Generate a fresh set when you want another round.",
  },
  {
    id: "resume",
    tag: "Resume",
    title: "Live PDF resume",
    blurb: "Ask for changes and watch the real PDF rewrite.",
    detail:
      "Multi-page resume preview that matches download. Undo versions, replace the source file, and export when it looks right.",
  },
  {
    id: "settings",
    tag: "Settings",
    title: "Settings",
    blurb: "Roles, locations, goals, and resume file.",
    detail:
      "Keep the profile the hub and quiz read. Upload or replace a PDF/DOCX and steer recommendations without repeating yourself.",
  },
  {
    id: "plans",
    tag: "Plans",
    title: "Plans",
    blurb: "CareerFinder, CareerExpert, CareerPro.",
    detail:
      "Upgrade path when you are ready. Free tier covers the core loop while paid tiers are marked TBA.",
  },
];

const HELPS = [
  "Find roles that fit",
  "Tailor your resume live",
  "Practice interviews",
  "Track what you applied to",
  "Score fit before you apply",
  "Write a cover letter fast",
];

function PreviewOverview() {
  const tiles = [
    { tag: "Coach", title: "Chat", meta: "Score fit · rewrite" },
    { tag: "Jobs", title: "Jobs", meta: "Recommended for you" },
    { tag: "Drill", title: "Quiz", meta: "MCQ rounds" },
    { tag: "Live", title: "Resume", meta: "PDF rewrite" },
  ];
  return (
    <div className="fake-ui fake-overview">
      <div className="fake-top">
        <span className="fake-plan">Free</span>
        <span className="fake-user">alex@vetta.dev</span>
      </div>
      <div className="fake-grid">
        {tiles.map((t) => (
          <div key={t.title} className="fake-tile">
            <span className="tag">{t.tag}</span>
            <strong>{t.title}</strong>
            <span className="meta">{t.meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewChat() {
  const [phase, setPhase] = useState(0);
  const statuses = ["Thinking...", "Querying...", "Generating..."];
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 4), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fake-ui fake-chat">
      <div className="fake-bubble you">
        What percentage of AI engineering jobs are remote right now?
      </div>
      {phase < 3 ? (
        <div className="fake-bubble ai status">{statuses[phase]}</div>
      ) : (
        <div className="fake-bubble ai">
          Roughly <strong>38–45%</strong> of AI / ML engineer listings are remote or hybrid
          in recent US searches. Pure remote sits near the low end; hybrid pushes the range up.
          <span className="stream-cursor" />
        </div>
      )}
      <div className="fake-compose">Ask anything about jobs or resumes…</div>
    </div>
  );
}

function PreviewJobs() {
  const [tab, setTab] = useState(0);
  const tabs = [
    { name: "Recommended", count: 25 },
    { name: "Liked", count: 6 },
    { name: "Applied", count: 3 },
  ];
  const rows = [
    ["Staff Engineer", "Notion · Remote"],
    ["Product Designer", "Linear · NYC"],
    ["Data Analyst", "Stripe · Austin"],
  ];
  useEffect(() => {
    const id = setInterval(() => setTab((t) => (t + 1) % tabs.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fake-ui fake-jobs">
      <div className="fake-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.name}
            type="button"
            className={i === tab ? "on" : ""}
            onClick={() => setTab(i)}
          >
            {t.name} <em>{t.count}</em>
          </button>
        ))}
      </div>
      <div className="fake-jobs-split">
        <div className="fake-job-list">
          {rows.map((r, i) => (
            <div key={r[0]} className={`fake-job-row ${i === 0 ? "active" : ""}`}>
              <strong>{r[0]}</strong>
              <span>{r[1]}</span>
            </div>
          ))}
        </div>
        <div className="fake-job-detail">
          <strong>Staff Engineer</strong>
          <p>Build the careers graph. Like · Mark applied · Open</p>
        </div>
      </div>
    </div>
  );
}

function PreviewQuiz() {
  const [picked, setPicked] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setPicked((p) => (p + 1) % 4), 1400);
    return () => clearInterval(id);
  }, []);
  const opts = [
    "Named a tool I used",
    "Showed business impact with a number",
    "Said I work hard",
    "Listed every responsibility",
  ];
  return (
    <div className="fake-ui fake-quiz">
      <div className="fake-quiz-meta">Q2 · Behavioral · Round fresh</div>
      <h4>Which answer shows impact best?</h4>
      <div className="fake-opts">
        {opts.map((o, i) => (
          <button key={o} type="button" className={i === picked ? "on" : ""} onClick={() => setPicked(i)}>
            <span>{String.fromCharCode(65 + i)}</span>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewResume() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 900);
    return () => clearInterval(id);
  }, []);
  const lines = [
    "Alex Rivera",
    "alex@email.com · Remote",
    "SUMMARY",
    tick % 2 === 0
      ? "Product engineer shipping career tools…"
      : "Backend-leaning engineer focused on clarity…",
    "EXPERIENCE",
    "Vetta — Engineer · 2024–Present",
    "- Live multi-page PDF resume editor",
  ];
  return (
    <div className="fake-ui fake-resume">
      <div className="fake-pdf-pages">
        <div className="fake-pdf-page">
          {lines.map((line, i) => (
            <p
              key={`${line}-${i}`}
              className={
                i === 0
                  ? "name"
                  : line === line.toUpperCase() && line.length < 20
                    ? "sec"
                    : ""
              }
            >
              {line}
              {i === 3 ? <span className="stream-cursor" /> : null}
            </p>
          ))}
          <div className="fake-page-num">1</div>
        </div>
        <div className="fake-pdf-page dim">
          <p className="sec">PROJECTS</p>
          <p>Career hub · Quiz · Coach</p>
          <div className="fake-page-num">2</div>
        </div>
      </div>
      <div className="fake-resume-bar">Writing into the PDF… · Download ready</div>
    </div>
  );
}

function PreviewSettings() {
  return (
    <div className="fake-ui fake-settings">
      <label>
        Target roles
        <div className="fake-field">product manager, backend engineer</div>
      </label>
      <label>
        Locations
        <div className="fake-field">Remote, Seattle</div>
      </label>
      <label>
        Resume
        <div className="fake-resume-file">
          <span>alex-resume.pdf</span>
          <em>Replace</em>
        </div>
      </label>
    </div>
  );
}

function PreviewPlans() {
  const [hi, setHi] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setHi((h) => (h + 1) % 3), 1600);
    return () => clearInterval(id);
  }, []);
  const plans = [
    { name: "CareerFinder", price: "TBA" },
    { name: "CareerExpert", price: "TBA" },
    { name: "CareerPro", price: "TBA" },
  ];
  return (
    <div className="fake-ui fake-plans">
      {plans.map((p, i) => (
        <div key={p.name} className={`fake-plan-card ${i === hi ? "on" : ""}`}>
          <span className="tag">{i === 0 ? "Start" : i === 1 ? "Grow" : "Pro"}</span>
          <strong>{p.name}</strong>
          <em>{p.price}</em>
        </div>
      ))}
    </div>
  );
}

const PREVIEWS = {
  overview: PreviewOverview,
  chat: PreviewChat,
  jobs: PreviewJobs,
  quiz: PreviewQuiz,
  resume: PreviewResume,
  settings: PreviewSettings,
  plans: PreviewPlans,
};

export default function FeaturesPage({ user }) {
  const [activeId, setActiveId] = useState(FEATURES[0].id);
  const [helpIndex, setHelpIndex] = useState(0);

  const active = useMemo(
    () => FEATURES.find((f) => f.id === activeId) || FEATURES[0],
    [activeId]
  );
  const Preview = PREVIEWS[active.id] || PreviewOverview;

  return (
    <div>
      <PublicNav user={user} />

      <section className="section feat-hero" style={{ borderTop: 0, paddingTop: "3rem" }}>
        <p className="section-kicker">Features</p>
        <h2 className="feat-title">
          Everything in your{" "}
          <span className="feat-swap">dashboard</span>, shown live.
        </h2>
        <p className="section-lead">
          Hover a section. The fake preview on the right plays like the real product.
        </p>
      </section>

      <section className="section feat-explorer-wrap">
        <div className="feat-explorer">
          <div className="feat-list" role="list">
            {FEATURES.map((f) => {
              const on = f.id === activeId;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="listitem"
                  className={`feat-row ${on ? "active" : ""}`}
                  onMouseEnter={() => setActiveId(f.id)}
                  onFocus={() => setActiveId(f.id)}
                  onClick={() => setActiveId(f.id)}
                >
                  <span className="feat-row-tag">{f.tag}</span>
                  <span className="feat-row-title">{f.title}</span>
                  <span className="feat-row-blurb">{f.blurb}</span>
                </button>
              );
            })}
          </div>

          <aside className="feat-panel" key={active.id}>
            <p className="feat-panel-kicker">{active.tag}</p>
            <h3>{active.title}</h3>
            <p className="feat-panel-detail">{active.detail}</p>
            <div className="feat-preview feat-preview-live">
              <div className="feat-preview-head">
                Live preview · {active.tag}
              </div>
              <Preview />
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <p className="section-kicker">Help</p>
        <h2>What Vetta can help with.</h2>
        <p className="section-lead">Click a line. Watch it lock in.</p>
        <div className="feat-help-board">
          {HELPS.map((label, i) => (
            <button
              key={label}
              type="button"
              className={`feat-help-chip ${i === helpIndex ? "active" : ""}`}
              onMouseEnter={() => setHelpIndex(i)}
              onClick={() => setHelpIndex(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="feat-help-echo" key={helpIndex}>
          {HELPS[helpIndex]}.
        </p>
        <div style={{ marginTop: "2.5rem" }}>
          <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
            {user ? "Open dashboard" : "Get started free"}
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
