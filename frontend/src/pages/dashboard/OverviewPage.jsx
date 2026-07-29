import { Link } from "react-router-dom";
import Logo from "../../Logo";

export default function OverviewPage({ profile }) {
 return (
 <div>
 <div className="page-title">
 <div>
 <h1>Dashboard</h1>
 <p>Pick a lane. Everything syncs to your resume and preferences.</p>
 </div>
 <Logo size={36} onDark />
 </div>

 <div className="grid-3">
 <Link to="/app/chat" className="stat-tile">
 <span className="tag">Coach</span>
 <h3 style={{ fontFamily: "var(--display)", margin: "0.7rem 0 0.3rem" }}>Chat</h3>
 <p className="meta">Score fit · rewrite · cover letters</p>
 </Link>
 <Link to="/app/hub" className="stat-tile">
 <span className="tag">Jobs</span>
 <h3 style={{ fontFamily: "var(--display)", margin: "0.7rem 0 0.3rem" }}>Jobs</h3>
 <p className="meta">
 {profile?.target_roles
 ? `Recommended for: ${profile.target_roles}`
 : "Recommended · Liked · Applied · External"}
 </p>
 </Link>
 <Link to="/app/quiz" className="stat-tile">
 <span className="tag">Drill</span>
 <h3 style={{ fontFamily: "var(--display)", margin: "0.7rem 0 0.3rem" }}>Interview Quiz</h3>
 <p className="meta">MCQ rounds from your goals</p>
 </Link>
 <Link to="/app/resume" className="stat-tile">
 <span className="tag">Live</span>
 <h3 style={{ fontFamily: "var(--display)", margin: "0.7rem 0 0.3rem" }}>Resume</h3>
 <p className="meta">Watch AI rewrite your page, then download PDF</p>
 </Link>
 </div>

 <div className="panel" style={{ marginTop: "1rem" }}>
 <p className="meta" style={{ margin: 0 }}>
 Free tier · 2 chats max · 30 messages per chat · Resume PDF/DOCX upload
 </p>
 </div>
 </div>
 );
}
