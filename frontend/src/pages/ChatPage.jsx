import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getToken } from "../api";
import Logo from "../Logo";
import MadeBy from "../components/MadeBy";

const STATUS_CYCLE = ["Thinking...", "Querying...", "Generating..."];

export default function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Thinking...");
  const [streamText, setStreamText] = useState("");
  const maxMessages = 30;
  const bottomRef = useRef(null);
  const statusIdx = useRef(0);

  async function loadChats() {
    const data = await api("/api/chats");
    setChats(data.chats || []);
    return data.chats || [];
  }

  async function loadMessages(id) {
    const data = await api(`/api/chats/${id}/messages`);
    setMessages(data.messages || []);
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
  }, [messages, busy, streamText, statusText]);

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

  async function createChat() {
    setError("");
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

  async function send(e) {
    e.preventDefault();
    if (!chatId || !text.trim() || busy) return;
    setBusy(true);
    setError("");
    setStreamText("");
    setStatusText("Thinking...");
    const content = text.trim();
    setText("");
    setMessages((prev) => [
      ...prev,
      { id: `temp-${Date.now()}`, role: "user", content },
    ]);

    try {
      const res = await fetch(`/api/chats/${chatId}/messages/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        let detail = "Request failed";
        try {
          const data = await res.json();
          detail = data.detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
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
          } else           if (event.type === "final" && event.messages) {
            setMessages(event.messages);
            setStreamText("");
            gotFinal = true;
          } else if (event.type === "error") {
            throw new Error(event.detail || "Stream failed");
          } else if (event.type === "done" && event.content && !assembled) {
            assembled = event.content;
            setStreamText(assembled);
          }
        }
      }

      if (!gotFinal) {
        await loadMessages(chatId);
        setStreamText("");
      }
      await loadChats();
    } catch (err) {
      setError(err.message);
      setText(content);
      setStreamText("");
      await loadMessages(chatId).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const showEmpty = chatId && messages.length === 0 && !busy && !streamText;
  const showPickChat = !chatId;

  return (
    <div className="gemini-chat">
      <aside className="gemini-rail panel">
        <div className="gemini-rail-head">
          <strong>Chats</strong>
          <button className="btn btn-solid" style={{ padding: "0.45rem 0.8rem" }} onClick={createChat}>
            +
          </button>
        </div>
        <p className="meta" style={{ margin: "0 0 0.7rem" }}>
          {chats.length}/2 · {messages.length}/{maxMessages} msgs
        </p>
        {chats.map((c) => (
          <div className="chat-row" key={c.id}>
            <button
              className={`pick ${c.id === chatId ? "active" : ""}`}
              onClick={() => navigate(`/app/chat/${c.id}`)}
            >
              {c.title}
            </button>
            <button className="x" onClick={() => removeChat(c.id)}>
              ✕
            </button>
          </div>
        ))}
        {chats.length === 0 && <div className="meta">No chats yet. Hit +</div>}
      </aside>

      <section className="gemini-main">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="gemini-thread">
          <div className="gemini-glow" aria-hidden />

          {showPickChat && (
            <div className="gemini-empty">
              <Logo size={48} />
              <h2>Ready when you are</h2>
              <p className="meta">Create a chat to start coaching with Vetta.</p>
              <button className="btn btn-solid" onClick={createChat}>
                New chat
              </button>
            </div>
          )}

          {showEmpty && (
            <div className="gemini-empty">
              <Logo size={48} />
              <h2>Ready when you are</h2>
              <p className="meta">Ask about jobs, fit scores, resume rewrites, or cover letters.</p>
            </div>
          )}

          <div className="gemini-messages">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="g-bubble user">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="g-bubble assistant">
                  <div className="g-assistant-label" aria-label="Vetta">
                    <Logo size={16} />
                  </div>
                  <div className="g-assistant-body">{m.content}</div>
                </div>
              )
            )}
            {busy && (
              <div className="g-bubble assistant">
                <div className="g-assistant-label" aria-label="Vetta">
                  <Logo size={16} />
                </div>
                <div className="g-assistant-body">
                  {streamText ? (
                    <>
                      {streamText}
                      <span className="stream-cursor" aria-hidden />
                    </>
                  ) : (
                    <span className="meta status-pulse">{statusText}</span>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form className="gemini-composer" onSubmit={send}>
          <button type="button" className="g-plus" onClick={createChat} title="New chat">
            +
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={busy ? statusText : "Ask Vetta"}
            disabled={!chatId || busy}
          />
          <button
            type="submit"
            className="g-send"
            disabled={!chatId || busy || !text.trim()}
            aria-label="Send"
          >
            ↑
          </button>
        </form>
        <p className="gemini-foot meta">Vetta can make mistakes. Double check important career advice.</p>
        <MadeBy className="made-by-chat" />
      </section>
    </div>
  );
}
