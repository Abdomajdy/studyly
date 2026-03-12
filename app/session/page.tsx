"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { createSession, endSession } from "@/services/session.service"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import "katex/dist/katex.min.css"

// ── Mermaid diagram renderer ──────────────────────────────────────────────────
// Uses the mermaid package directly (dynamic import) — rehype-mermaid is
// designed for server/build-time use; client-side rendering needs this approach.
let _mermaidReady = false

function MermaidDiagram({ code }: { code: string }) {
  const ref  = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const m = (await import("mermaid")).default
        if (!_mermaidReady) {
          m.initialize({
            startOnLoad: false,
            theme: "base",
            themeVariables: {
              background:           "#0a0a0b",
              mainBkg:              "#1a1a1e",
              nodeBorder:           "#2a2a2e",
              lineColor:            "#c8a96e",
              textColor:            "#f0ede8",
              edgeLabelBackground:  "#111113",
              primaryColor:         "#1a1a1e",
              primaryTextColor:     "#f0ede8",
              primaryBorderColor:   "#2a2a2e",
              secondaryColor:       "#111113",
              tertiaryColor:        "#0a0a0b",
            },
          })
          _mermaidReady = true
        }
        const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await m.render(id, code)
        if (alive && ref.current) ref.current.innerHTML = svg
      } catch {
        if (alive) setErr(true)
      }
    })()
    return () => { alive = false }
  }, [code])

  if (err) {
    return (
      <pre style={{
        fontFamily: "DM Mono, monospace", fontSize: "12px", lineHeight: "1.6",
        background: "#1e1e1e", border: "1px solid var(--border)",
        padding: "20px 24px", overflowX: "auto", marginBottom: "16px",
        color: "var(--text-3)",
      }}>{code}</pre>
    )
  }

  return (
    <div ref={ref} style={{
      background: "#1a1a1e", border: "1px solid var(--border)",
      padding: "24px", marginBottom: "16px",
      overflowX: "auto", display: "flex", justifyContent: "center",
    }} />
  )
}

// ── Copy button for code blocks ───────────────────────────────────────────────
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(code) } catch { /* */ }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      style={{
        position: "absolute", top: "10px", right: "10px", zIndex: 1,
        background: "rgba(26,26,30,0.9)", border: "1px solid var(--border)",
        color: copied ? "var(--success)" : "var(--text-3)",
        fontFamily: "DM Mono, monospace", fontSize: "10px",
        letterSpacing: "0.08em", padding: "4px 10px",
        cursor: "pointer", transition: "color 0.2s",
      }}
    >
      {copied ? "copied ✓" : "copy"}
    </button>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; content: string }

