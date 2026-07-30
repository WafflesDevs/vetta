import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PublicNav, { PublicFooter } from "../components/PublicNav";
import PlanTiles from "../components/PlanTiles";
import { PLANS_FALLBACK, resolvePlansPayload } from "../plansFallback";

export default function PricingPage({ user }) {
  const [tagline, setTagline] = useState(PLANS_FALLBACK.tagline);
  const [note, setNote] = useState(PLANS_FALLBACK.note);
  const [plans, setPlans] = useState(PLANS_FALLBACK.plans);

  useEffect(() => {
    api("/api/plans")
      .then((d) => {
        const next = resolvePlansPayload(d);
        setTagline(next.tagline);
        setNote(next.note);
        setPlans(next.plans);
      })
      .catch(() => {
        setTagline(PLANS_FALLBACK.tagline);
        setNote(PLANS_FALLBACK.note);
        setPlans(PLANS_FALLBACK.plans);
      });
  }, []);

  return (
    <div className="page-public">
      <PublicNav user={user} />
      <section className="section pricing-hero" style={{ borderTop: 0, paddingTop: "3rem" }}>
        <p className="brand-mark">Vetta</p>
        <p className="section-kicker">Pricing</p>
        <h2>Plans</h2>
        <p className="section-lead">{tagline}</p>
        <p className="meta pricing-honest-note">{note}</p>

        <PlanTiles plans={plans} />

        <div className="pricing-system-note">
          <p className="section-kicker" style={{ marginBottom: "0.5rem" }}>
            What you get now
          </p>
          <p className="meta" style={{ margin: 0, maxWidth: "48ch" }}>
            Full access to chat, job hub, interview quiz, and the live PDF resume editor.
            Chat: 2 open chats · 30 messages each. Job search limited to 10 due to cost
            (refresh once per hour). Quiz: 2 cycles per hour.
          </p>
        </div>
        <div style={{ marginTop: "2.5rem" }}>
          <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
            {user ? "Open Vetta" : "Get started"}
          </Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
