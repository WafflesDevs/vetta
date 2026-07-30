import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  formatApiError,
  getToken,
  readResponseJson,
  redirectToLoginOnUnauthorized,
} from "../api";
import Logo from "../Logo";

const STATUS_CYCLE = ["Thinking...", "Querying...", "Generating..."];

const FEATURE_GO = {
  "/app/resume": "Go to Resume →",
  "/app/hub": "Go to Jobs →",
  "/app/quiz": "Go to Quiz →",
};

function goMarkerRe() {
  return /\[\[go:(\/app\/(?:resume|hub|quiz))\|([^\]]+)\]\]/gi;
}
function mdGoLinkRe() {
  return /\[([^\]]+)\]\((\/app\/(?:resume|hub|quiz))\)/gi;
}
function barePathRe() {
  return /\/app\/(?:resume|hub|quiz)/gi;
}

function goButtonLabel(path) {
  return FEATURE_GO[path] || `Go to ${path} →`;
}

function extractRedirects(text, extras = []) {
  const found = new Map();
  for (const item of extras || []) {
    const path = String(item?.path || "").toLowerCase();
    if (FEATURE_GO[path]) found.set(path, { path, label: goButtonLabel(path) });
  }
  const raw = String(text || "");
  for (const match of raw.matchAll(goMarkerRe())) {
    const path = match[1].toLowerCase();
    if (FEATURE_GO[path]) found.set(path, { path, label: goButtonLabel(path) });
  }
  for (const match of raw.matchAll(mdGoLinkRe())) {
    const path = match[2].toLowerCase();
    if (FEATURE_GO[path]) found.set(path, { path, label: goButtonLabel(path) });
  }
  for (const match of raw.matchAll(barePathRe())) {
    const path = match[0].toLowerCase();
    if (FEATURE_GO[path]) found.set(path, { path, label: goButtonLabel(path) });
  }
  return [...found.values()];
}

