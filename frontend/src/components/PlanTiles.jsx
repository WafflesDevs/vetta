/** Shared Free / CareerExpert / CareerPro tiles with features + restrictions. */
export default function PlanTiles({ plans, className = "" }) {
  return (
    <div className={`price-grid ${className}`.trim()}>
      {plans.map((plan) => (
        <article
          className={`price-tile ${plan.featured ? "featured" : ""}`}
          key={plan.id}
        >
          {plan.badge ? <span className="tba">{plan.badge}</span> : null}
          <h3>{plan.name}</h3>
          <p className="meta">{plan.blurb}</p>
          <div className="amount">
            {plan.price}
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
          {(plan.restrictions || []).length > 0 ? (
            <>
              <p className="price-includes price-limits">Limits</p>
              <ul className="price-features price-restrictions">
                {plan.restrictions.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            className={`btn btn-wide ${plan.featured ? "btn-solid" : "btn-ghost"}`}
            type="button"
            disabled={plan.cta_disabled !== false}
          >
            {plan.cta || "Coming soon"}
          </button>
        </article>
      ))}
    </div>
  );
}
