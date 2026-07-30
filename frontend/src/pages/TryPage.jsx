import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, readResponseJson } from "../api";
import PublicNav, { PublicFooter } from "../components/PublicNav";
import Logo from "../Logo";

const STEPS = ["Role", "Quiz", "Resume", "Results"];

const FALLBACK_ROLES = [
  { id: "software_engineer", label: "Software Engineer" },
  { id: "product_manager", label: "Product Manager" },
  { id: "data", label: "Data / Analytics" },
  { id: "design", label: "Design" },
  { id: "marketing", label: "Marketing" },
  { id: "sales", label: "Sales" },
  { id: "customer_success", label: "Customer Success" },
  { id: "finance", label: "Finance / Accounting" },
  { id: "operations", label: "Operations" },
  { id: "hr_recruiting", label: "HR / Recruiting" },
  { id: "devops", label: "DevOps / SRE" },
  { id: "cybersecurity", label: "Cybersecurity" },
  { id: "content", label: "Content / Writing" },
  { id: "nursing_healthcare", label: "Nursing / Healthcare" },
  { id: "teaching_education", label: "Teaching / Education" },
  { id: "general", label: "General / Exploring" },
];

const CAP_HINT = {
  quiz: "Interview quiz",
  resume: "PDF resume editor",
  coach: "Coach chat",
  hub: "Job hub",
};

async function publicPost(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...options, headers });
  const data = await readResponseJson(res);
  if (!res.ok) throw new Error(formatApiError(res, data));
  return data;
}

function clampPct(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function StatBar({ label, value, tone = "now", delay = 0 }) {
  const pct = clampPct(value);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setWidth(Math.max(6, pct)), delay + 40);
    return () => window.clearTimeout(id);
  }, [pct, delay]);

  return (
    <div className={`try-stat try-stat-${tone}`}>
      <div className="try-stat-top">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <div className="try-stat-track" aria-hidden>
        <div className="try-stat-fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MatchRing({ value, size = 96, tone = "lift", label }) {
  const pct = clampPct(value);
  return (
    <div
      className={`try-ring try-ring-${tone}`}
      style={{ width: size, height: size, "--try-pct": pct }}
    >
      <div className="try-ring-visual" aria-hidden="true" />
      <div className="try-ring-core">
        <strong>{pct}%</strong>
        {label ? <span>{label}</span> : null}
      </div>
    </div>
  );
}

function CompareMetric({ label, before, after }) {
  const delta = clampPct(after) - clampPct(before);
  return (
    <div className="try-compare-metric">
      <div className="try-compare-label">{label}</div>
      <div className="try-compare-row">
        <MatchRing value={before} tone="now" label="Now" size={108} />
        <div className="try-compare-arrow" aria-hidden>
          <span>→</span>
          {delta > 0 ? <em>+{delta}</em> : null}
        </div>
        <MatchRing value={after} tone="lift" label="With Vetta" size={108} />
      </div>
      <StatBar label="Now" value={before} tone="now" />
      <StatBar label="With Vetta" value={after} tone="lift" delay={120} />
    </div>
  );
}

