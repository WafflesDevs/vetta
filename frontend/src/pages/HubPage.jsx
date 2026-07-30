import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getCachedJobs, loadJobs, patchCachedSaves } from "../jobsCache";

const TABS = [
  { id: "recommended", label: "Recommended" },
  { id: "liked", label: "Liked" },
  { id: "applied", label: "Applied" },
  { id: "external", label: "External" },
];

function jobKey(job) {
  return job.url || `${job.title || ""}|${job.company || ""}|${job.location || ""}`;
}

/** Highest match_score first; null/missing last. */
function byMatchScoreDesc(a, b) {
  const sa = a?.match_score;
  const sb = b?.match_score;
  const aNull = sa == null || Number.isNaN(Number(sa));
  const bNull = sb == null || Number.isNaN(Number(sb));
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return Number(sb) - Number(sa);
}

function sortRecommended(jobs) {
  return [...(jobs || [])].sort(byMatchScoreDesc);
}

function ensureJobUrl(job) {
  const url = (job?.url || "").trim();
  if (url) return url;
  return `job://${jobKey(job)}`;
}

function roleTag(job, profile) {
  const fromJob =
    (Array.isArray(job?.job_type) ? job.job_type[0] : job?.job_type) ||
    "";
  if (String(fromJob).trim()) return String(fromJob).trim().split(",")[0].trim();
  const roles = (profile?.target_roles || "").split(",")[0].trim();
  if (roles) return roles;
  const title = (job?.title || "").trim();
  if (!title) return "Role";
  // short label from title (drop seniority prefixes)
  return title
    .replace(/^(senior|junior|staff|principal|lead|sr\.?|jr\.?)\s+/i, "")
    .split(/[|\-–—]/)[0]
    .trim()
    .slice(0, 28) || "Role";
}

function MatchRing({ score, needsResume }) {
  const hasScore = score != null && !Number.isNaN(Number(score));
  if (!hasScore && !needsResume) return null;

  if (!hasScore) {
    return (
      <span className="jobs-match jobs-match-empty" title="Upload a resume to see AI match %">
        <span className="jobs-match-ring jobs-match-ring-empty" aria-hidden="true" />
        <span className="jobs-match-hint">Upload resume for match %</span>
      </span>
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round(Number(score))));
  const r = 10;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <span className="jobs-match" title={`${pct}% AI match`}>
      <svg className="jobs-match-ring" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <circle className="jobs-match-track" cx="14" cy="14" r={r} />
        <circle
          className="jobs-match-fill"
          cx="14"
          cy="14"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="jobs-match-pct">{pct}%</span>
    </span>
  );
}

function applyHubData(data, setters) {
  const recommended = sortRecommended(data.recommended || data.jobs || []);
  const liked = data.liked || [];
  const applied = data.applied || [];
  const external = data.external || [];
  setters.setRecommended(recommended);
  setters.setLiked(liked);
  setters.setApplied(applied);
  setters.setExternal(external);
  setters.setCounts(
    data.counts || {
      recommended: recommended.length,
      liked: liked.length,
      applied: applied.length,
      external: external.length,
    }
  );
}

