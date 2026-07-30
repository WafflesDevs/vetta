import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicNav, { PublicFooter } from "../components/PublicNav";
import { PLANS_FALLBACK } from "../plansFallback";

/** Career system lanes — only real product surfaces. */
const SYSTEM_LANES = [
  {
    id: "find",
    phase: "Find",
    title: "Live job hub",
    outcome: "Roles that match how you search",
    blurb: "Recommended, Liked, Applied — one board.",
    detail:
      "Openings from free providers matched to your roles and locations. Like listings, mark applied, and open the source without losing your place.",
    preview: "jobs",
  },
  {
    id: "score",
    phase: "Score",
    title: "Coach chat",
    outcome: "Know if you should apply before you do",
    blurb: "Advice that points you to the right lane.",
    detail:
      "Streaming coaching for fit reads, rewrite strategy, and interview angles. When it’s time to act, the coach steers you into Job hub, Resume, or Quiz — message limits apply by plan.",
    preview: "chat",
  },
  {
    id: "tailor",
    phase: "Tailor",
    title: "Live PDF resume",
    outcome: "Edits that match what you download",
    blurb: "Watch the real PDF rewrite as you tailor.",
    detail:
      "Free includes resume upload for matching and coaching context. The live multi-page PDF studio unlocks on CareerExpert and CareerPro so on-screen edits match the file you export.",
    preview: "resume",
  },
  {
    id: "practice",
    phase: "Practice",
    title: "Interview quiz",
    outcome: "Walk in warm, not guessing",
    blurb: "MCQ drills grounded in your resume and goals.",
    detail:
      "A separate practice lane so drills do not clog chat. Generate a fresh set when you want another round — limits apply by plan.",
    preview: "quiz",
  },
];

const IDLE_MS = 5200;

function PreviewChat() {
  const [phase, setPhase] = useState(0);
  const statuses = ["Thinking...", "Reading your materials...", "Coaching..."];
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 4), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fake-ui fake-chat fake-ui-lg">
      <div className="fake-bubble you">
        Should I apply to this Staff Engineer role?
      </div>
      {phase < 3 ? (
        <div className="fake-bubble ai status">{statuses[phase]}</div>
      ) : (
        <div className="fake-bubble ai">
          Fit around <strong>78%</strong> — strong systems depth. Save it in Job hub, or open Resume to tighten leadership bullets before you apply.
          <span className="stream-cursor" />
        </div>
      )}
      <div className="fake-compose">Ask for advice — then jump to Hub, Resume, or Quiz…</div>
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
    <div className="fake-ui fake-jobs fake-ui-lg">
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
          <div className="fake-fit-pill">Fit preview · 78%</div>
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
    <div className="fake-ui fake-quiz fake-ui-lg">
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

const RESUME_CHIPS = [
  "Tighten the summary",
  "Emphasize measurable impact",
  "Expand to two pages",
];

