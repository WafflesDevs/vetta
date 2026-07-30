import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PlanTiles from "../components/PlanTiles";
import { PLANS_FALLBACK, resolvePlansPayload } from "../plansFallback";

export default function PlansPage() {
  const [plans, setPlans] = useState(PLANS_FALLBACK.plans);
  const [note, setNote] = useState(PLANS_FALLBACK.note);

  useEffect(() => {
    api("/api/plans")
      .then((data) => {
        const next = resolvePlansPayload(data);
        setPlans(next.plans);
        setNote(next.note);
      })
      .catch(() => {
        setPlans(PLANS_FALLBACK.plans);
        setNote(PLANS_FALLBACK.note);
      });
  }, []);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Plans</h1>
          <p>{note}</p>
        </div>
      </div>

      <PlanTiles plans={plans} />

      <div style={{ marginTop: "1.5rem" }}>
        <Link className="btn btn-ghost" to="/pricing">
          Open public pricing
        </Link>
      </div>
    </div>
  );
}
