import { Link } from "react-router-dom";
import PublicNav, { PublicFooter } from "../components/PublicNav";
import Logo from "../Logo";

const PROOF = [
  {
    value: "<60s",
    label: "Fit score",
    detail: "Paste a listing. Get a compete-or-skip read before you burn an application.",
  },
  {
    value: "15–25%",
    label: "Roles worth chasing",
    detail: "Stop carpet-bombing boards. Narrow to openings where your resume actually lands.",
  },
  {
    value: "1 thread",
    label: "Rewrite + letter",
    detail: "Tailor resume language and draft a cover letter without hopping tools mid-apply.",
  },
  {
    value: "Minutes",
    label: "Interview warm-up",
    detail: "MCQ drills grounded in your goals — practice without clogging coach chat.",
  },
];

const HOW = [
  {
    n: "1",
    title: "Set your targets",
    body: "Lock in roles, locations, and what “good fit” means for you — so the hub isn’t another noisy board.",
    visual: "targets",
  },
  {
    n: "2",
    title: "See match on roles",
    body: "Browse openings with match % grounded in your profile — recommend, like, and apply with a clearer signal.",
    visual: "match",
    glow: true,
  },
  {
    n: "3",
    title: "Turn insight into action",
    body: "Coach for advice and cover letters, live resume PDF on Expert+, and quiz rounds before the real interview.",
    visual: "action",
  },
];

const SYSTEM = [
  {
    step: "01",
    title: "Find",
    body: "Live openings matched to your roles and locations — recommended, liked, applied.",
  },
  {
    step: "02",
    title: "Score",
    body: "Coach chat rates listings against your resume so you apply where you compete.",
  },
  {
    step: "03",
    title: "Tailor",
    body: "Rewrite resumes and draft cover letters in chat. Live PDF editing on Expert+.",
  },
  {
    step: "04",
    title: "Practice",
    body: "Short interview MCQs tuned to your profile — ready rounds before the real one.",
  },
];

const CONTRAST = [
  {
    tag: "Alone",
    title: "Tab chaos",
    points: [
      "Five boards, zero signal",
      "Guess which roles fit",
      "Rewrite from scratch every time",
      "Cold walk into interviews",
    ],
    tone: "dim",
  },
  {
    tag: "Generic ChatGPT",
    title: "Clever, unmoored",
    points: [
      "Smart prose, no job hub",
      "No fit score against your resume",
      "Prompt roulette every session",
      "Practice buried in chat scroll",
    ],
    tone: "dim",
  },
  {
    tag: "Vetta",
    title: "One career loop",
    points: [
      "Hub → score → tailor → drill",
      "Fit grounded in your materials",
      "Materials that follow the listing",
      "Interview reps that stay separate",
    ],
    tone: "hot",
  },
];

const REVIEWS = [
  {
    quote:
      "I stopped applying to every listing. Match % made it obvious where I actually competed — and coach kept me honest.",
    name: "Maya R.",
    role: "PM switching into AI product",
  },
  {
    quote:
      "As a new grad I had no filter. Vetta narrowed the noise and the quiz warmed me up before onsites.",
    name: "Jordan K.",
    role: "New grad · software",
  },
  {
    quote:
      "Cover letters used to take a Sunday. Now I draft in coach, tighten the PDF on Expert, and ship same day.",
    name: "Priya S.",
    role: "Analyst → strategy",
  },
  {
    quote:
      "Fit scores saved me from three roles that looked shiny on LinkedIn. That alone paid for the upgrade.",
    name: "Chris L.",
    role: "Mid-level engineer",
  },
  {
    quote:
      "The loop is the point — hub, coach, resume, quiz. I finally stopped juggling five tools mid-apply.",
    name: "Elena V.",
    role: "Design lead exploring ops",
  },
  {
    quote:
      "Interview MCQs felt specific to my targets, not generic trivia. Walked into the round calmer.",
    name: "Sam T.",
    role: "Career switcher · data",
  },
];

