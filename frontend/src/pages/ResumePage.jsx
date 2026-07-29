import { useEffect, useRef, useState } from "react";
import { api, getToken } from "../api";

const CHIPS = [
  "Tighten the summary",
  "Make it stronger for my target roles",
  "Add clearer section headers",
  "Expand to two pages with more detail",
  "Emphasize measurable impact",
];

function PdfPreview({ text, streaming }) {
  const [url, setUrl] = useState("");
  const [building, setBuilding] = useState(false);
  const [fail, setFail] = useState("");
  const lastText = useRef("");
  const timer = useRef(null);
  const blobUrl = useRef("");

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);

  useEffect(() => {
    const next = (text || "").trim();
    if (!next) {
      if (blobUrl.current) {
        URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = "";
      }
      setUrl("");
      lastText.current = "";
      return;
    }
    if (next === lastText.current && url) return;

    if (timer.current) clearTimeout(timer.current);
    const delay = streaming ? 450 : 80;
    timer.current = setTimeout(async () => {
      setBuilding(true);
      setFail("");
      try {
        const res = await fetch("/api/resume/pdf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ resume_text: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Could not build PDF preview");
        }
        const blob = await res.blob();
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        const objectUrl = URL.createObjectURL(blob);
        blobUrl.current = objectUrl;
        lastText.current = next;
        setUrl(`${objectUrl}#view=FitH`);
      } catch (err) {
        setFail(err.message || "Preview failed");
      } finally {
        setBuilding(false);
      }
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, streaming]);

  return (
    <div className={`resume-paper resume-pdf-wrap ${streaming ? "is-streaming" : ""}`}>
      {(building || streaming) && (
        <div className="resume-pdf-status">
          {streaming ? "Writing into the PDF…" : "Refreshing PDF…"}
        </div>
      )}
      {fail ? <div className="alert alert-error">{fail}</div> : null}
      {url ? (
        <iframe
          title="Resume PDF preview"
          className="resume-pdf-frame"
          src={url}
        />
      ) : (
        <div className="resume-pdf-empty">
          <p className="meta">Your real multi-page PDF will appear here.</p>
        </div>
      )}
    </div>
  );
}

export default function ResumePage({ profile, onProfile }) {
  const [draft, setDraft] = useState(profile?.resume_text || "");
  const [history, setHistory] = useState([]);
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const streamingDoc = useRef("");

  useEffect(() => {
    setDraft(profile?.resume_text || "");
  }, [profile?.resume_text]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, busy, status]);

  async function upload(file) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      if (data.profile) onProfile?.(data.profile);
      setDraft(data.profile?.resume_text || "");
      setLog((prev) => [
        ...prev,
        { role: "assistant", content: `Loaded ${data.filename || "your resume"}. Tell me what to change.` },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadPdf() {
    setError("");
    try {
      // Prefer current draft so download matches what you see
      const res = await fetch("/api/resume/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ resume_text: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vetta-resume.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function undo() {
    if (!history.length || busy) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setDraft(prev);
    try {
      const data = await api("/api/resume/save", {
        method: "POST",
        body: JSON.stringify({ resume_text: prev }),
      });
      if (data.profile) onProfile?.(data.profile);
      setLog((l) => [...l, { role: "assistant", content: "Restored the previous version." }]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function send(instruction) {
    const content = (instruction || text).trim();
    if (!content || busy) return;
    if (!draft.trim()) {
      setError("Upload a resume first.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Reading your resume...");
    setText("");
    setLog((prev) => [...prev, { role: "user", content }]);
    const baseline = draft;
    setHistory((h) => [...h.slice(-4), baseline]);
    streamingDoc.current = "";
    let writing = false;

    try {
      const res = await fetch("/api/resume/edit/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ instruction: content, resume_text: baseline }),
      });

      if (!res.ok) {
        let detail = "Edit failed";
        try {
          const data = await res.json();
          detail = data.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let note = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() || "";
        for (const line of parts) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "status") setStatus(event.text || "Working...");
          if (event.type === "note") {
            note = event.text || note;
            setLog((prev) => [...prev, { role: "assistant", content: event.text }]);
          }
          if (event.type === "token") {
            if (!writing) {
              writing = true;
              streamingDoc.current = event.text || "";
            } else {
              streamingDoc.current += event.text || "";
            }
            setDraft(streamingDoc.current);
            setStatus("");
          }
          if (event.type === "done" || event.type === "saved") {
            if (event.document) {
              streamingDoc.current = event.document;
              setDraft(event.document);
            }
            if (event.profile) onProfile?.(event.profile);
            if (event.note && event.note !== note) {
              setLog((prev) => [...prev, { role: "assistant", content: event.note }]);
            }
          }
          if (event.type === "error") throw new Error(event.detail || "Edit failed");
        }
      }
    } catch (err) {
      setError(err.message);
      setHistory((h) => {
        if (!h.length) return h;
        const last = h[h.length - 1];
        setDraft(last);
        return h.slice(0, -1);
      });
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const hasResume = Boolean((draft || profile?.resume_text || "").trim());

  return (
    <div className="resume-studio">
      <div className="page-title">
        <div>
          <h1>Resume</h1>
          <p>
            Preview is the real PDF (multi-page). What you see is what you download.
          </p>
        </div>
        <div className="resume-toolbar">
          <button type="button" className="btn btn-ghost" disabled={!history.length || busy} onClick={undo}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost" disabled={!hasResume || busy} onClick={downloadPdf}>
            Download PDF
          </button>
          <label className="btn btn-solid" style={{ cursor: uploading ? "wait" : "pointer" }}>
            {uploading ? "Uploading…" : hasResume ? "Replace file" : "Upload resume"}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf"
              hidden
              disabled={uploading || busy}
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="resume-split">
        <div className="resume-coach panel">
          <div className="resume-log">
            {!log.length && (
              <div className="empty">
                <strong>Live PDF editor</strong>
                <p className="meta">
                  {hasResume
                    ? "Try: “expand experience into two pages with stronger bullets”"
                    : "Upload a PDF or DOCX to start."}
                </p>
              </div>
            )}
            {log.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && status ? (
              <div className="bubble assistant status-bubble">{status}</div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="resume-chips">
            {CHIPS.map((c) => (
              <button key={c} type="button" className="chip" disabled={busy || !hasResume} onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>

          <form
            className="resume-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={hasResume ? "What should change on the PDF?" : "Upload a resume first"}
              disabled={busy || !hasResume}
            />
            <button className="btn btn-solid" type="submit" disabled={busy || !text.trim() || !hasResume}>
              {busy ? "Writing…" : "Apply"}
            </button>
          </form>
        </div>

        <div className="resume-stage">
          <div className="resume-stage-label meta">
            {busy ? "Updating PDF pages…" : "Exact PDF preview · scroll for more pages"}
          </div>
          <PdfPreview text={draft} streaming={busy} />
        </div>
      </div>
    </div>
  );
}