// ── Main component ────────────────────────────────────────────────────────────
export default function SessionPage() {
  const router  = useRouter()
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState("")
  const [topic,     setTopic]     = useState("")
  const [topicSet,  setTopicSet]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [visible,   setVisible]   = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId,    setUserId]    = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Effects (untouched) ────────────────────────────────────────────────────
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      setUserId(user.id)
    }
    getUser()
    setTimeout(() => setVisible(true), 100)
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Session logic (untouched) ──────────────────────────────────────────────
  async function startSession() {
    if (!topic.trim()) return
    setTopicSet(true)
    setLoading(true)
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Let's start. Give me a quick honest assessment of what I need to focus on for this topic, then ask me the first question.", notes: "", topic })
      })
      if (!res.ok) { const err = await res.json(); console.error("[startSession] API error:", err); setLoading(false); return }
      const data = await res.json()
      setMessages([{ role: "assistant", content: data.answer }])
    } catch (error) {
      console.error("[startSession] error:", error)
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    setLoading(true)
    try {
      if (!sessionId) {
        if (!userId) { console.error("[SessionPage] Missing userId"); setLoading(false); return }
        const newSessionId = await createSession(userId, topic)
        if (!newSessionId) { console.error("[SessionPage] Failed to create session"); setLoading(false); return }
        setSessionId(newSessionId)
      }
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, notes: "", topic, history: messages.slice(0, -1) })
      })
      if (!res.ok) { const err = await res.json(); console.error("[sendMessage] API error:", err); setLoading(false); return }
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", content: data.answer }])
    } catch (error) {
      console.error("[SessionPage] sendMessage error:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleEndSession() {
    if (!sessionId) { router.push("/dashboard"); return }
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant")
    const summary = lastAssistant?.content ?? ""
    try {
      await endSession(sessionId, summary)
    } catch (error) {
      console.error("[SessionPage] endSession error:", error)
    } finally {
      router.push("/dashboard")
    }
  }

  // ── Topic screen (untouched) ───────────────────────────────────────────────
  if (!topicSet) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>session</p>
          <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "8px", letterSpacing: "-0.02em" }}>What are we locking in on?</h1>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>Topic, chapter, concept. Be specific.</p>
          <input type="text" placeholder="e.g. Fourier transforms, thermodynamics..." value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && startSession()} autoFocus style={{ width: "100%", background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none", marginBottom: "12px", transition: "border-color 0.2s" }} onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          <button onClick={startSession} disabled={!topic.trim()} style={{ width: "100%", background: topic.trim() ? "var(--text)" : "var(--bg-3)", color: topic.trim() ? "var(--bg)" : "var(--text-3)", border: "none", padding: "16px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: topic.trim() ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px", transition: "all 0.2s" }}>Lock In →</button>
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", width: "100%", padding: "8px" }}>← back</button>
        </div>
      </div>
    )
  }

  // ── Session screen ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* Header (untouched) */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          <p style={{ color: "var(--text)", fontSize: "13px", letterSpacing: "0.05em" }}>{topic}</p>
        </div>
        <button onClick={handleEndSession} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em" }}>end session</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "56px 48px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "40px" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", opacity: 0, animation: "fadeIn 0.4s ease forwards", animationDelay: "0.05s" }}>
              <div style={{
                maxWidth: msg.role === "user" ? "65%" : "100%",
                padding: msg.role === "user" ? "16px 22px" : "0",
                background: msg.role === "user" ? "var(--bg-3)" : "transparent",
                border: msg.role === "user" ? "1px solid var(--border)" : "none",
                color: msg.role === "user" ? "var(--text-2)" : "var(--text)",
                fontSize: msg.role === "assistant" ? "19px" : "15px",
                lineHeight: msg.role === "assistant" ? "2.0" : "1.7",
                fontFamily: msg.role === "assistant" ? "DM Serif Display, serif" : "DM Mono, monospace",
                fontWeight: 400,
              }}>
                {msg.role === "assistant" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        // ── Paragraph ────────────────────────────────────────
                        p: ({ children }) => (
                          <p style={{ marginBottom: "16px", lineHeight: "2.0", fontSize: "19px", fontFamily: "DM Serif Display, serif", color: "var(--text)" }}>
                            {children}
                          </p>
                        ),

                        // ── Code (inline + block + mermaid) ──────────────────
                        code: ({ children, className }) => {
                          const match    = /language-(\w+)/.exec(className ?? "")
                          const language = match?.[1] ?? ""
                          const isBlock  = !!className
                          const codeStr  = String(children).replace(/\n$/, "")

                          // SVG block
                          if (language === "svg") {
                            return (
                              <div
                                style={{
                                  background: "var(--bg-3)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "4px",
                                  padding: "24px",
                                  margin: "16px 0",
                                  display: "flex",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  overflowX: "auto",
                                }}
                                dangerouslySetInnerHTML={{ __html: codeStr }}
                              />
                            )
                          }

                          // Inline code
                          if (!isBlock) {
                            return (
                              <code style={{ fontFamily: "DM Mono, monospace", fontSize: "13px", background: "var(--bg-2)", padding: "2px 6px", color: "var(--accent)" }}>
                                {children}
                              </code>
                            )
                          }

                          // Mermaid diagram
                          if (language === "mermaid") {
                            return <MermaidDiagram code={codeStr} />
                          }

                          // Syntax-highlighted code block
                          const lineCount = codeStr.split("\n").length
                          return (
                            <div style={{ position: "relative", marginBottom: "16px" }}>
                              <CopyButton code={codeStr} />
                              <SyntaxHighlighter
                                language={language || "text"}
                                style={vscDarkPlus}
                                showLineNumbers={lineCount > 5}
                                customStyle={{
                                  margin: 0,
                                  borderRadius: 0,
                                  border: "1px solid var(--border)",
                                  fontSize: "13px",
                                  lineHeight: "1.7",
                                  fontFamily: "DM Mono, monospace",
                                  paddingTop: lineCount > 5 ? "40px" : "36px",
                                }}
                                codeTagProps={{ style: { fontFamily: "DM Mono, monospace" } }}
                              >
                                {codeStr}
                              </SyntaxHighlighter>
                            </div>
                          )
                        },

                        // ── Pre passthrough (code component handles rendering) ─
                        pre: ({ children }) => <>{children}</>,

                        // ── Lists (untouched) ─────────────────────────────────
                        ul: ({ children }) => (
                          <ul style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li style={{ lineHeight: "1.9", fontSize: "18px", fontFamily: "DM Serif Display, serif", color: "var(--text)" }}>{children}</li>
                        ),

                        // ── Table — scrollable wrapper ─────────────────────────
                        table: ({ children }) => (
                          <div style={{ overflowX: "auto", marginBottom: "16px", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Mono, monospace", fontSize: "13px", minWidth: "400px" }}>
                              {children}
                            </table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--accent)", textAlign: "left", fontWeight: 500, letterSpacing: "0.05em" }}>{children}</th>
                        ),
                        td: ({ children }) => (
                          <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--bg-3)", color: "var(--text-2)", lineHeight: "1.6" }}>{children}</td>
                        ),

                        // ── Blockquote — callout card ──────────────────────────
                        blockquote: ({ children }) => (
                          <div style={{
                            background: "var(--bg-3)",
                            borderLeft: "3px solid var(--accent)",
                            padding: "18px 22px",
                            marginBottom: "16px",
                            fontSize: "20px",
                            fontFamily: "DM Serif Display, serif",
                            color: "var(--text)",
                            lineHeight: "1.8",
                          }}>
                            {children}
                          </div>
                        ),

                        // ── Inline (untouched) ─────────────────────────────────
                        strong: ({ children }) => (
                          <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <p style={{ color: "var(--text-3)", fontSize: "16px", fontStyle: "italic", fontFamily: "DM Serif Display, serif" }}>thinking...</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input (untouched) */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "24px 48px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", width: "100%", display: "flex", gap: "12px" }}>
          <input
            type="text"
            placeholder="reply..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            style={{ flex: 1, background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? "var(--text)" : "var(--bg-3)", color: input.trim() && !loading ? "var(--bg)" : "var(--text-3)", border: "none", padding: "16px 28px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: input.trim() && !loading ? "pointer" : "not-allowed", letterSpacing: "0.05em", transition: "all 0.2s" }}
          >send</button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