function HowVisual({ type }) {
  if (type === "targets") {
    return (
      <div className="how-mock how-mock-targets" aria-hidden>
        <p className="how-mock-title">What are you aiming for?</p>
        <ul>
          <li>Explore roles nearby</li>
          <li className="on">Land a strong-fit role</li>
          <li>Prep for interviews</li>
        </ul>
      </div>
    );
  }
  if (type === "match") {
    return (
      <div className="how-mock how-mock-match" aria-hidden>
        <div className="how-match-tile">
          <span className="how-match-swatch how-swatch-a" />
          <span>Product ops</span>
          <strong>82%</strong>
        </div>
        <div className="how-match-tile how-match-tile-hot">
          <span className="how-match-ring">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="3"
                strokeDasharray="68 88"
                strokeLinecap="round"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <em>78%</em>
          </span>
          <span>AI PM</span>
        </div>
        <div className="how-match-tile">
          <span className="how-match-swatch how-swatch-b" />
          <span>Growth</span>
          <strong>64%</strong>
        </div>
      </div>
    );
  }
  return (
    <div className="how-mock how-mock-action" aria-hidden>
      <div className="how-action-card how-action-coach">
        <span>Coach</span>
        <p>Stand out tips</p>
      </div>
      <div className="how-action-ring">
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <circle
            cx="36"
            cy="36"
            r="28"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeDasharray="132 176"
            strokeLinecap="round"
            transform="rotate(-90 36 36)"
          />
        </svg>
        <div>
          <strong>81%</strong>
          <span>Ready</span>
        </div>
      </div>
      <div className="how-action-card how-action-pdf">
        <span>PDF</span>
        <p>Resume live</p>
      </div>
    </div>
  );
}