export default function HubPage({ profile }) {
  const cached = getCachedJobs(profile);
  const [tab, setTab] = useState("recommended");
  const [query, setQuery] = useState("");
  const [recommended, setRecommended] = useState(() =>
    sortRecommended(cached?.recommended || cached?.jobs || [])
  );
  const [liked, setLiked] = useState(() => cached?.liked || []);
  const [applied, setApplied] = useState(() => cached?.applied || []);
  const [external, setExternal] = useState(() => cached?.external || []);
  const [counts, setCounts] = useState(
    () =>
      cached?.counts || {
        recommended: (cached?.recommended || cached?.jobs || []).length,
        liked: (cached?.liked || []).length,
        applied: (cached?.applied || []).length,
        external: (cached?.external || []).length,
      }
  );
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(!cached);
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState(() => cached?.limits || null);

  const roleLabel = (profile?.target_roles || "").trim() || "your preferences";
  const locationLabel = (profile?.locations || "").trim();
  const refreshWait = Number(limits?.refresh_wait_seconds || 0);
  const refreshLocked = refreshWait > 0;

  const setters = {
    setRecommended,
    setLiked,
    setApplied,
    setExternal,
    setCounts,
  };

  async function loadHub({ force = false } = {}) {
    if (!(profile?.target_roles || "").trim()) return;
    if (force && refreshLocked) {
      setError(
        `Free tier refreshes once per hour. Try again in ${Math.ceil(refreshWait / 60)} min — or upgrade for faster scrapes.`
      );
      return;
    }
    const hadCache = Boolean(getCachedJobs(profile)) && !force;
    if (!hadCache) setBusy(true);
    setError("");
    try {
      const data = await loadJobs(profile, { force });
      applyHubData(data, setters);
      if (data.limits) setLimits(data.limits);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshSavesOnly() {
    const data = await api("/api/jobs/saves");
    const nextLiked = data.liked || [];
    const nextApplied = data.applied || [];
    const nextExternal = data.external || [];
    setLiked(nextLiked);
    setApplied(nextApplied);
    setExternal(nextExternal);
    setRecommended((prev) =>
      prev.map((job) => {
        const url = ensureJobUrl(job);
        const hit =
          nextLiked.find((s) => s.url === url) ||
          nextApplied.find((s) => s.url === url) ||
          nextExternal.find((s) => s.url === url);
        return { ...job, url, saved_status: hit?.status || null };
      })
    );
    setCounts((c) => ({
      ...c,
      liked: nextLiked.length,
      applied: nextApplied.length,
      external: nextExternal.length,
    }));
    patchCachedSaves(profile, {
      liked: nextLiked,
      applied: nextApplied,
      external: nextExternal,
    });
  }

  useEffect(() => {
    if ((profile?.target_roles || "").trim()) {
      loadHub({ force: false });
    }
  }, [profile?.target_roles, profile?.locations]);

  const list = useMemo(() => {
    const raw =
      tab === "recommended"
        ? sortRecommended(recommended)
        : tab === "liked"
          ? liked
          : tab === "applied"
            ? applied
            : external;
    const q = query.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((j) => {
      const hay = `${j.title || ""} ${j.company || ""} ${j.location || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tab, query, recommended, liked, applied, external]);

  useEffect(() => {
    if (!list.length) {
      setSelected(null);
      return;
    }
    if (!selected || !list.find((j) => jobKey(j) === jobKey(selected))) {
      setSelected(list[0]);
    }
  }, [list, tab]);

  async function saveJob(job, status) {
    setError("");
    setSaving(true);
    const url = ensureJobUrl(job);
    const payload = {
      status,
      title: job.title || "",
      company: job.company || "",
      location: job.location || "",
      salary:
        typeof job.salary === "string"
          ? job.salary
          : job.salary
            ? JSON.stringify(job.salary)
            : "",
      url,
      description: job.description || "",
      job_type: Array.isArray(job.job_type)
        ? job.job_type.join(", ")
        : job.job_type || "",
      posted_at: job.posted_at || "",
    };
    try {
      const data = await api("/api/jobs/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const saved = { ...(data.job || payload), status, url, saved_status: status };

      const nextRecommended = recommended.map((j) =>
        jobKey(j) === jobKey({ ...job, url }) ? { ...j, url, saved_status: status } : j
      );
      let nextLiked = liked.filter((j) => ensureJobUrl(j) !== url);
      let nextApplied = applied.filter((j) => ensureJobUrl(j) !== url);
      let nextExternal = external.filter((j) => ensureJobUrl(j) !== url);
      if (status === "liked") nextLiked = [saved, ...nextLiked];
      if (status === "applied") nextApplied = [saved, ...nextApplied];
      if (status === "external") nextExternal = [saved, ...nextExternal];

      setRecommended(nextRecommended);
      setLiked(nextLiked);
      setApplied(nextApplied);
      setExternal(nextExternal);
      setCounts((c) => ({
        ...c,
        liked: nextLiked.length,
        applied: nextApplied.length,
        external: nextExternal.length,
      }));
      setSelected((prev) =>
        prev && jobKey(prev) === jobKey({ ...job, url })
          ? { ...prev, url, saved_status: status }
          : prev
      );
      patchCachedSaves(profile, {
        recommended: nextRecommended,
        liked: nextLiked,
        applied: nextApplied,
        external: nextExternal,
      });
      if (status === "liked" || status === "applied") setTab(status);
      await refreshSavesOnly();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeJob(job) {
    const url = ensureJobUrl(job);
    if (!url) return;
    setError("");
    setSaving(true);
    try {
      await api(`/api/jobs/save?url=${encodeURIComponent(url)}`, {
        method: "DELETE",
      });
      const nextLiked = liked.filter((j) => ensureJobUrl(j) !== url);
      const nextApplied = applied.filter((j) => ensureJobUrl(j) !== url);
      const nextExternal = external.filter((j) => ensureJobUrl(j) !== url);
      const nextRecommended = recommended.map((j) =>
        ensureJobUrl(j) === url ? { ...j, saved_status: null } : j
      );
      setLiked(nextLiked);
      setApplied(nextApplied);
      setExternal(nextExternal);
      setRecommended(nextRecommended);
      setCounts((c) => ({
        ...c,
        liked: nextLiked.length,
        applied: nextApplied.length,
        external: nextExternal.length,
      }));
      patchCachedSaves(profile, {
        recommended: nextRecommended,
        liked: nextLiked,
        applied: nextApplied,
        external: nextExternal,
      });
      if (tab !== "recommended") {
        const remaining =
          tab === "liked" ? nextLiked : tab === "applied" ? nextApplied : nextExternal;
        setSelected(remaining[0] || null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openExternal(job) {
    const url = ensureJobUrl(job);
    if (url && !url.startsWith("job://")) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    saveJob({ ...job, url }, "external");
  }

  return (
    <div className="jobs-board">
      <div className="page-title">
        <div>
          <h1>Jobs</h1>
          <p>
            Recommended for <strong style={{ color: "var(--white)" }}>{roleLabel}</strong>
            {locationLabel ? ` · ${locationLabel}` : ""}.{" "}
            <Link to="/app/settings" style={{ textDecoration: "underline" }}>
              Edit in Settings
            </Link>
          </p>
        </div>
        <button
          className="btn btn-solid"
          onClick={() => loadHub({ force: true })}
          disabled={busy || refreshLocked}
          title={
            refreshLocked
              ? `Free refresh cooldown: ${Math.ceil(refreshWait / 60)} min left`
              : "Refresh listings"
          }
        >
          {busy ? "Finding…" : refreshLocked ? `Wait ${Math.ceil(refreshWait / 60)}m` : "Refresh"}
        </button>
      </div>

      {limits?.max_jobs != null && limits.plan === "free" ? (
        <p className="meta" style={{ marginTop: "-0.35rem" }}>
          Free hub: up to {limits.max_jobs} jobs · longer cache · limited refreshes
        </p>
      ) : null}

      {error && <div className="alert alert-error">{error}</div>}

      {!(profile?.target_roles || "").trim() && (
        <div className="alert alert-error">
          Finish onboarding (or set your job title in Settings) so we can recommend roles.
        </div>
      )}

      <div className="jobs-toolbar">
        <div className="jobs-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`jobs-tab ${t.id === tab ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="jobs-count">{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="jobs-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, company, location…"
          />
          {query && (
            <button type="button" className="jobs-clear" onClick={() => setQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="jobs-split">
        <div className="jobs-list panel">
          {busy && !list.length && (
            <div className="empty jobs-finding">
              <strong>Finding jobs</strong>
              <span className="meta">This will take a minute.</span>
            </div>
          )}
          {!busy && !list.length && (
            <div className="empty">
              {tab === "recommended"
                ? "No recommendations yet. Refresh after setting your role."
                : `No ${tab} jobs yet.`}
            </div>
          )}
          {list.map((job) => (
            <button
              type="button"
              key={jobKey(job)}
              className={`jobs-row ${selected && jobKey(selected) === jobKey(job) ? "active" : ""}`}
              onClick={() => setSelected(job)}
            >
              <div className="jobs-row-top">
                <strong>{job.title || "Untitled role"}</strong>
                {job.saved_status && <span className="tag">{job.saved_status}</span>}
                {job.status && tab !== "recommended" && (
                  <span className="tag">{job.status}</span>
                )}
              </div>
              <div className="meta">
                {job.company || "Company"} · {job.location || "Location"}
              </div>
              {job.salary && <div className="meta">{typeof job.salary === "string" ? job.salary : ""}</div>}
              {tab === "recommended" && (
                <div className="jobs-row-foot">
                  <MatchRing score={job.match_score} needsResume={job.match_needs_resume} />
                  <span className="jobs-role-tag">{roleTag(job, profile)}</span>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="jobs-detail panel">
          {!selected && <div className="empty">Select a job to preview.</div>}
          {selected && (
            <>
              <span className="tag">{tab}</span>
              <h2 style={{ fontFamily: "var(--display)", margin: "0.6rem 0 0.3rem" }}>
                {selected.title}
              </h2>
              <div className="meta" style={{ marginBottom: "0.8rem" }}>
                {selected.company} · {selected.location}
                {selected.posted_at ? ` · ${selected.posted_at}` : ""}
              </div>
              {tab === "recommended" && (
                <div className="jobs-detail-match">
                  <MatchRing
                    score={selected.match_score}
                    needsResume={selected.match_needs_resume}
                  />
                  {!selected.match_needs_resume && selected.match_score != null ? (
                    <span className="meta">AI match vs your resume + prefs</span>
                  ) : null}
                </div>
              )}
              {selected.salary && typeof selected.salary === "string" && (
                <div className="meta" style={{ marginBottom: "0.8rem" }}>
                  {selected.salary}
                </div>
              )}
              <p className="jobs-desc">{selected.description || "No description available."}</p>

              <div className="jobs-actions">
                {tab === "recommended" && (
                  <>
                    <button
                      className="btn btn-ghost"
                      onClick={() => saveJob(selected, "liked")}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "♡ Like"}
                    </button>
                    <button
                      className="btn btn-solid"
                      onClick={() => saveJob(selected, "applied")}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Mark applied"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => openExternal(selected)}
                      disabled={saving}
                    >
                      Open listing
                    </button>
                  </>
                )}
                {tab === "liked" && (
                  <>
                    <button
                      className="btn btn-solid"
                      onClick={() => saveJob(selected, "applied")}
                      disabled={saving}
                    >
                      Mark applied
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => openExternal(selected)}
                      disabled={saving}
                    >
                      Open listing
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => removeJob(selected)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </>
                )}
                {(tab === "applied" || tab === "external") && (
                  <>
                    <button
                      className="btn btn-ghost"
                      onClick={() => openExternal(selected)}
                      disabled={saving}
                    >
                      Open listing
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => removeJob(selected)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
