import { useState } from "react";
import { api, getToken } from "../api";
import Logo from "../Logo";

export default function OnboardingModal({ profile, onDone }) {
 const [step, setStep] = useState(1); // 1 prefs, 2 resume
 const [displayName, setDisplayName] = useState(profile?.display_name || "");
 const [targetRoles, setTargetRoles] = useState(profile?.target_roles || "");
 const [locations, setLocations] = useState(profile?.locations || "Remote");
 const [goals, setGoals] = useState(profile?.goals || "");
 const [file, setFile] = useState(null);
 const [error, setError] = useState("");
 const [busy, setBusy] = useState(false);

 async function savePrefs(e) {
 e.preventDefault();
 if (!targetRoles.trim()) {
 setError("Add at least one job title / target role.");
 return;
 }
 setBusy(true);
 setError("");
 try {
 const data = await api("/api/preferences", {
 method: "PUT",
 body: JSON.stringify({
 display_name: displayName,
 target_roles: targetRoles,
 locations,
 goals,
 }),
 });
 if (data.profile) onDone?.(data.profile, false); // not fully done yet
 setStep(2);
 } catch (err) {
 setError(err.message);
 } finally {
 setBusy(false);
 }
 }

 async function uploadAndFinish(e) {
 e.preventDefault();
 setBusy(true);
 setError("");
 try {
 let profileData = null;
 if (file) {
 const body = new FormData();
 body.append("file", file);
 const res = await fetch("/api/resume", {
 method: "POST",
 headers: { Authorization: `Bearer ${getToken()}` },
 body,
 });
 const data = await res.json();
 if (!res.ok) throw new Error(data.detail || "Upload failed");
 profileData = data.profile;
 }
 // refresh latest profile
 const me = await api("/api/me");
 onDone?.(profileData || me.profile, true);
 } catch (err) {
 setError(err.message);
 } finally {
 setBusy(false);
 }
 }

 async function skipResume() {
 setBusy(true);
 setError("");
 try {
 const me = await api("/api/me");
 onDone?.(me.profile, true);
 } catch (err) {
 setError(err.message);
 } finally {
 setBusy(false);
 }
 }

 return (
 <div className="onboard-overlay">
 <div className="onboard-card rise">
 <div className="onboard-brand">
 <Logo size={36} />
 <div>
 <strong>Welcome to Vetta</strong>
 <div className="meta">Step {step} of 2. Set this up once</div>
 </div>
 </div>

 {error && <div className="alert alert-error">{error}</div>}

 {step === 1 && (
 <form onSubmit={savePrefs}>
 <h2 style={{ fontFamily: "var(--display)", margin: "0 0 0.4rem" }}>
 What are you aiming for?
 </h2>
 <p className="meta" style={{ marginBottom: "1.2rem" }}>
 We’ll use this to fill your Jobs hub automatically.
 </p>

 <div className="field">
 <label>Display name</label>
 <input
 value={displayName}
 onChange={(e) => setDisplayName(e.target.value)}
 placeholder="Alex"
 />
 </div>
 <div className="field">
 <label>Job title / target roles *</label>
 <input
 required
 value={targetRoles}
 onChange={(e) => setTargetRoles(e.target.value)}
 placeholder="AI Engineer, Software Engineer"
 />
 </div>
 <div className="field">
 <label>Preferred locations</label>
 <input
 value={locations}
 onChange={(e) => setLocations(e.target.value)}
 placeholder="Remote, New York, San Francisco"
 />
 </div>
 <div className="field">
 <label>Goals</label>
 <textarea
 rows={3}
 value={goals}
 onChange={(e) => setGoals(e.target.value)}
 placeholder="Break into AI engineering, automate workflows…"
 />
 </div>
 <button className="btn btn-solid btn-wide" disabled={busy}>
 {busy ? "Saving…" : "Continue"}
 </button>
 </form>
 )}

 {step === 2 && (
 <form onSubmit={uploadAndFinish}>
 <h2 style={{ fontFamily: "var(--display)", margin: "0 0 0.4rem" }}>
 Upload your resume
 </h2>
 <p className="meta" style={{ marginBottom: "1.2rem" }}>
 PDF or DOCX. Used for chat scoring, rewrites, and the interview quiz.
 You can change this anytime in Settings.
 </p>
 <div className="field">
 <label>Resume file</label>
 <input
 type="file"
 accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
 onChange={(e) => setFile(e.target.files?.[0] || null)}
 />
 </div>
 <button className="btn btn-solid btn-wide" disabled={busy || !file}>
 {busy ? "Uploading…" : "Upload & finish"}
 </button>
 <button
 type="button"
 className="btn btn-ghost btn-wide"
 style={{ marginTop: "0.6rem" }}
 onClick={skipResume}
 disabled={busy}
 >
 Skip for now
 </button>
 </form>
 )}
 </div>
 </div>
 );
}

export function needsOnboarding(profile) {
 if (!profile) return true;
 return !(profile.target_roles || "").trim();
}
