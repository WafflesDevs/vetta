import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PlanTiles from "../components/PlanTiles";
import { PLANS_FALLBACK, resolvePlansPayload } from "../plansFallback";

export default function PlansPage() {
  const [plans, setPlans] = useState(PLANS_FALLBACK.plans);
  const [note, setNote] = useState(PLANS_FALLBACK.note);
  const [tagline, setTagline] = useState(PLANS_FALLBACK.tagline);

  useEffect(() => {
    api("/api/plans")
      .then((data) => {
        const next = resolvePlansPayload(data);
        setPlans(next.plans);
        setNote(next.note);
        setTagline(next.tagline);
      })
      .catch(() => {
        setPlans(PLANS_FALLBACK.plans);
        setNote(PLANS_FALLBACK.note);
        setTagline(PLANS_FALLBACK.tagline);
      });
  }, []);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Plans</h1>
          <p>{tagline}</p>
        </div>
      </div>

      <p className="meta" style={{ marginTop: 0 }}>
        {note}
      </p>

      <PlanTiles plans={plans} />

      <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        <Link className="btn btn-ghost" to="/pricing">
          Open public pricing
        </Link>
      </div>
    </div>
  );
}
