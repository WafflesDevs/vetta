import { Link } from "react-router-dom";
import PublicNav, { PublicFooter } from "../components/PublicNav";
import Logo from "../Logo";

const TILES = [
  // Sharpest lab photo in the tall hero cell
  { src: "/brand/careers/cover-6.jpg", className: "tile-a" },
  { src: "/brand/careers/cover-2.jpg", className: "tile-b" },
  { src: "/brand/careers/cover-3.jpg", className: "tile-c" },
  { src: "/brand/careers/cover-7.jpg", className: "tile-d" },
  { src: "/brand/careers/cover-8.jpg", className: "tile-e" },
];

export default function LandingPage({ user }) {
  return (
    <div>
      <PublicNav user={user} />
      <section className="hero hero-bento">
        <div className="hero-content">
          <h1 className="hero-clean rise rise-d1">We will help with any career.</h1>
          <p className="rise rise-d2 hero-sub">
            Find roles, score fit, rewrite materials, and practice interviews built around you.
          </p>
          <div className="hero-actions rise rise-d3">
            <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
              {user ? "Open dashboard" : "Start free"}
            </Link>
            <Link className="btn btn-ghost" to="/features">
              See features
            </Link>
          </div>
        </div>

        <div className="hero-bento-grid" aria-hidden>
          {TILES.map((tile, i) => (
            <div key={tile.src} className={`bento-tile ${tile.className}`} style={{ "--i": i }}>
              <img src={tile.src} alt="" />
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="section-kicker">Built for applicants who move</p>
        <h2>One stack. From listing to interview.</h2>
        <p className="section-lead">
          Vetta is a free career cockpit with focused chats, a live job hub, and a quiz mode that feels like practice.
        </p>
        <div className="feature-rail">
          <div className="feature-cell">
            <div className="num">01</div>
            <h3>Live job board</h3>
            <p>Jobs pulled from your target roles and locations.</p>
          </div>
          <div className="feature-cell">
            <div className="num">02</div>
            <h3>Coach chat</h3>
            <p>Score fit, rewrite resumes, draft cover letters.</p>
          </div>
          <div className="feature-cell">
            <div className="num">03</div>
            <h3>Interview quiz</h3>
            <p>MCQ drills tuned to your preferences and resume.</p>
          </div>
        </div>
      </section>

      <section className="section" style={{ textAlign: "center" }}>
        <div className="hero-mark-mini">
          <Logo size={64} />
        </div>
        <h2 style={{ margin: "0.4rem auto 1.2rem", maxWidth: "16ch" }}>
          Ready when you are.
        </h2>
        <Link className="btn btn-solid" to={user ? "/app" : "/signup"}>
          {user ? "Go to dashboard" : "Create account"}
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}
