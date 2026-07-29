import { useState } from "react";
import { api, getToken } from "../api";

export default function SettingsPage({ profile, onProfile }) {
  const [prefs, setPrefs] = useState({
    display_name: profile?.display_name || "",
    target_roles: profile?.target_roles || "",
    locations: profile?.locations || "",
    goals: profile?.goals || "",
  });
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const resumeName = profile?.resume_filename || "";
  const hasResume = Boolean(resumeName || (profile?.resume_text || "").trim());

  async function savePrefs(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const data = await api("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      if (data.profile) onProfile?.(data.profile);
      setMsg("Preferences saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadResume(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      if (data.profile) onProfile?.(data.profile);
      setMsg(`Resume uploaded (${data.filename}, ${data.chars} characters).`);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteResume() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const data = await api("/api/resume", { method: "DELETE" });
      if (data.profile) onProfile?.(data.profile);
      else onProfile?.({ ...profile, resume_text: "", resume_filename: "" });
      setMsg("Resume removed.");
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Update resume, job titles, locations, and goals anytime.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <div className="grid-2">
        <form className="panel" onSubmit={uploadResume}>
          <h3 style={{ marginTop: 0, fontFamily: "var(--display)" }}>Upload resume</h3>

          {hasResume ? (
            <div className="resume-current">
              <div>
                <div className="meta">Current resume</div>
                <strong className="resume-name">{resumeName || "Uploaded resume"}</strong>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={deleteResume}
              >
                Delete
              </button>
            </div>
          ) : (
            <p className="meta">No resume uploaded yet.</p>
          )}

          <div className="field">
            <label>PDF or DOCX</label>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <button className="btn btn-solid" disabled={!file || busy}>
            {hasResume ? "Replace" : "Upload"}
          </button>
        </form>

        <form className="panel" onSubmit={savePrefs}>
          <h3 style={{ marginTop: 0, fontFamily: "var(--display)" }}>Preferences</h3>
          <div className="field">
            <label>Display name</label>
            <input
              value={prefs.display_name}
              onChange={(e) => setPrefs({ ...prefs, display_name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Target roles</label>
            <input
              value={prefs.target_roles}
              onChange={(e) => setPrefs({ ...prefs, target_roles: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Locations</label>
            <input
              value={prefs.locations}
              onChange={(e) => setPrefs({ ...prefs, locations: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Goals</label>
            <textarea
              rows={4}
              value={prefs.goals}
              onChange={(e) => setPrefs({ ...prefs, goals: e.target.value })}
            />
          </div>
          <button className="btn btn-ghost" disabled={busy}>
            Save preferences
          </button>
        </form>
      </div>
    </div>
  );
}
