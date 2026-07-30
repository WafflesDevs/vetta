/** Plan tiles — paid tiers TBA (greyed out, no checkout). */
export default function PlanTiles({
  plans,
  className = "",
  currentPlan = null,
}) {
  const current =
    currentPlan == null || currentPlan === ""
      ? ""
      : String(currentPlan).toLowerCase();

  return (
    <div className={`price-grid ${className}`.trim()}>
      {plans.map((plan) => {
        const id = String(plan.id || "").toLowerCase();
        const isCurrent =
          Boolean(current) &&
          (id === current ||
            (id === "careerexpert" && ["careerexpert", "expert"].includes(current)) ||
            (id === "careerpro" && ["careerpro", "pro"].includes(current)));
        const isTba =
          String(plan.price || "").toUpperCase() === "TBA" ||
          plan.cta_disabled === true;

        return (
          <article
            className={`price-tile ${plan.featured ? "featured" : ""} ${
              isCurrent ? "is-current" : ""
            } ${isTba ? "is-tba" : ""}`}
            key={plan.id}
          >
            <span className={`tba ${isCurrent ? "tba-current" : ""}`}>
              {isCurrent ? "Current" : plan.badge || "TBA"}
            </span>
            <h3>{plan.name}</h3>
            <p className="meta">{plan.blurb}</p>
            <div className="amount">
              {plan.price || "TBA"}
              {plan.price_period ? (
                <span className="amount-period">{plan.price_period}</span>
              ) : null}
            </div>
            <p className="price-includes">What&apos;s included</p>
            <ul className="price-features">
              {(plan.features || []).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button className="btn btn-wide btn-ghost" type="button" disabled>
              Coming soon
            </button>
          </article>
        );
      })}
    </div>
  );
}
