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
        <h2>Pick the depth your search needs</h2>
        <p className="section-lead">{tagline}</p>
        <p className="meta pricing-honest-note">{note}</p>

        <div className="pricing-contrast" aria-label="Why upgrade">
          <div className="pricing-contrast-col dim">
            <span className="tag">Free</span>
            <strong>Honest caps</strong>
            <p>1 chat · 60 messages · 5 jobs · 1 quiz. Enough to feel the loop — not enough for a full search week.</p>
          </div>
          <div className="pricing-contrast-col mid">
            <span className="tag">Expert</span>
            <strong>Studio + unlimited coaching work</strong>
            <p>Live PDF editor, unlimited fit scores, rewrites, letters, and quiz rounds.</p>
          </div>
          <div className="pricing-contrast-col hot">
            <span className="tag">Pro</span>
            <strong>Highest headroom + priority match</strong>
            <p>Everything in Expert, plus max limits, priority matching, and early access when new tools land.</p>
          </div>
        </div>

        <PlanTiles plans={plans} className="price-grid-spaced" />
        <div className="pricing-system-note">
          <p className="section-kicker" style={{ marginBottom: "0.5rem" }}>
            Every plan includes the loop
          </p>
          <p className="meta" style={{ margin: 0, maxWidth: "48ch" }}>
            Find roles · score fit · tailor materials · practice interviews. Higher tiers raise limits and unlock the live PDF studio. Checkout opens soon — no fake countdown.
          </p>
        </div>
        <div style={{ marginTop: "2.5rem" }}>
          <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
            {user ? "Open Vetta" : "Use free tier now"}
          </Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