function displayAssistantText(text) {
  return String(text || "")
    .replace(goMarkerRe(), "")
    .replace(mdGoLinkRe(), "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function CoachRedirects({ redirects }) {
  if (!redirects?.length) return null;
  return (
    <div className="coach-redirects" role="group" aria-label="Open feature">
      {redirects.map((r) => (
        <Link key={r.path} to={r.path} className="coach-go-btn">
          {r.label || goButtonLabel(r.path)}
        </Link>
      ))}
    </div>
  );
}

const SUGGESTIONS = [
  {
    label: "Help with a career choice",
    prompt: "Help me think through a career choice I'm stuck on.",
  },
  {
    label: "Draft a cover letter",
    prompt: "Help me draft a cover letter for a role I'm applying to.",
  },
  {
    label: "Tips to stand out",
    prompt: "Give me concrete tips to stand out in applications and interviews.",
  },
];

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.2l1.35 5.1L18.5 9.7l-5.15 1.4L12 16.3l-1.35-5.2L5.5 9.7l5.15-1.4L12 3.2z"
        fill="currentColor"
        opacity="0.95"
      />
      <path d="M18.2 3.8l.55 2.05 2.05.55-2.05.55-.55 2.05-.55-2.05-2.05-.55 2.05-.55.55-2.05z" fill="currentColor" />
      <path d="M6.4 15.2l.4 1.5 1.5.4-1.5.4-.4 1.5-.4-1.5-1.5-.4 1.5-.4.4-1.5z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.2 11.2L19.5 4.4c.7-.3 1.4.4 1.1 1.1l-6.8 15.3c-.3.7-1.3.6-1.5-.1l-1.8-6.2-6.2-1.8c-.7-.2-.8-1.2-.1-1.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatPage({ profile }) {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Thinking...");
  const [streamText, setStreamText] = useState("");
  const [streamRedirects, setStreamRedirects] = useState([]);
  const [maxChats, setMaxChats] = useState(2);
  const [maxMessages, setMaxMessages] = useState(30);
  const bottomRef = useRef(null);
  const statusIdx = useRef(0);
  const inputRef = useRef(null);

  async function loadChats() {
    const data = await api("/api/chats");
    setChats(data.chats || []);
    if (data.max_chats != null) setMaxChats(data.max_chats);
    return data.chats || [];
  }

  async function loadMessages(id) {
    const data = await api(`/api/chats/${id}/messages`);
    setMessages(data.messages || []);
    if (data.max_messages != null) setMaxMessages(data.max_messages);
  }

  useEffect(() => {
    loadChats()
      .then((list) => {
        if (!chatId && list[0]) navigate(`/app/chat/${list[0].id}`, { replace: true });
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setError("");
    loadMessages(chatId).catch((err) => setError(err.message));
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, streamText, streamRedirects, statusText]);

  useEffect(() => {
    if (!busy || streamText) return;
    statusIdx.current = 0;
    setStatusText(STATUS_CYCLE[0]);
    const id = setInterval(() => {
      statusIdx.current = (statusIdx.current + 1) % STATUS_CYCLE.length;
      setStatusText(STATUS_CYCLE[statusIdx.current]);
    }, 1400);
    return () => clearInterval(id);
  }, [busy, streamText]);

  const atChatCap = chats.length >= maxChats;
  const atMessageCap = messages.length >= maxMessages;
  const chatCapHint = `You can have at most ${maxChats} chats. Delete one to start a new chat.`;
  const messageCapHint = `This chat hit the ${maxMessages} message limit. Delete it to continue.`;

  async function createChat() {
    setError("");
    if (atChatCap) {
      setError(chatCapHint);
      return;
    }
    try {
      const data = await api("/api/chats", { method: "POST" });
      await loadChats();
      navigate(`/app/chat/${data.chat.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeChat(id) {
    setError("");
    try {
      await api(`/api/chats/${id}`, { method: "DELETE" });
      const list = await loadChats();
      if (chatId === id) {
        if (list[0]) navigate(`/app/chat/${list[0].id}`);
        else {
          setMessages([]);
          navigate("/app/chat");
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function sendMessage(content) {
    if (!chatId || !content.trim() || busy || atMessageCap) {
      if (atMessageCap) setError(messageCapHint);
      return;
    }
    setBusy(true);
    setError("");
    setStreamText("");
    setStreamRedirects([]);
    setStatusText("Thinking...");
    const payload = content.trim();
    setText("");
    setMessages((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, role: "user", content: payload },
    ]);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ content: payload }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          redirectToLoginOnUnauthorized();
        }
        const data = await readResponseJson(res);
        throw new Error(formatApiError(res, data));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      let liveRedirects = [];
      let gotFinal = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "status" && event.text) {
            setStatusText(event.text);
          } else if (event.type === "token" && event.text) {
            assembled += event.text;
            setStreamText(assembled);
            setStreamRedirects(extractRedirects(assembled, liveRedirects));
          } else if (event.type === "redirect" && event.path) {
            liveRedirects = extractRedirects(assembled, [
              ...liveRedirects,
              { path: event.path, label: event.label },
            ]);
            setStreamRedirects(liveRedirects);
          } else if (event.type === "final" && event.messages) {
            setMessages(event.messages);
            setStreamText("");
            setStreamRedirects([]);
            gotFinal = true;
          } else if (event.type === "error") {
            throw new Error(event.detail || "Stream failed");
          } else if (event.type === "done") {
            if (event.content && !assembled) {
              assembled = event.content;
              setStreamText(assembled);
            }
            if (Array.isArray(event.redirects) && event.redirects.length) {
              liveRedirects = extractRedirects(assembled, event.redirects);
              setStreamRedirects(liveRedirects);
            } else {
              setStreamRedirects(extractRedirects(assembled, liveRedirects));
            }
          }
        }
      }

      if (!gotFinal) {
        await loadMessages(chatId);
        setStreamText("");
        setStreamRedirects([]);
      }
      await loadChats();
    } catch (err) {
      setError(err.message);
      setText(payload);
      setStreamText("");
      setStreamRedirects([]);
      await loadMessages(chatId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function send(e) {
    e.preventDefault();
    sendMessage(text);
  }

  function useSuggestion(prompt) {
    if (!chatId) {
      setError(atChatCap ? chatCapHint : "Create a chat to start coaching.");
      return;
    }
    if (atMessageCap || busy) return;
    sendMessage(prompt);
  }

  const showEmpty = chatId && messages.length === 0 && !busy && !streamText;
  const showPickChat = !chatId;
  const showChips = (showEmpty || showPickChat) && !busy;

  return (
    <div className="coach-chat">
      <aside className="coach-rail panel">
        <div className="coach-rail-head">
          <strong>Chats</strong>
          <button
            className="btn btn-solid"
            style={{ padding: "0.45rem 0.8rem" }}
            onClick={createChat}
            disabled={atChatCap}
            title={atChatCap ? chatCapHint : "New chat"}
          >
            +
          </button>
        </div>
        <p className="meta" style={{ margin: "0 0 0.7rem" }}>
          {chats.length}/{maxChats} · {messages.length}/{maxMessages} msgs
        </p>
        {atChatCap && (
          <p className="meta" style={{ margin: "0 0 0.7rem" }}>
            Chat limit reached. Delete a chat to start a new one.
          </p>
        )}
        {chats.map((c) => (
          <div className="chat-row" key={c.id}>
            <button
              className={`pick ${c.id === chatId ? "active" : ""}`}
              onClick={() => navigate(`/app/chat/${c.id}`)}
            >
              {c.title}
            </button>
            <button className="x" onClick={() => removeChat(c.id)} title="Delete chat">
              ✕
            </button>
          </div>
        ))}
        {chats.length === 0 && <div className="meta">No chats yet. Hit +</div>}
      </aside>

      <section className="coach-main">
        <header className="coach-header">
          <div className="coach-brand">
            <Logo size={36} />
            <div>
              <p className="coach-eyebrow">Vetta</p>
              <h1>Your coach</h1>
            </div>
          </div>
          <p className="coach-limits meta">
            {chats.length}/{maxChats} chats · {messages.length}/{maxMessages} msgs
          </p>
        </header>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="coach-thread">
          <div className="coach-glow" aria-hidden />

          {showPickChat && (
            <div className="coach-empty">
              <Logo size={44} />
              <h2>Ready when you are</h2>
              <p className="meta">
                {atChatCap
                  ? chatCapHint
                  : "Career advice and cover letters — create a chat to begin."}
              </p>
              {!atChatCap && (
                <button className="btn btn-solid" onClick={createChat}>
                  New chat
                </button>
              )}
            </div>
          )}

          {showEmpty && (
            <div className="coach-empty coach-empty-soft">
              <p className="coach-hello">Hey — I’m your Vetta coach.</p>
              <p className="meta">
                Career advice and cover letters. Job search → Hub · Resume edits → Resume · Interview practice → Quiz.
              </p>
            </div>
          )}

          <div className="coach-messages">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="coach-bubble user">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="coach-bubble assistant">
                  <div className="coach-bubble-text">{displayAssistantText(m.content)}</div>
                  <CoachRedirects redirects={extractRedirects(m.content)} />
                </div>
              )
            )}
            {busy && (
              <div className="coach-bubble assistant">
                {streamText ? (
                  <>
                    <div className="coach-bubble-text">
                      {displayAssistantText(streamText)}
                      <span className="stream-cursor" aria-hidden />
                    </div>
                    <CoachRedirects
                      redirects={extractRedirects(streamText, streamRedirects)}
                    />
                  </>
                ) : (
                  <span className="meta status-pulse">{statusText}</span>
                )}
              </div>
            )}

            {showChips && chatId && (
              <div className="coach-chips" role="list">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="coach-chip"
                    role="listitem"
                    disabled={busy || atMessageCap}
                    onClick={() => useSuggestion(s.prompt)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form className="coach-composer" onSubmit={send}>
          <button
            type="button"
            className="coach-spark"
            onClick={() => {
              if (showChips && chatId) useSuggestion(SUGGESTIONS[0].prompt);
              else inputRef.current?.focus();
            }}
            disabled={!chatId || busy || atMessageCap}
            title="Suggest a prompt"
            aria-label="Suggest a prompt"
          >
            <SparkleIcon />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              atMessageCap
                ? `Limit reached — delete this chat (${maxMessages} msgs)`
                : busy
                  ? statusText
                  : "Message Career Coach"
            }
            disabled={!chatId || busy || atMessageCap}
          />
          <button
            type="submit"
            className="coach-send"
            disabled={!chatId || busy || !text.trim() || atMessageCap}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </form>
        <p className="coach-foot meta">
          Advice only — no job search or resume rewrite here. Vetta can make mistakes; double-check important guidance.
        </p>
      </section>
    </div>
  );
}