function PreviewResume() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1100);
    return () => clearInterval(id);
  }, []);
  const summary =
    tick % 2 === 0
      ? "Product engineer shipping career tools with clear, measurable impact."
      : "Backend-leaning engineer focused on clarity, systems depth, and shipping.";
  return (
    <div className="fake-ui fake-resume fake-ui-lg fake-resume-studio">
      <div className="fake-resume-split">
        <div className="fake-resume-coach">
          <div className="fake-resume-log">
            <div className="fake-bubble you">
              Expand experience into two pages with stronger bullets
            </div>
            <div className="fake-bubble ai">
              Rewrote impact lines and stretched the layout across two pages. Scroll the preview to review.
            </div>
            {tick % 3 === 0 ? (
              <div className="fake-bubble ai status">Writing into the PDF…</div>
            ) : null}
          </div>
          <div className="fake-resume-chips" aria-hidden>
            {RESUME_CHIPS.map((c, i) => (
              <span key={c} className={`fake-chip ${i === tick % RESUME_CHIPS.length ? "on" : ""}`}>
                {c}
              </span>
            ))}
          </div>
          <div className="fake-compose">What should change on the PDF?</div>
        </div>

        <div className="fake-resume-stage">
          <div className="fake-resume-stage-label">Exact PDF preview · scroll for more pages</div>
          <div className="fake-resume-paper">
            <div className="fake-pdf-status">Writing into the PDF…</div>
            <div className="fake-pdf-sheet">
              <p className="name">Alex Rivera</p>
              <p className="muted">alex@email.com · Remote</p>
              <p className="sec">SUMMARY</p>
              <p>
                {summary}
                <span className="stream-cursor" />
              </p>
              <p className="sec">EXPERIENCE</p>
              <p>
                <strong>Engineer</strong> — Vetta · 2024–Present
              </p>
              <p>• Live multi-page PDF resume editor</p>
              <p>• Coach-driven rewrites that match the download</p>
              <p className="sec">PROJECTS</p>
              <p>Career hub · Quiz · Coach</p>
              <div className="fake-page-num">1</div>
            </div>
            <div className="fake-pdf-sheet dim" aria-hidden>
              <p className="sec">SKILLS</p>
              <p>Systems · Product · Interview prep</p>
              <p className="sec">EDUCATION</p>
              <p>
                <strong>B.S. Computer Science</strong> — State University
              </p>
              <div className="fake-page-num">2</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPlans() {
  const [hi, setHi] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setHi((h) => (h + 1) % 3), 1600);
    return () => clearInterval(id);
  }, []);
  const plans = PLANS_FALLBACK.plans;
  return (
    <div className="fake-ui fake-plans fake-ui-lg">
      {plans.map((p, i) => (
        <div key={p.id} className={`fake-plan-card ${i === hi ? "on" : ""}`}>
          <span className="tag">{p.badge || (i === 2 ? "Full" : "Plan")}</span>
          <strong>{p.name}</strong>
          <em>
            {p.price}
            {p.price_period || ""}
          </em>
          <ul className="fake-plan-features">
            {(p.features || []).slice(0, 3).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const PREVIEWS = {
  chat: PreviewChat,
  jobs: PreviewJobs,
  quiz: PreviewQuiz,
  resume: PreviewResume,
  plans: PreviewPlans,
};

export default function FeaturesPage({ user }) {
  const [activeId, setActiveId] = useState(SYSTEM_LANES[0].id);
  const [paused, setPaused] = useState(false);
  const hoverLock = useRef(false);

  const active = SYSTEM_LANES.find((f) => f.id === activeId) || SYSTEM_LANES[0];
  const Preview = PREVIEWS[active.preview] || PreviewJobs;
  const activeIndex = SYSTEM_LANES.findIndex((f) => f.id === activeId);

  function selectLane(id) {
    setActiveId(id);
  }

  useEffect(() => {
    if (paused || hoverLock.current) return undefined;
    const id = setInterval(() => {
      setActiveId((cur) => {
        const i = SYSTEM_LANES.findIndex((l) => l.id === cur);
        return SYSTEM_LANES[(i + 1) % SYSTEM_LANES.length].id;
      });
    }, IDLE_MS);
    return () => clearInterval(id);
  }, [paused, activeId]);

  return (
    <div className="page-public feat-page">
      <PublicNav user={user} />

      <section className="section feat-hero feat-hero-roomy">
        <p className="brand-mark rise">Vetta</p>
        <p className="section-kicker rise rise-d1">Career system</p>
        <h1 className="feat-title rise rise-d1">
          Find → Score → Tailor → Practice —{" "}
          <span className="feat-swap">one loop</span>, not a pile of AI tabs.
        </h1>
        <p className="section-lead rise rise-d2">
          Hover a lane. The preview plays like the product. Four connected tools that move a search forward.
        </p>
        <div className="hero-actions rise rise-d3" style={{ marginTop: "1.75rem" }}>
          <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
            {user ? "Open Vetta" : "Start free"}
          </Link>
          <Link className="btn btn-ghost" to="/pricing">
            Compare plans
          </Link>
        </div>
      </section>

      <section
        className="section feat-theater-wrap"
        onMouseEnter={() => {
          hoverLock.current = true;
          setPaused(true);
        }}
        onMouseLeave={() => {
          hoverLock.current = false;
          setPaused(false);
        }}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
        }}
      >
        <div className="feat-lane-rail" role="tablist" aria-label="Career workflow">
          {SYSTEM_LANES.map((lane, i) => {
            const on = lane.id === activeId;
            return (
              <button
                key={lane.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={`feat-lane-chip ${on ? "active" : ""}`}
                onMouseEnter={() => selectLane(lane.id)}
                onFocus={() => selectLane(lane.id)}
                onClick={() => selectLane(lane.id)}
              >
                <span className="feat-lane-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="feat-lane-phase">{lane.phase}</span>
                <strong>{lane.title}</strong>
                <span className="feat-lane-blurb">{lane.blurb}</span>
              </button>
            );
          })}
        </div>

        <div className="feat-theater" key={active.id}>
          <div className="feat-theater-copy">
            <p className="feat-panel-kicker">{active.phase}</p>
            <h2>{active.title}</h2>
            <p className="feat-outcome">{active.outcome}</p>
            <p className="feat-panel-detail">{active.detail}</p>
            <div className="feat-progress" aria-hidden>
              {SYSTEM_LANES.map((l, i) => (
                <span key={l.id} className={i === activeIndex ? "on" : ""} />
              ))}
            </div>
          </div>
          <div className="feat-theater-stage">
            <div className="feat-preview feat-preview-live feat-preview-xl">
              <div className="feat-preview-head">
                Live preview · {active.phase}
                <span className="feat-live-dot" aria-hidden />
              </div>
              <Preview />
            </div>
          </div>
        </div>
      </section>

      <section className="section feat-plans-band">
        <div className="feat-plans-intro">
          <p className="section-kicker">Plans</p>
          <h2>Same loop. Deeper limits.</h2>
          <p className="section-lead">
            Free teaches the loop. Expert unlocks the live PDF studio and higher coaching headroom.
            Pro is for an active search — highest caps, priority matching, and early access as new tools ship.
          </p>
        </div>
        <div className="feat-plans-preview">
          <PreviewPlans />
        </div>
        <div className="hero-actions" style={{ marginTop: "1.75rem" }}>
          <Link className="btn btn-ghost" to="/pricing">
            See Free vs Expert vs Pro
          </Link>
        </div>
      </section>

      <section className="section cta-band">
        <div className="cta-band-inner">
          <h2>Run the system on your search.</h2>
          <p className="section-lead" style={{ margin: "0 auto 1.5rem", textAlign: "center" }}>
            Free gets you into the loop. Expert and Pro raise limits and unlock live PDF editing.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
              {user ? "Open Vetta" : "Get started free"}
            </Link>
            <Link className="btn btn-ghost" to="/pricing">
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
