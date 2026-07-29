import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PublicNav, { PublicFooter } from "../components/PublicNav";

export default function PricingPage({ user }) {
 const [plans, setPlans] = useState([]);

 useEffect(() => {
 api("/api/plans")
 .then((d) => setPlans(d.plans || []))
 .catch(() => {
 setPlans([
 {
 id: "careerfinder",
 name: "CareerFinder",
 price: "TBA",
 blurb: "Discover roles that match where you are now.",
 features: ["TBA", "TBA", "TBA"],
 },
 {
 id: "careerexpert",
 name: "CareerExpert",
 price: "TBA",
 blurb: "Deeper resume coaching and fit scoring.",
 features: ["TBA", "TBA", "TBA"],
 },
 {
 id: "careerpro",
 name: "CareerPro",
 price: "TBA",
 blurb: "Full job search stack for serious applicants.",
 features: ["TBA", "TBA", "TBA"],
 },
 ]);
 });
 }, []);

 return (
 <div>
 <PublicNav user={user} />
 <section className="section" style={{ borderTop: 0, paddingTop: "3rem" }}>
 <p className="section-kicker">Pricing</p>
 <h2>Plans are TBA. The free tier is live.</h2>
 <p className="section-lead">
 Right now everyone gets free access with chat limits. Paid roles
 below are listed for the roadmap.
 </p>
 <div className="price-grid">
 {plans.map((plan, i) => (
 <article
 className={`price-tile ${i === 1 ? "featured" : ""}`}
 key={plan.id}
 >
 <span className="tba">TBA</span>
 <h3>{plan.name}</h3>
 <p className="meta">{plan.blurb}</p>
 <div className="amount">{plan.price}</div>
 <ul>
 {(plan.features || []).map((f, idx) => (
 <li key={idx}>{f}</li>
 ))}
 </ul>
 <button className="btn btn-ghost btn-wide" disabled>
 Coming soon
 </button>
 </article>
 ))}
 </div>
 <div style={{ marginTop: "2.5rem" }}>
 <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
 Use free tier now
 </Link>
 </div>
 </section>
 <PublicFooter />
 </div>
 );
}
