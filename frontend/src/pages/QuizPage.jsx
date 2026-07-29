import { useState } from "react";
import { api } from "../api";
import Logo from "../Logo";

export default function QuizPage() {
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    const previous = questions.map((q) => q.question).filter(Boolean);
    setBusy(true);
    setError("");
    setDone(false);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setQuestions([]);
    try {
      const data = await api("/api/quiz/start", {
        method: "POST",
        body: JSON.stringify({ avoid_questions: previous }),
      });
      const next = data.questions || [];
      if (!next.length) throw new Error("No questions came back. Try again.");
      setQuestions(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function stopPlaying() {
    setQuestions([]);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setError("");
  }

  function choose(i) {
    if (picked !== null) return;
    setPicked(i);
    if (i === questions[index].correct_index) setScore((s) => s + 1);
  }

  function next() {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
  }

  const q = questions[index];
  const idle = !questions.length && !busy && !done;

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Interview Quiz</h1>
          <p>MCQ drills from your preferences & resume.</p>
        </div>
        {!idle && !done && !busy && (
          <button className="btn btn-solid" onClick={start} disabled={busy}>
            New round
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {idle && (
        <div className="panel quiz-idle">
          <Logo size={56} />
          <h2>Wanna start a game?</h2>
          <p className="meta">
            I’ll generate interview multiple-choice questions based on your
            target role and resume.
          </p>
          <button className="btn btn-solid" onClick={start} disabled={busy}>
            Start quiz
          </button>
        </div>
      )}

      {busy && (
        <div className="panel empty">Cooking up fresh questions…</div>
      )}

      {q && !done && !busy && (
        <div className="panel">
          <div className="meta">
            Question {index + 1} / {questions.length}
          </div>
          <h2 style={{ fontFamily: "var(--display)", margin: "0.6rem 0 1rem" }}>
            {q.question}
          </h2>
          {q.options.map((opt, i) => {
            let cls = "option";
            if (picked !== null) {
              if (i === q.correct_index) cls += " correct";
              else if (i === picked) cls += " wrong";
            }
            return (
              <button key={i} className={cls} onClick={() => choose(i)} disabled={picked !== null}>
                {opt}
              </button>
            );
          })}
          {picked !== null && (
            <div style={{ marginTop: "1rem" }}>
              <p className="meta">{q.explanation}</p>
              <button className="btn btn-ghost" onClick={next}>
                {index + 1 >= questions.length ? "See score" : "Next"}
              </button>
            </div>
          )}
        </div>
      )}

      {done && !busy && (
        <div className="panel quiz-idle">
          <h2>Round complete</h2>
          <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0.4rem 0 0.6rem" }}>
            {score} / {questions.length} correct
          </p>
          <p className="meta" style={{ marginBottom: "1.2rem" }}>
            Want to generate a new set of questions, or stop playing?
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn-solid" onClick={start} disabled={busy}>
              Generate new ones
            </button>
            <button className="btn btn-ghost" onClick={stopPlaying} disabled={busy}>
              Stop playing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
