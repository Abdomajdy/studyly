"use client"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import ParticleCanvas from "./components/ParticleCanvas"
import ScrollRail from "./components/ScrollRail"
import AmbientStats from "./components/AmbientStats"

const ease = "cubic-bezier(0.0, 0.0, 0.2, 1)"

const RAIL_SECTIONS = [
  { label: "lock in",  id: "hero" },
  { label: "session",  id: "preview" },
  { label: "patterns", id: "compounding" },
  { label: "mastery",  id: "mastery" },
  { label: "start",    id: "cta" },
]

const mockMessages = [
  { role: "assistant", content: "ok. linear algebra — last session you blanked on eigenvalues when the pressure was on. let's actually fix that today. what happens geometrically when you apply a matrix to an eigenvector?" },
  { role: "user",      content: "it stays on the same line but gets scaled?" },
  { role: "assistant", content: "exactly — scaled by λ, the eigenvalue. now real talk: what's actually going wrong when this shows up on an exam?" },
  { role: "user",      content: "i keep freezing when i see this in the exam. like i know it and then i just go blank." },
  { role: "assistant", content: "that's a retrieval problem, not a knowledge problem. let's build a faster path in. in your own words — what is det(A - λI) = 0 actually asking for?" },
  { role: "user",      content: "we're looking for values of lambda where the matrix collapses space into a lower dimension?" },
  { role: "assistant", content: "yes. that's the real understanding — when det is zero, there's a direction that gets mapped to zero. that's why λ exists. write that sentence down. say it before every eigenvalue problem. the freeze goes away." },
]

interface MasteryRow { topic: string; score: number; label: string; delta: string; meaning: string }
const masteryData: MasteryRow[] = [
  { topic: "Fourier Transforms", score: 84, label: "strong", delta: "↑ 12 pts this week",  meaning: "ready for exam questions on this" },
  { topic: "Laplace Transform",  score: 51, label: "shaky",  delta: "↑ 5 pts this week",   meaning: "one more session closes this" },
  { topic: "Z-Transform",        score: 23, label: "weak",   delta: "↑ 8 pts this week",   meaning: "this is the gap. needs work tonight." },
  { topic: "Nyquist Theorem",    score: 62, label: "shaky",  delta: "↑ 3 pts this week",   meaning: "shaky but there. revisit before exam." },
]

type TryMsg = { role: string; content: string }