export default function TryPage({ user }) {
  const [step, setStep] = useState(0);
  const [roles, setRoles] = useState(FALLBACK_ROLES);
  const [role, setRole] = useState("software_engineer");
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/api/public/try/roles")
      .then((data) => {
        if (cancelled) return;
        const next = data.roles || [];
        if (next.length) setRoles(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function startQuiz() {
    setBusy(true);
    setError("");
    setQuestions([]);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setResults(null);
    try {
      const data = await publicPost("/api/public/try/quiz", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      const next = data.questions || [];
      if (!next.length) throw new Error("No questions available. Try another role.");
      setQuestions(next);
      if (data.role) setRole(data.role);
      setStep(1);
    } catch (err) {
      setError(err.message || "Could not start quiz.");
    } finally {
      setBusy(false);
    }
  }

  function choose(i) {
    if (picked !== null) return;
    setPicked(i);
    if (i === questions[index].correct_index) setScore((s) => s + 1);
  }

  function nextQuestion() {
    if (index + 1 >= questions.length) {
      setStep(2);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
  }

  async function submitResults({ skipResume = false } = {}) {
    setBusy(true);
    setError("");
    try {
      let data;
      if (!skipResume && resumeFile) {
        const form = new FormData();
        form.append("role", role);
        form.append("quiz_correct", String(score));
        form.append("quiz_total", String(questions.length || 1));
        if (resumeText.trim()) form.append("resume_text", resumeText.trim());
        form.append("resume", resumeFile);
        data = await publicPost("/api/public/try/results", { method: "POST", body: form });
      } else {
        data = await publicPost("/api/public/try/results", {
          method: "POST",
          body: JSON.stringify({
            role,
            quiz_correct: score,
            quiz_total: questions.length || 1,
            resume_text: skipResume ? "" : resumeText.trim(),
          }),
        });
      }
      setResults(data);
      setStep(3);
    } catch (err) {
      setError(err.message || "Could not score results.");
    } finally {
      setBusy(false);
    }
  }

  function resetFunnel() {
    setStep(0);
    setQuestions([]);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setResumeText("");
    setResumeFile(null);
    setResults(null);
    setError("");
  }

  const q = questions[index];
  const ctaTo = user ? "/app" : "/signup";
  const ctaLabel = user ? "Open dashboard" : "Create free account";

  return (
    <div className="page-public try-page">
      <PublicNav user={user} />

      <main className={`try-main${step === 3 ? " try-main-results" : ""}`}>
        <div className="try-hero rise">
          <p className="section-kicker">Free demo · no signup</p>
          <h1>See what Vetta would sharpen</h1>
          <p className="try-lead">
            A short interview drill, optional resume check, then an illustrative before/after —
            bait for the real loop inside Vetta.
          </p>
        </div>

        <ol className="try-steps rise rise-d1" aria-label="Funnel steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
              <span className="try-step-num">{i + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>

        {error && <div className="alert alert-error try-alert">{error}</div>}

        {step === 0 && (
          <section className="try-panel rise rise-d2">
            <h2>Pick a target role</h2>
            <p className="meta">
              Questions come from a curated bank of common big-company interview angles — no AI
              generation on this free path.
            </p>
            <div className="try-roles">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`try-role ${role === r.id ? "active" : ""}`}
                  onClick={() => setRole(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button className="btn btn-solid" onClick={startQuiz} disabled={busy}>
              {busy ? "Loading…" : "Start quiz"}
            </button>
          </section>
        )}

        {step === 1 && busy && (
          <section className="try-panel try-center">
            <Logo size={48} />
            <p className="meta">Loading interview questions…</p>
          </section>
        )}

        {step === 1 && q && !busy && (
          <section className="try-panel rise">
            <div className="meta">
              Question {index + 1} / {questions.length}
            </div>
            <h2 className="try-q">{q.question}</h2>
            {q.options.map((opt, i) => {
              let cls = "option";
              if (picked !== null) {
                if (i === q.correct_index) cls += " correct";
                else if (i === picked) cls += " wrong";
              }
              return (
                <button key={i} type="button" className={cls} onClick={() => choose(i)} disabled={picked !== null}>
                  {opt}
                </button>
              );
            })}
            {picked !== null && (
              <div className="try-explain">
                <p className="meta">{q.explanation}</p>
                <button className="btn btn-ghost" type="button" onClick={nextQuestion}>
                  {index + 1 >= questions.length ? "Continue" : "Next"}
                </button>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="try-panel rise">
            <h2>Optional resume check</h2>
            <p className="meta">
              Paste text or upload a PDF/DOCX. We score with cheap heuristics only — no LLM on this
              public path.
            </p>
            <label className="try-file">
              <span>Upload PDF or DOCX</span>
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
              {resumeFile && <em className="meta">{resumeFile.name}</em>}
            </label>
            <textarea
              className="try-paste"
              rows={8}
              placeholder="Or paste resume text here…"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
            <div className="try-actions">
              <button
                className="btn btn-solid"
                type="button"
                disabled={busy || (!resumeText.trim() && !resumeFile)}
                onClick={() => submitResults()}
              >
                {busy ? "Scoring…" : "Check resume + see results"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => submitResults({ skipResume: true })}
              >
                Skip resume
              </button>
            </div>
            <p className="meta try-score-hint">
              Quiz so far: {score} / {questions.length} correct
            </p>
          </section>
        )}

        {step === 3 && results && (
          <section className="try-results rise">
            <div className="try-results-hero try-panel try-panel-glow">
              <p className="section-kicker">Your illustrative lift</p>
              <h2>Before → after with Vetta</h2>
              <p className="meta try-disclaimer">{results.with_vetta.framing}</p>

              <div className="try-compare-grid">
                <CompareMetric
                  label="Interview quiz readiness"
                  before={results.current.quiz_pct}
                  after={results.with_vetta.quiz_pct}
                />
                <CompareMetric
                  label="Acceptance readiness"
                  before={results.current.readiness_pct}
                  after={results.with_vetta.readiness_pct}
                />
              </div>

              {results.resume?.provided && results.current.resume_score != null && (
                <div className="try-resume-signal">
                  <StatBar
                    label="Resume signal (heuristic)"
                    value={results.current.resume_score}
                    tone="now"
                  />
                </div>
              )}
            </div>

            <div className="try-panel">
              <h2>What Vetta can help with</h2>
              <p className="meta">Mapped to real product capabilities — this is the demo bait.</p>
              <ul className="try-fixes">
                {(results.fixes || []).map((f) => (
                  <li key={f.text}>
                    <span>{f.text}</span>
                    <em>{f.capability || CAP_HINT[f.maps_to] || "Vetta"}</em>
                  </li>
                ))}
              </ul>
            </div>

            <div className="try-cta-band">
              <div>
                <p className="section-kicker">Next step</p>
                <h2>Vetta can help with this</h2>
                <p className="meta">
                  Turn this snapshot into a real loop: job hub → resume tailor → coach → unlimited
                  practice. Free to start.
                </p>
              </div>
              <div className="try-actions">
                <Link className="btn btn-solid try-cta-primary" to={ctaTo}>
                  {ctaLabel}
                </Link>
                <button className="btn btn-ghost" type="button" onClick={resetFunnel}>
                  Retake demo
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
