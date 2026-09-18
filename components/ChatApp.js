"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const STORAGE_KEY = "qwenlab:conversations";
const ACTIVE_KEY = "qwenlab:activeId";
const SYSTEM_KEY = "qwenlab:systemPrompt";

const DEFAULT_SYSTEM_PROMPT =
  "You are a natural, conversational AI assistant. Talk normally by default. " +
  "If the user asks you to role-play a character, persona, or scenario, fully commit to it " +
  "until they ask to go back to normal conversation \u2014 shift naturally between the two.";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function titleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40)}\u2026` : text || "New chat";
}

function newConversation() {
  return {
    id: makeId(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
  };
}

function CodeBlock({ inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");

  if (inline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, ignore
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-neutral-700/80 hover:bg-neutral-600 text-neutral-100 opacity-70 group-hover:opacity-100 transition"
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export default function ChatApp() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [loaded, setLoaded] = useState(false);
  const [modelLabel, setModelLabel] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const storedConvos = raw ? JSON.parse(raw) : [];
      const storedActive = localStorage.getItem(ACTIVE_KEY);
      const storedSystem = localStorage.getItem(SYSTEM_KEY);

      if (storedConvos.length > 0) {
        setConversations(storedConvos);
        const activeExists = storedConvos.some((c) => c.id === storedActive);
        setActiveId(activeExists ? storedActive : storedConvos[0].id);
      } else {
        const first = newConversation();
        setConversations([first]);
        setActiveId(first.id);
      }
      if (storedSystem) setSystemPrompt(storedSystem);
    } catch {
      const first = newConversation();
      setConversations([first]);
      setActiveId(first.id);
    }
    setLoaded(true);
  }, []);

  // Persist conversations
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, loaded]);

  useEffect(() => {
    if (!loaded || !activeId) return;
    localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(SYSTEM_KEY, systemPrompt);
  }, [systemPrompt, loaded]);

  // Ask the backend which model is actually wired up, so the header
  // shows the truth instead of an assumed name.
  useEffect(() => {
    fetch("/api/model")
      .then((res) => res.json())
      .then((data) => setModelLabel(data.model || "not configured"))
      .catch(() => setModelLabel("unknown"));
  }, []);

  // Autoscroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations, activeId]);

  const active = conversations.find((c) => c.id === activeId) || null;

  function updateActiveMessages(updater) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const messages = updater(c.messages);
        return {
          ...c,
          messages,
          title: c.title === "New chat" ? titleFromMessages(messages) : c.title,
        };
      })
    );
  }

  function handleNewChat() {
    const convo = newConversation();
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    setSidebarOpen(false);
    setError(null);
  }

  function handleDeleteChat(id) {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = newConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(remaining[0].id);
      }
      return remaining;
    });
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming || !active) return;

    setError(null);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMessage = { role: "user", content: text };
    const historyForRequest = [...active.messages, userMessage];

    updateActiveMessages((msgs) => [...msgs, userMessage, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForRequest,
          system: systemPrompt,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = `Request failed (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore parse failure
        }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        updateActiveMessages((msgs) => {
          const next = [...msgs];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "Something went wrong talking to the backend.");
        updateActiveMessages((msgs) => {
          const next = [...msgs];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            next.pop();
          }
          return next;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function autoGrow(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center text-neutral-500 text-sm">
        Loading QwenLab\u2026
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <div
        className={`fixed md:static z-30 inset-y-0 left-0 w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-3 border-b border-neutral-800 flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium py-2 transition"
            type="button"
          >
            + New chat
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-neutral-400 hover:text-neutral-200 px-2"
            type="button"
            aria-label="Close sidebar"
          >
            \u2715
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group mx-2 mb-1 flex items-center rounded-lg px-3 py-2 text-sm cursor-pointer ${
                c.id === activeId
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
              }`}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 ml-2 text-xs"
                type="button"
                aria-label="Delete chat"
              >
                \u2715
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-neutral-800">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="w-full text-left text-xs text-neutral-400 hover:text-neutral-200"
            type="button"
          >
            {settingsOpen ? "\u25be" : "\u25b8"} System prompt / persona
          </button>
          {settingsOpen && (
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="mt-2 w-full rounded-md bg-neutral-800 border border-neutral-700 text-xs p-2 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            />
          )}
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-neutral-300"
            type="button"
            aria-label="Open sidebar"
          >
            \u2630
          </button>
          <div className="flex flex-col leading-tight">
            <h1 className="text-sm font-semibold tracking-wide text-neutral-200">
              QwenLab
            </h1>
            {modelLabel && (
              <span className="text-[11px] text-neutral-500">
                Model: {modelLabel}
              </span>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {(!active || active.messages.length === 0) && (
            <div className="h-full flex items-center justify-center text-center text-neutral-500 text-sm px-6">
              Say hello, ask a question, or try \u201cRole-play as \u2026\u201d to switch things up.
            </div>
          )}
          {active &&
            active.messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`markdown-body max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-neutral-800 text-neutral-100"
                  }`}
                >
                  {m.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{ code: CodeBlock }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="inline-flex gap-1 items-center text-neutral-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" />
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-red-950 border border-red-800 text-red-200 text-xs px-3 py-2">
            {error}
          </div>
        )}

        <div className="border-t border-neutral-800 p-3">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoGrow(e);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message QwenLab\u2026"
              rows={1}
              className="flex-1 resize-none rounded-xl bg-neutral-900 border border-neutral-700 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 max-h-[200px]"
            />
            {isStreaming ? (
              <button
                onClick={handleStop}
                className="rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white text-sm font-medium px-4 py-2.5 transition"
                type="button"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 text-white text-sm font-medium px-4 py-2.5 transition"
                type="button"
              >
                Send
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-neutral-600 mt-2">
            Enter to send \u00b7 Shift+Enter for a new line
          </p>
        </div>
      </div>
    </div>
  );
}