export default function LandingPage() {
  const router = useRouter()

  // ── Existing state ──────────────────────────────────────────────────────────
  const [visible,          setVisible]          = useState(false)
  const [shownMessages,    setShownMessages]    = useState(0)
  const [scrolled,         setScrolled]         = useState(false)
  const [masteryVisible,   setMasteryVisible]   = useState(false)
  const [hoveredMasteryRow,setHoveredMasteryRow]= useState<number | null>(null)

  // ── New state ───────────────────────────────────────────────────────────────
  const [scrollProgress,   setScrollProgress]   = useState(0)
  const [barsFilled,       setBarsFilled]       = useState(false)
  const [soundOn,          setSoundOn]          = useState(false)
  const [previewMode,      setPreviewMode]      = useState<"watch" | "try">("watch")
  const [tryMessages,      setTryMessages]      = useState<TryMsg[]>([])
  const [tryInput,         setTryInput]         = useState("")
  const [tryAiCount,       setTryAiCount]       = useState(0)
  const [isTryLoading,     setIsTryLoading]     = useState(false)
  const [showSignupOverlay,setShowSignupOverlay]= useState(false)

  // ── Refs ────────────────────────────────────────────────────────────────────
  const compoundingRef       = useRef<HTMLElement>(null)
  const masteryRef           = useRef<HTMLElement>(null)
  const ctaRef               = useRef<HTMLElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const tryContainerRef      = useRef<HTMLDivElement>(null)
  const audioCtxRef          = useRef<AudioContext | null>(null)
  const mainGainRef          = useRef<GainNode | null>(null)
  const oscRefs              = useRef<OscillatorNode[]>([])

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Hero fade-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [])

  // Auto-play session preview
  useEffect(() => {
    if (!visible || previewMode !== "watch") return
    if (shownMessages < mockMessages.length) {
      const delay = shownMessages === 0 ? 800 : 1600 + shownMessages * 200
      const t = setTimeout(() => setShownMessages(n => n + 1), delay)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => setShownMessages(0), 60000)
      return () => clearTimeout(t)
    }
  }, [visible, shownMessages, previewMode])

  // Auto-scroll watch-mode messages
  useEffect(() => {
    messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: "smooth" })
  }, [shownMessages])

  // Auto-scroll try-it messages
  useEffect(() => {
    tryContainerRef.current?.scrollTo({ top: tryContainerRef.current.scrollHeight, behavior: "smooth" })
  }, [tryMessages])

  // Scroll: nav + progress bar
  useEffect(() => {
    const onScroll = () => {
      const top = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      setScrolled(top > 10)
      setScrollProgress(max > 0 ? top / max : 0)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // IntersectionObserver for section fade-ins
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("section-visible")
            if (entry.target === masteryRef.current) setMasteryVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.08 }
    )
    ;[compoundingRef, masteryRef, ctaRef].forEach(r => { if (r.current) observer.observe(r.current) })
    return () => observer.disconnect()
  }, [])

  // Breathing bars — start after fill animation completes
  useEffect(() => {
    if (!masteryVisible) return
    const t = setTimeout(() => setBarsFilled(true), 2200)
    return () => clearTimeout(t)
  }, [masteryVisible])

  // Sound cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) { audioCtxRef.current.close() }
    }
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const sendTryMessage = async () => {
    if (!tryInput.trim() || isTryLoading) return
    const msg = tryInput.trim()
    setTryInput("")
    const history = [...tryMessages, { role: "user", content: msg }]
    setTryMessages(history)
    setIsTryLoading(true)
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, notes: "", topic: "linear algebra", history: tryMessages }),
      })
      const data = await res.json()
      if (data.answer) {
        setTryMessages([...history, { role: "assistant", content: data.answer }])
        const n = tryAiCount + 1
        setTryAiCount(n)
        if (n >= 2) setTimeout(() => setShowSignupOverlay(true), 700)
      }
    } catch (e) { console.error("[tryIt]", e) }
    finally { setIsTryLoading(false) }
  }

  const toggleSound = () => {
    if (soundOn) {
      const ctx = audioCtxRef.current
      const gain = mainGainRef.current
      if (ctx && gain) {
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1)
        setTimeout(() => {
          oscRefs.current.forEach(o => { try { o.stop() } catch { /* already stopped */ } })
          oscRefs.current = []
          ctx.close()
          audioCtxRef.current = null
        }, 1100)
      }
      setSoundOn(false)
      return
    }
    type WA = Window & { webkitAudioContext?: typeof AudioContext }
    const ACtx = window.AudioContext || (window as WA).webkitAudioContext
    if (!ACtx) return
    const ctx = new ACtx()
    audioCtxRef.current = ctx

    const master = ctx.createGain()
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2)
    master.connect(ctx.destination)
    mainGainRef.current = master

    // Simple reverb impulse
    const conv = ctx.createConvolver()
    const len  = ctx.sampleRate * 2
    const buf  = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
    }
    conv.buffer = buf

    const dry = ctx.createGain(); dry.gain.value = 0.65
    const wet = ctx.createGain(); wet.gain.value = 0.35
    dry.connect(master); conv.connect(wet); wet.connect(master)

    // Four-voice 40hz drone
    const voices: [number, number][] = [[40, 1.0], [80, 0.32], [40.22, 0.22], [120, 0.1]]
    voices.forEach(([freq, g]) => {
      const osc = ctx.createOscillator()
      osc.type = "sine"; osc.frequency.value = freq
      const og = ctx.createGain(); og.gain.value = g
      osc.connect(og); og.connect(dry); og.connect(conv)
      osc.start(); oscRefs.current.push(osc)
    })
    setSoundOn(true)
  }

  const resetPreviewMode = (mode: "watch" | "try") => {
    setPreviewMode(mode)
    if (mode === "watch") {
      setTryMessages([]); setTryAiCount(0); setShowSignupOverlay(false); setTryInput("")
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>

      {/* Full-page particle constellation */}
      <ParticleCanvas />

      {/* Noise texture overlay */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
        opacity: 0.035,
      }} />

      {/* #7 — Scroll progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", zIndex: 200, pointerEvents: "none" }}>
        <div style={{
          height: "100%", background: "var(--accent)", opacity: 0.7,
          width: `${scrollProgress * 100}%`,
          transition: "width 0.1s linear",
        }} />
      </div>

      {/* #1 — Left scroll rail */}
      <ScrollRail sections={RAIL_SECTIONS} />

      {/* #2 — Right ambient stats */}
      <AmbientStats />



      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Sticky Nav ──────────────────────────────────────────────────── */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "22px 80px",
          background: scrolled ? "rgba(10,10,11,0.92)" : "transparent",
          borderBottom: scrolled ? "1px solid rgba(42,42,46,0.9)" : "1px solid transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          transition: `background 0.5s ${ease}, border-color 0.5s ${ease}, backdrop-filter 0.5s ${ease}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", display: "inline-block", flexShrink: 0 }} />
            <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "20px", letterSpacing: "-0.01em" }}>
              stud<span style={{ color: "var(--accent)" }}>i</span>ly
            </p>
          </div>
          <div className="nav-desktop" style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            <button onClick={() => router.push("/login")} style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontFamily: "DM Mono, monospace", fontSize: "13px", cursor: "pointer",
              letterSpacing: "0.05em", transition: `color 0.3s ${ease}`,
            }}
              onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
              onMouseOut={e  => (e.currentTarget.style.color = "var(--text-3)")}
            >log in</button>
            <button onClick={() => router.push("/register")} style={{
              background: "var(--text)", color: "var(--bg)", border: "none",
              padding: "11px 26px", fontFamily: "DM Mono, monospace", fontSize: "12px",
              fontWeight: 500, cursor: "pointer", letterSpacing: "0.06em",
              transition: `opacity 0.3s ${ease}`,
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={e  => (e.currentTarget.style.opacity = "1")}
            >get started →</button>
          </div>
          <button className="nav-mobile" onClick={() => router.push("/register")} style={{
            display: "none", background: "none", border: "none",
            color: "var(--text-2)", fontFamily: "DM Mono, monospace",
            fontSize: "13px", cursor: "pointer", letterSpacing: "0.05em",
          }}>get started →</button>
        </nav>

        <div style={{ height: "74px" }} />

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section id="hero" style={{
          maxWidth: "1200px", margin: "0 auto",
          padding: "100px 80px 80px",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(16px)",
          transition: `opacity 0.5s ${ease}, transform 0.5s ${ease}`,
          position: "relative",
        }} className="section-padded">
          {/* Radial glow */}
          <div aria-hidden="true" style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 60% at 30% 40%, rgba(200,169,110,0.055) 0%, transparent 70%)",
          }} />
            <p style={{
              color: "var(--accent)", fontFamily: "DM Mono, monospace",
              fontSize: "11px", letterSpacing: "0.2em", marginBottom: "36px",
              textTransform: "uppercase", opacity: 0.75,
            }}>— for the engineering student at 11pm</p>

            <h1 className="h1-hero" style={{
              fontFamily: "DM Serif Display, serif",
              fontSize: "clamp(40px, 6vw, 76px)",
              letterSpacing: "-0.035em", lineHeight: 1.0, marginBottom: "18px",
            }}>
              It&rsquo;s 11pm. Exam tomorrow.<br />
              <span style={{ color: "var(--accent)", fontStyle: "italic" }}>You don&rsquo;t know what you don&rsquo;t know.</span>
            </h1>

            <p style={{
              color: "var(--text-3)", fontFamily: "DM Mono, monospace",
              fontSize: "14px", lineHeight: 1.7, marginBottom: "26px",
            }}>
              studyly figures out the gaps. then closes them.
            </p>

            <p style={{
              color: "var(--text-3)", fontFamily: "DM Mono, monospace",
              fontSize: "11px", letterSpacing: "0.12em", marginBottom: "40px",
            }}>
              847 sessions this week · avg session: 38 min · topics closed: 2,341
            </p>

            <p className="hero-body" style={{
              color: "var(--text-2)", fontSize: "16px", lineHeight: "2",
              maxWidth: "520px", fontFamily: "DM Mono, monospace", fontWeight: 300,
              marginBottom: "56px",
            }}>
              not a tutor. not a quiz app. the friend who&rsquo;s done the past papers,
              knows what the prof always asks, and won&rsquo;t let you lie to yourself
              about what you know.
            </p>

            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
              <button onClick={() => router.push("/register")} className="hero-cta-btn" style={{
                background: "var(--text)", color: "var(--bg)", border: "none",
                padding: "18px 52px", fontFamily: "DM Mono, monospace",
                fontSize: "13px", fontWeight: 500, cursor: "pointer",
                letterSpacing: "0.08em",
                transition: `opacity 0.3s ${ease}, box-shadow 0.3s ${ease}`,
              }}
                onMouseOver={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.boxShadow = "0 0 48px rgba(200,169,110,0.22)" }}
                onMouseOut={e  => { e.currentTarget.style.opacity = "1";    e.currentTarget.style.boxShadow = "none" }}
              >lock in →</button>
              <button onClick={() => router.push("/login")} style={{
                background: "transparent", color: "var(--text-3)",
                border: "1px solid var(--border)", padding: "18px 52px",
                fontFamily: "DM Mono, monospace", fontSize: "13px", cursor: "pointer",
                letterSpacing: "0.08em", transition: `all 0.3s ${ease}`,
              }}
                onMouseOver={e => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
                onMouseOut={e  => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
              >already have an account</button>
            </div>
        </section>

        {/* Subtle rule */}
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 80px" }} className="section-padded">
          <div style={{ borderTop: "1px solid rgba(42,42,46,0.4)" }} />
        </div>

        {/* ── Session Preview ───────────────────────────────────────────────── */}
        <section id="preview" style={{
          maxWidth: "1200px", margin: "0 auto", padding: "48px 80px 128px",
          opacity: visible ? 1 : 0,
          transition: `opacity 0.5s ${ease} 0.25s`,
        }} className="section-padded preview-section">
          <div className="session-preview-window" style={{
            border: "1px solid var(--border)", position: "relative", overflow: "hidden",
          }}>
            {/* Window chrome */}
            <div style={{
              borderBottom: "1px solid var(--border)", padding: "14px 20px",
              display: "flex", alignItems: "center", gap: "12px",
              background: "var(--bg-2)",
            }}>
              <div style={{ display: "flex", gap: "7px" }}>
                {(["var(--danger)", "var(--accent-dim)", "var(--success)"] as string[]).map((c, i) => (
                  <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.45 }} />
                ))}
              </div>
              <div style={{ width: "1px", height: "14px", background: "var(--border)" }} />
              <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em" }}>
                session — linear algebra · session 4
              </p>
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                {/* #4 — Mode toggle */}
                <button
                  onClick={() => resetPreviewMode(previewMode === "watch" ? "try" : "watch")}
                  style={{
                    background: previewMode === "try" ? "var(--bg-3)" : "none",
                    border: `1px solid ${previewMode === "try" ? "var(--accent)" : "var(--border)"}`,
                    color: previewMode === "try" ? "var(--accent)" : "var(--text-3)",
                    fontSize: "10px", fontFamily: "DM Mono, monospace",
                    padding: "3px 10px", cursor: "pointer",
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    transition: `all 0.3s ${ease}`,
                  }}
                >
                  {previewMode === "watch" ? "try it" : "watch"}
                </button>
                <span style={{
                  color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  border: "1px solid var(--accent-dim)", padding: "3px 9px", opacity: 0.65,
                }}>live</span>
              </div>
            </div>

            {/* Messages area */}
            {previewMode === "watch" ? (
              <div ref={messagesContainerRef} className="preview-messages" style={{
                padding: "44px 44px 64px", display: "flex", flexDirection: "column",
                gap: "28px", height: "440px", overflowY: "auto",
              }}>
                {mockMessages.slice(0, shownMessages).map((msg, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    opacity: i === shownMessages - 1 ? 0 : 1,
                    animation: i === shownMessages - 1 ? `fadeIn 0.6s ${ease} forwards` : "none",
                  }}>
                    <div style={{
                      maxWidth: "72%",
                      padding: msg.role === "user" ? "13px 18px" : "0",
                      background: msg.role === "user" ? "var(--bg-3)" : "transparent",
                      border: msg.role === "user" ? "1px solid var(--border)" : "none",
                      color: msg.role === "user" ? "var(--text-2)" : "var(--text)",
                      fontSize: msg.role === "assistant" ? "18px" : "14px",
                      lineHeight: "1.8",
                      fontFamily: msg.role === "assistant" ? "DM Serif Display, serif" : "DM Mono, monospace",
                    }}>{msg.content}</div>
                  </div>
                ))}
                {shownMessages > 0 && shownMessages < mockMessages.length && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", height: "24px", paddingLeft: "2px" }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Try-it mode */
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div ref={tryContainerRef} className="preview-messages" style={{
                  padding: "32px 36px 24px", display: "flex", flexDirection: "column",
                  gap: "24px", height: "360px", overflowY: "auto",
                }}>
                  {tryMessages.length === 0 && (
                    <p style={{
                      color: "var(--text-3)", fontSize: "14px", fontFamily: "DM Serif Display, serif",
                      fontStyle: "italic", opacity: 0.7,
                    }}>
                      ask me anything about linear algebra. i&rsquo;ll answer like i&rsquo;m actually in the room.
                    </p>
                  )}
                  {tryMessages.map((msg, i) => (
                    <div key={i} style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    }}>
                      <div style={{
                        maxWidth: "80%",
                        padding: msg.role === "user" ? "12px 16px" : "0",
                        background: msg.role === "user" ? "var(--bg-3)" : "transparent",
                        border: msg.role === "user" ? "1px solid var(--border)" : "none",
                        color: msg.role === "user" ? "var(--text-2)" : "var(--text)",
                        fontSize: msg.role === "assistant" ? "17px" : "14px",
                        lineHeight: "1.8",
                        fontFamily: msg.role === "assistant" ? "DM Serif Display, serif" : "DM Mono, monospace",
                      }}>{msg.content}</div>
                    </div>
                  ))}
                  {isTryLoading && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", height: "24px" }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  )}
                </div>

                {/* Input */}
                <div style={{
                  borderTop: "1px solid var(--border)", padding: "12px 16px",
                  display: "flex", gap: "8px", background: "var(--bg-2)",
                }}>
                  <input
                    value={tryInput}
                    onChange={e => setTryInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && sendTryMessage()}
                    placeholder="ask about linear algebra..."
                    disabled={isTryLoading}
                    style={{
                      flex: 1, background: "var(--bg-3)", color: "var(--text)",
                      border: "1px solid var(--border)", padding: "10px 14px",
                      fontFamily: "DM Mono, monospace", fontSize: "13px", outline: "none",
                    }}
                    onFocus={e  => (e.currentTarget.style.borderColor = "var(--text-3)")}
                    onBlur={e   => (e.currentTarget.style.borderColor = "var(--border)")}
                  />
                  <button
                    onClick={sendTryMessage}
                    disabled={!tryInput.trim() || isTryLoading}
                    style={{
                      background: tryInput.trim() && !isTryLoading ? "var(--text)" : "var(--bg-3)",
                      color: tryInput.trim() && !isTryLoading ? "var(--bg)" : "var(--text-3)",
                      border: "none", padding: "10px 18px", cursor: "pointer",
                      fontFamily: "DM Mono, monospace", fontSize: "13px",
                      transition: `all 0.2s ${ease}`,
                    }}
                  >→</button>
                </div>

                {/* #4 — Signup overlay after 2 responses */}
                {showSignupOverlay && (
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "rgba(10,10,11,0.84)",
                    backdropFilter: "blur(10px)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: "16px", zIndex: 10,
                    animation: `fadeIn 0.5s ${ease} forwards`,
                  }}>
                    <p style={{
                      color: "var(--text)", fontSize: "22px",
                      fontFamily: "DM Serif Display, serif",
                      textAlign: "center", lineHeight: 1.4,
                    }}>want to keep going?</p>
                    <p style={{
                      color: "var(--text-2)", fontSize: "12px",
                      fontFamily: "DM Mono, monospace", letterSpacing: "0.05em",
                    }}>takes 30 seconds to start.</p>
                    <button
                      onClick={() => router.push("/register")}
                      style={{
                        background: "var(--text)", color: "var(--bg)", border: "none",
                        padding: "14px 44px", fontFamily: "DM Mono, monospace",
                        fontSize: "13px", fontWeight: 500, cursor: "pointer",
                        letterSpacing: "0.08em", marginTop: "8px",
                        transition: `opacity 0.3s ${ease}`,
                      }}
                      onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
                      onMouseOut={e  => (e.currentTarget.style.opacity = "1")}
                    >lock in →</button>
                  </div>
                )}
              </div>
            )}

            {/* Gradient fade — watch mode only */}
            {previewMode === "watch" && (
              <div aria-hidden="true" style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "130px",
                background: "linear-gradient(to bottom, transparent, var(--bg))",
                pointerEvents: "none", zIndex: 3,
              }} />
            )}
          </div>

          <p style={{
            color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace",
            letterSpacing: "0.08em", marginTop: "20px", textAlign: "center",
          }}>
            {previewMode === "watch"
              ? "it remembers what you fumbled last time. it doesn\u2019t let you skip it."
              : "this is the real thing. not a demo."}
          </p>
        </section>

        {/* ── Compounding ───────────────────────────────────────────────────── */}
        <section id="compounding" ref={compoundingRef} className="fade-section" style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 80px" }} className="section-padded">
            <div className="two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "100px", alignItems: "start" }}>
              <div>
                <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.18em", marginBottom: "28px", textTransform: "uppercase" }}>
                  it gets more accurate over time
                </p>
                <h2 className="h2-section" style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(32px, 3.5vw, 50px)", letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: "24px" }}>
                  The longer you use it,<br />
                  <span style={{ fontStyle: "italic" }}>the more it knows you.</span>
                </h2>
                <p style={{ color: "var(--text-2)", fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300, lineHeight: "2" }}>
                  not fake personalization. actual patterns. it knows you always blank on carnot efficiency.
                  it knows worked examples land better for you than definitions.
                  after a while it just — gets it.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {[
                  { session: "session 1",             text: "wait this actually gets me." },
                  { session: "session 5",             text: "it remembered the thing i kept getting wrong. didn\u2019t let me skip it." },
                  { session: "session 20",            text: "it knows my patterns better than i do at this point. the personalization is real." },
                  { session: "the night before finals", text: "i wasn\u2019t panicking. that was new." },
                ].map((item, i) => (
                  <div key={i} style={{
                    background: "var(--bg-2)", padding: "30px 30px 30px 26px",
                    borderLeft: "2px solid var(--accent-dim)",
                    transition: `background 0.3s ${ease}, border-color 0.3s ${ease}, box-shadow 0.3s ${ease}`,
                    cursor: "default",
                  }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = "var(--bg-3)"
                      e.currentTarget.style.borderColor = "var(--accent)"
                      if (i === 3) e.currentTarget.style.boxShadow = "-4px 0 24px rgba(200,169,110,0.18)"
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = "var(--bg-2)"
                      e.currentTarget.style.borderColor = "var(--accent-dim)"
                      e.currentTarget.style.boxShadow = "none"
                    }}
                  >
                    <p style={{ color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "14px", opacity: 0.75 }}>
                      {item.session}
                    </p>
                    <p style={{ color: "var(--text)", fontSize: "16px", fontFamily: "DM Serif Display, serif", lineHeight: 1.75, fontStyle: "italic" }}>
                      &ldquo;{item.text}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Mastery ───────────────────────────────────────────────────────── */}
        <section id="mastery" ref={masteryRef} className="fade-section" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 80px" }} className="section-padded">
            <div className="two-col two-col-reverse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "100px", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {masteryData.map((row, i) => {
                  const color = row.score >= 70 ? "var(--success)" : row.score >= 40 ? "var(--accent)" : "var(--danger)"
                  const isHov = hoveredMasteryRow === i
                  return (
                    /* #6 — hover expansion */
                    <div key={i}
                      style={{ background: "var(--bg-2)", padding: "20px 24px", cursor: "default", transition: `padding 0.3s ${ease}` }}
                      onMouseOver={() => setHoveredMasteryRow(i)}
                      onMouseOut={() => setHoveredMasteryRow(null)}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
                        <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace" }}>{row.topic}</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                          {/* #7 — delta tooltip */}
                          {isHov && (
                            <span style={{ color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace", animation: `fadeIn 0.2s ${ease} forwards`, whiteSpace: "nowrap" }}>
                              {row.delta}
                            </span>
                          )}
                          <p style={{ color, fontSize: "22px", fontFamily: "DM Serif Display, serif" }}>{row.score}</p>
                          <p style={{ color, fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.65 }}>{row.label}</p>
                        </div>
                      </div>

                      {/* #5 — Animated + breathing bar */}
                      <div style={{ height: "1px", background: "var(--border)", width: "100%" }}>
                        <div
                          className="mastery-bar-fill"
                          style={{
                            height: "100%", background: color, opacity: 0.55,
                            width: masteryVisible ? `${row.score}%` : "0%",
                            transition: !barsFilled ? `width 1.1s ${ease} ${i * 0.12}s` : "none",
                            animation: barsFilled ? `barBreathe 3s ease-in-out ${i * 0.65}s infinite` : "none",
                          }}
                        />
                      </div>

                      {/* #6 — Expandable meaning */}
                      <div style={{
                        overflow: "hidden",
                        maxHeight: isHov ? "28px" : "0",
                        opacity: isHov ? 1 : 0,
                        marginTop: isHov ? "10px" : "0",
                        transition: `max-height 0.3s ${ease}, opacity 0.25s ${ease}, margin-top 0.3s ${ease}`,
                      }}>
                        <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                          {row.meaning}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div>
                <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.18em", marginBottom: "24px", textTransform: "uppercase" }}>
                  topic mastery
                </p>
                <h2 className="h2-section" style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(32px, 3.5vw, 50px)", letterSpacing: "-0.025em", lineHeight: 1.1, marginBottom: "20px" }}>
                  no more guessing<br />
                  <span style={{ fontStyle: "italic" }}>what to study.</span>
                </h2>
                <p style={{ color: "var(--text-2)", fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300, lineHeight: "2" }}>
                  every session updates your score. you always know what&rsquo;s cooked and what needs work.
                  the exam doesn&rsquo;t get to be the first time you find out.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing line */}
        <div style={{ padding: "36px 80px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", letterSpacing: "0.08em" }}>
            free to start · no card required · 3 sessions/week on the free plan
          </p>
        </div>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section id="cta" ref={ctaRef} className="fade-section">
          <div style={{
            maxWidth: "1200px", margin: "0 auto", padding: "128px 80px",
            display: "flex", flexDirection: "column", alignItems: "center",
            textAlign: "center", position: "relative",
          }} className="section-padded">
            <div aria-hidden="true" style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(200,169,110,0.045) 0%, transparent 70%)",
            }} />

            <p style={{ color: "var(--accent)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "28px", opacity: 0.7 }}>
              you got this
            </p>
            <h2 className="h2-cta" style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(40px, 6vw, 76px)", letterSpacing: "-0.03em", marginBottom: "20px", lineHeight: 1.0 }}>
              You don&rsquo;t have to<br />
              <span style={{ fontStyle: "italic", color: "var(--text-2)" }}>figure this out alone.</span>
            </h2>
            <p style={{ color: "var(--text-3)", fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300, marginBottom: "56px", maxWidth: "360px", lineHeight: 1.9 }}>
              free to start. pick a topic. find out what you actually know.
            </p>

            <button onClick={() => router.push("/register")} style={{
              background: "var(--text)", color: "var(--bg)", border: "none",
              padding: "20px 72px", fontFamily: "DM Mono, monospace",
              fontSize: "13px", fontWeight: 500, cursor: "pointer",
              letterSpacing: "0.1em", textTransform: "uppercase",
              animation: "breathe 8s ease-in-out infinite",
              transition: `opacity 0.3s ${ease}, box-shadow 0.3s ${ease}`,
            }}
              onMouseOver={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.boxShadow = "0 0 60px rgba(200,169,110,0.25)"; e.currentTarget.style.animationPlayState = "paused" }}
              onMouseOut={e  => { e.currentTarget.style.opacity = "1";    e.currentTarget.style.boxShadow = "none";                            e.currentTarget.style.animationPlayState = "running" }}
            >Lock in →</button>

            {/* #8 — Social proof */}
            <p className="cta-social-proof" style={{
              color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace",
              letterSpacing: "0.06em", marginTop: "20px",
            }}>
              join 2,400+ engineering students · free to start
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border)", padding: "28px 80px", display: "flex", justifyContent: "space-between", alignItems: "center" }} className="footer-padded">
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent)", display: "inline-block", opacity: 0.6, flexShrink: 0 }} />
            <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
              stud<span style={{ color: "var(--accent)" }}>i</span>ly
            </p>
          </div>
          <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", fontStyle: "italic", letterSpacing: "0.03em" }}>
            for the student who needs more than encouragement
          </p>
        </footer>

      </div>

      {/* #9 — Ambient sound toggle (fixed bottom-left) */}
      <button
        onClick={toggleSound}
        data-cursor
        style={{
          position: "fixed", bottom: "28px", left: "28px", zIndex: 50,
          display: "flex", alignItems: "center", gap: "8px",
          background: "none", border: "none", cursor: "pointer",
          opacity: soundOn ? 0.9 : 0.4,
          transition: `opacity 0.3s ${ease}`,
        }}
        onMouseOver={e => (e.currentTarget.style.opacity = "0.9")}
        onMouseOut={e  => (e.currentTarget.style.opacity = soundOn ? "0.9" : "0.4")}
        aria-label={soundOn ? "Turn off ambient sound" : "Turn on ambient sound"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {soundOn ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="var(--text-3)" fillOpacity="0.4" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </>
          ) : (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          )}
        </svg>
        <span style={{ color: "var(--text-3)", fontSize: "9px", fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          ambient
        </span>
      </button>

      {/* ── Styles ─────────────────────────────────────────────────────────── */}
      <style>{`
        /* Section slide-in (#8) */
        .fade-section {
          opacity: 0;
          transform: translateX(20px);
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        .fade-section.section-visible {
          opacity: 1;
          transform: translateX(0);
        }
        /* Stagger second column child */
        .fade-section.section-visible .two-col > *:nth-child(2) {
          transition-delay: 0.08s;
        }

        /* CTA social proof (#8) */
        .cta-social-proof { opacity: 0; }
        .fade-section.section-visible .cta-social-proof {
          animation: fadeIn 0.4s ease-out 0.35s forwards;
        }

        /* Keyframes */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.7; }
        }

        /* Typing dots (#4) */
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0);   opacity: 0.3; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot {
          display: inline-block; width: 5px; height: 5px;
          border-radius: 50%; background: var(--text-3);
        }
        .typing-dot:nth-child(1) { animation: typingDot 1.3s ease-in-out infinite; }
        .typing-dot:nth-child(2) { animation: typingDot 1.3s ease-in-out 0.22s infinite; }
        .typing-dot:nth-child(3) { animation: typingDot 1.3s ease-in-out 0.44s infinite; }

        /* Hero CTA pulse (#3 — 3× then stops) */
        @keyframes ctaPulse {
          0%       { box-shadow: 0 0 0 0   rgba(200,169,110,0); }
          40%      { box-shadow: 0 0 0 10px rgba(200,169,110,0.25); }
          80%, 100%{ box-shadow: 0 0 0 20px rgba(200,169,110,0); }
        }
        .hero-cta-btn {
          animation-name: ctaPulse;
          animation-duration: 1s;
          animation-timing-function: ease-out;
          animation-delay: 1s;
          animation-iteration-count: 3;
          animation-fill-mode: forwards;
        }

        /* Mastery breathing (#5) */
        @keyframes barBreathe {
          0%, 100% { transform: scaleX(1); }
          50%       { transform: scaleX(0.99); }
        }
        .mastery-bar-fill { transform-origin: left center; }

        /* Session preview scanlines (#5-session) */
        .session-preview-window::after {
          content: ''; position: absolute; inset: 0;
          background: repeating-linear-gradient(
            0deg, transparent, transparent 3px,
            rgba(0,0,0,0.022) 3px, rgba(0,0,0,0.022) 4px
          );
          pointer-events: none; z-index: 2;
        }

        /* Margin decorations — only on wide screens */
        .scroll-rail, .ambient-stats { display: none !important; }
        @media (min-width: 1340px) {
          .scroll-rail, .ambient-stats { display: flex !important; }
        }

        /* Prefers-reduced-motion */
        @media (prefers-reduced-motion: reduce) {
          .fade-section           { transition: none !important; }
          .fade-section.section-visible { transform: none !important; }
          .hero-cta-btn           { animation: none !important; }
          .mastery-bar-fill       { animation: none !important; }
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .nav-desktop { display: none !important; }
          .nav-mobile  { display: flex !important; }
          .section-padded  { padding-left: 24px !important; padding-right: 24px !important; }
          .footer-padded   { padding-left: 24px !important; padding-right: 24px !important; flex-direction: column; gap: 8px; text-align: center; }
          .preview-section { padding-bottom: 64px !important; }
          .preview-messages{ padding: 24px 24px 48px !important; }
          .two-col         { grid-template-columns: 1fr !important; gap: 48px !important; }
          .h1-hero         { font-size: clamp(32px, 9vw, 52px) !important; }
          .h2-section      { font-size: clamp(26px, 7vw, 36px) !important; }
          .h2-cta          { font-size: clamp(32px, 9vw, 52px) !important; }
          .hero-body       { font-size: 15px !important; }
        }
      `}</style>
    </div>
  )
}
