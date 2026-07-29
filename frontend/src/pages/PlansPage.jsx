import { useEffect, useState } from "react";
import { api } from "../api";

export default function PlansPage() {
 const [plans, setPlans] = useState([]);

 useEffect(() => {
 api("/api/plans").then((data) => setPlans(data.plans || []));
 }, []);

 return (
 <div>
 <div className="page-head">
 <div>
 <h1>Plans</h1>
 <p>Everything is TBA for now. Free tier is what you’re on.</p>
 </div>
 </div>

 <div className="grid-3">
 {plans.map((plan) => (
 <article className="plan-card" key={plan.id}>
 <span className="badge">TBA</span>
 <h3 style={{ marginTop: "0.6rem" }}>{plan.name}</h3>
 <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--navy)" }}>
 {plan.price}
 </div>
 <p className="muted">{plan.blurb}</p>
 <ul>
 {(plan.features || []).map((f, i) => (
 <li key={i}>{f}</li>
 ))}
 </ul>
 <button className="btn btn-dark btn-wide" disabled>
 Coming soon
 </button>
 </article>
 ))}
 </div>
 </div>
 );
}