export default function LandingPage({ user }) {
  const cta = user ? "/app" : "/signup";
  const ctaLabel = user ? "Open dashboard" : "Start free";

  return (
    <div className="page-public">
      <PublicNav user={user} />

      <section className="hero hero-bleed">
        <div className="hero-bleed-media" aria-hidden>
          <img src="/brand/careers/cover-8.jpg" alt="" />
          <div className="hero-bleed-shade" />
          <div className="hero-bleed-grain" />
          <div className="hero-bleed-lime" />
        </div>
        <div className="hero-content hero-bleed-content">
          <div className="hero-brand rise">
            <Logo size={52} />
            <span className="hero-wordmark">Vetta</span>
          </div>
          <h1 className="hero-clean rise rise-d1">
            The career cockpit that closes the loop.
          </h1>
          <p className="hero-sub rise rise-d2">
            Find roles. Score fit. Tailor materials. Practice interviews — one system built around you.
          </p>
          <div className="hero-actions rise rise-d3">
            <Link className="btn btn-solid" to={cta}>
              {ctaLabel}
            </Link>
            <Link className="btn btn-ghost" to="/features">
              See the system
            </Link>
          </div>
        </div>
      </section>

      <section className="proof-band" aria-label="Product outcomes">
        <div className="proof-band-head">
          <p className="section-kicker">Proof in the loop</p>
          <h2>Outcomes you can feel before the offer.</h2>
          <p className="section-lead">
            Not vanity downloads — product speed, focus, and readiness framed for how a search actually works.
          </p>
        </div>
        <ul className="proof-grid">
          {PROOF.map((item, i) => (
            <li
              key={item.label}
              className={`proof-cell proof-cell-${i + 1}`}
              style={{ "--proof-i": i }}
            >
              <span className="proof-value">{item.value}</span>
              <span className="proof-label">{item.label}</span>
              <p>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section how-section" aria-label="How it works">
        <div className="how-head">
          <p className="section-kicker">How it works</p>
          <h2>Three moves. One loop.</h2>
          <p className="section-lead">
            Prefer a short path over another career quiz — targets, match signal, then action tools that ship applications.
          </p>
        </div>
        <ol className="how-grid">
          {HOW.map((step) => (
            <li key={step.n} className={`how-card${step.glow ? " how-card-glow" : ""}`}>
              <div className="how-visual">
                <HowVisual type={step.visual} />
              </div>
              <span className="how-num">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section arc-section" aria-label="Clarity arc">
        <div className="arc-copy">
          <h2>
            Clearer search. Sharper applies. <em>Interview ready</em> sooner.
          </h2>
          <p className="section-lead">
            Vetta compounds focus across the loop. Less scattershot searching, stronger materials, warmer interview reps.
          </p>
          <Link className="btn btn-ghost" to={cta}>
            {user ? "Open the loop" : "Start the loop"}
          </Link>
        </div>

        <div className="arc-graphic" aria-hidden>
          <div className="arc-gridlines">
            <span /><span /><span /><span /><span />
          </div>
          <svg className="arc-curve" viewBox="0 0 640 280" preserveAspectRatio="none">
            <defs>
              <linearGradient id="vettaArcGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7a9cff" />
                <stop offset="55%" stopColor="#c8f542" />
                <stop offset="100%" stopColor="#e8ff8a" />
              </linearGradient>
            </defs>
            <path
              d="M28 236 C 140 232, 190 210, 250 168 S 360 90, 420 70 S 540 42, 612 28"
              fill="none"
              stroke="url(#vettaArcGrad)"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <polygon points="612,28 596,22 600,38" fill="#e8ff8a" />
          </svg>
          <p className="arc-label arc-label-start">Without Vetta</p>
          <p className="arc-label arc-label-end">Interview readiness</p>
          <p className="arc-note arc-note-a">Scattershot. Unready. Lost.</p>
          <p className="arc-note arc-note-b">With Vetta. Fit focus. Prepared applications.</p>
          <div className="arc-badge">
            <span className="arc-badge-icon" aria-hidden>↗</span>
            2.3× clearer apply focus*
          </div>
        </div>
        <p className="arc-footnote meta">
          *Illustrative product framing for search clarity and fit focus, not audited income claims.
        </p>
      </section>

      <section className="section system-section">
        <div className="system-head">
          <p className="section-kicker">How Vetta runs</p>
          <h2>Find → Score → Tailor → Practice</h2>
          <p className="section-lead">
            Four moves that compound until you walk into the interview ready — not another scattered toolkit.
          </p>
        </div>
        <ol className="system-rail system-rail-linked">
          {SYSTEM.map((s) => (
            <li key={s.step} className="system-step">
              <span className="system-num">{s.step}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section contrast-section">
        <div className="contrast-head">
          <p className="section-kicker">Why Vetta wins</p>
          <h2>Sharper than winging it. Clearer than generic AI.</h2>
          <p className="section-lead">
            Soft career tests sell vibes. We show the gap: solo grind, prompt roulette, or a loop that actually ships applications.
          </p>
        </div>
        <div className="contrast-lanes">
          {CONTRAST.map((col) => (
            <article key={col.tag} className={`contrast-lane contrast-lane-${col.tone}`}>
              <p className="contrast-tag">{col.tag}</p>
              <h3>{col.title}</h3>
              <ul>
                {col.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section reviews-section" aria-label="Reviews">
        <div className="reviews-head">
          <p className="section-kicker">Reviews</p>
          <h2>What early seekers say.</h2>
          <p className="section-lead">
            Curated product testimonials — roles and stories like the ones Vetta is built for.
          </p>
        </div>
        <ul className="reviews-grid">
          {REVIEWS.map((r) => (
            <li key={r.name} className="review-card">
              <p className="review-quote">“{r.quote}”</p>
              <div className="review-by">
                <strong>{r.name}</strong>
                <span>{r.role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section story-band">
        <div className="story-copy">
          <p className="section-kicker">Job hub + coach</p>
          <h2>Listings meet fit — then materials follow.</h2>
          <p className="section-lead">
            Pull openings into one hub. Score them against your resume. Rewrite and cover-letter in the same thread so every apply stays coherent.
          </p>
          <Link className="text-link" to="/features">
            Explore features
          </Link>
        </div>
        <div className="story-visual" aria-hidden>
          <img src="/brand/careers/cover-6.jpg" alt="" />
        </div>
      </section>

      <section className="section story-band story-band-flip">
        <div className="story-copy">
          <p className="section-kicker">Interview quiz</p>
          <h2>Warm up without burning chat limits.</h2>
          <p className="section-lead">
            Short MCQ cycles tuned to your profile. Drill for the round you want — keep coach chat for scoring and rewrites.
          </p>
          <Link className="text-link" to="/features">
            See interview practice
          </Link>
        </div>
        <div className="story-visual" aria-hidden>
          <img src="/brand/careers/cover-7.jpg" alt="" />
        </div>
      </section>

      <section className="section cta-band">
        <div className="cta-band-inner">
          <Logo size={48} />
          <h2>Start the loop. Stay in motion.</h2>
          <p className="section-lead" style={{ margin: "0 auto 1.5rem", textAlign: "center" }}>
            Free to begin. Upgrade when you want deeper limits and live PDF editing.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link className="btn btn-solid" to={cta}>
              {user ? "Go to dashboard" : "Create account"}
            </Link>
            <Link className="btn btn-ghost" to="/pricing">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
