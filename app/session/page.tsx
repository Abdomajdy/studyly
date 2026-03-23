"use client"
import { useEffect, useState, useRef, Suspense, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter, useSearchParams } from "next/navigation"
import { createSession, endSession, logMessage, loadSessionMessages } from "@/services/session.service"
// mastery evaluation now handled via /api/evaluate route
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { motion, AnimatePresence } from "framer-motion"
// useAutoAnimate removed — conflicts with streaming token updates + Framer Motion
import { useHotkeys } from "react-hotkeys-hook"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import Lottie from "lottie-react"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Dialog from "@radix-ui/react-dialog"
import PlotlyChart from "@/components/PlotlyChart"
import DesmosEmbed from "@/components/DesmosEmbed"
import P5Sketch from "@/components/P5Sketch"
import TopicSuggestions from "@/components/TopicSuggestions"
import RecapCard from "@/components/RecapCard"
import "katex/dist/katex.min.css"

// ── Mermaid diagram renderer ──────────────────────────────────────────────────
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

// ── Voice input button ────────────────────────────────────────────────────────
function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript
        if (transcript) onTranscript(transcript)
        setListening(false)
      }
      recognition.onerror = () => setListening(false)
      recognition.onend = () => setListening(false)
      recognitionRef.current = recognition
    }
  }, [onTranscript])

  if (!supported) return null

  return (
    <button
      onClick={() => {
        if (listening) {
          recognitionRef.current?.stop()
          setListening(false)
        } else {
          recognitionRef.current?.start()
          setListening(true)
        }
      }}
      style={{
        background: "none",
        border: "none",
        borderLeft: "1px solid var(--border)",
        color: listening ? "var(--danger)" : "var(--text-3)",
        fontFamily: "DM Mono, monospace",
        fontSize: "16px",
        padding: "16px 16px",
        cursor: "pointer",
        transition: "color 0.2s",
        display: "flex",
        alignItems: "center",
      }}
      title={listening ? "Stop recording" : "Voice input"}
    >
      {listening ? "◉" : "🎤"}
    </button>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; content: string }

// ── Streaming helper ──────────────────────────────────────────────────────────
async function streamAI(
  body: Record<string, unknown>,
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: string) => void,
) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: "Unknown error" }))
    onError(errData.error || `HTTP ${res.status}`)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { onError("No stream body"); return }

  const decoder = new TextDecoder()
  let full = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    full += chunk
    onToken(chunk)
  }

  onDone(full)
}

// ── Inner component that uses useSearchParams ─────────────────────────────────
function SessionInner() {
  const router  = useRouter()
  const searchParams = useSearchParams()
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState("")
  const [topic,     setTopic]     = useState("")
  const [topicSet,  setTopicSet]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [visible,   setVisible]   = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [elapsed,   setElapsed]   = useState(0)
  const [isResumed, setIsResumed] = useState(false)
  const [masteryContext, setMasteryContext] = useState("")
  const [totalSessions, setTotalSessions] = useState(0)
  const [notes, setNotes] = useState("")
  const [notesFilename, setNotesFilename] = useState("")
  const [notesUploading, setNotesUploading] = useState(false)
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [sessionSummary, setSessionSummary] = useState("")
  const [lottieData, setLottieData] = useState<object | null>(null)
  const [feedbackGiven, setFeedbackGiven] = useState(false)
  const [repeatedStruggleFlag, setRepeatedStruggleFlag] = useState(false)
  const [struggleCount, setStruggleCount] = useState(0)
  const [messageIndex, setMessageIndex] = useState(0)
  const [aiMessageTime, setAiMessageTime] = useState<number | null>(null)
  const [course, setCourse] = useState("")
  const [statedGoal, setStatedGoal] = useState("")
  const [goalStep, setGoalStep] = useState(false)
  const [pendingGoal, setPendingGoal] = useState("")
  const [confidenceBefore, setConfidenceBefore] = useState<number | null>(null)
  const [confidenceAfter, setConfidenceAfter] = useState<number | null>(null)
  const [showRecap, setShowRecap] = useState(false)
  const [recapData, setRecapData] = useState<{
    topic: string; durationMinutes: number; scoreBefore: number | null;
    scoreAfter: number; scoreDelta: number; sessionQuality: string; honestSummary: string;
  } | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)
  const aiMessageTimeRef = useRef<number>(0)
  const latencyRecordedRef = useRef(false)
  const hiddenAtRef = useRef<number>(0)
  const prevInputRef = useRef("")

  // ── Keyboard shortcuts (3F) ─────────────────────────────────────────────
  useHotkeys("ctrl+enter, meta+enter", (e) => {
    e.preventDefault()
    if (topicSet) sendMessage()
  }, { enableOnFormTags: true })

  useHotkeys("escape", () => {
    if (topicSet) setShowSummaryDialog(true)
  })

  // ── Load Lottie animation (3C) ──────────────────────────────────────────
  useEffect(() => {
    fetch("https://assets10.lottiefiles.com/packages/lf20_jcikwtux.json")
      .then(r => r.json())
      .then(setLottieData)
      .catch(() => setLottieData(null))
  }, [])

  // ── Passive data: visibility + copy tracking ─────────────────────────────
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
      } else if (hiddenAtRef.current > 0) {
        const duration = Date.now() - hiddenAtRef.current
        hiddenAtRef.current = 0
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user || !sessionId) return
          supabase.from("attention_events").insert({
            user_id: user.id, session_id: sessionId, topic,
            duration_ms: duration, event_type: "tab_away"
          }).then(() => {})
          if (duration > 180000) {
            supabase.from("attention_events").insert({
              user_id: user.id, session_id: sessionId, topic,
              duration_ms: duration, event_type: "distraction"
            }).then(() => {})
          }
        }).catch(() => {})
      }
    }

    function onCopy() {
      const text = window.getSelection()?.toString() || ""
      if (text.length <= 10) return
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user || !sessionId) return
        supabase.from("copy_events").insert({
          user_id: user.id, session_id: sessionId, topic,
          copied_text: text.slice(0, 500)
        }).then(() => {})
      }).catch(() => {})
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    document.addEventListener("copy", onCopy)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      document.removeEventListener("copy", onCopy)
    }
  }, [sessionId, topic])

  // ── Load mastery context + session count (3D) ───────────────────────────
  useEffect(() => {
    async function loadContext() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: masteryRows } = await supabase
        .from("topic_mastery")
        .select("topic, score")
        .eq("user_id", user.id)

      const { count } = await supabase
        .from("study_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)

      if (masteryRows?.length) {
        const weak = masteryRows.filter(m => m.score < 40)
        const shaky = masteryRows.filter(m => m.score >= 40 && m.score < 70)
        const strong = masteryRows.filter(m => m.score >= 70)
        setMasteryContext(
          `Student mastery — weak: ${weak.map(m => `${m.topic}(${m.score})`).join(", ") || "none"} | shaky: ${shaky.map(m => `${m.topic}(${m.score})`).join(", ") || "none"} | strong: ${strong.map(m => `${m.topic}(${m.score})`).join(", ") || "none"}`
        )
      }
      if (count) setTotalSessions(count)
    }
    loadContext()
  }, [])

  // ── Init: check URL params ────────────────────────────────────────────────
  useEffect(() => {
    const paramTopic = searchParams.get("topic")
    const paramId = searchParams.get("id")

    if (paramTopic) {
      setTopic(decodeURIComponent(paramTopic))
    }
    if (paramId) {
      setSessionId(paramId)
    }

    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
    }
    getUser()
    setTimeout(() => setVisible(true), 100)
  }, [router, searchParams])

  // ── PDF drag and drop (3E) ──────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      const file = acceptedFiles[0]
      if (!file) return
      setNotesUploading(true)
      setNotesFilename(file.name)
      try {
        const pdfjsLib = await import("pdfjs-dist")
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        let fullText = ""
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          fullText += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n"
        }
        setNotes(fullText.trim())
        toast.success(`${file.name} extracted — ${pdf.numPages} pages loaded`)
      } catch {
        toast.error("could not read PDF — try again")
        setNotesFilename("")
      } finally {
        setNotesUploading(false)
      }
    }
  })

  // ── Streaming start helper ──────────────────────────────────────────────
  const streamStart = useCallback(async (existingMessages: Message[], notesText?: string) => {
    setLoading(true)
    const startMsg = "Let's start. Give me a quick honest assessment of what I need to focus on for this topic, then ask me the first question."

    // Insert session_metadata (fire-and-forget)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const now = new Date()
      supabase.from("session_metadata").insert({
        user_id: user.id,
        topic,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
        is_mobile: window.innerWidth < 768,
        screen_width: window.innerWidth,
        total_sessions: totalSessions,
      }).then(() => {})
    }).catch(() => {})

    setMessages([...existingMessages, { role: "assistant", content: "" }])

    await streamAI(
      {
        message: startMsg,
        notes: notesText || notes || "",
        topic,
        history: [],
        masteryContext,
        totalSessions,
      },
      (token) => {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + token }
          }
          return updated
        })
      },
      () => {
        setLoading(false)
        aiMessageTimeRef.current = Date.now()
        latencyRecordedRef.current = false
        toast("↓ response received", { duration: 1000, style: { opacity: 0.6 } })
      },
      (err) => {
        console.error("[streamStart] error:", err)
        toast.error("AI error — try again")
        setLoading(false)
      },
    )
  }, [topic, masteryContext, totalSessions, notes])

  // ── Auto-start if topic came from URL ─────────────────────────────────────
  useEffect(() => {
    if (!topic || topicSet || startedRef.current) return
    const paramTopic = searchParams.get("topic")
    const paramId = searchParams.get("id")
    if (!paramTopic) return

    startedRef.current = true

    if (paramId) {
      ;(async () => {
        try {
          const { data } = await supabase
            .from("message_logs")
            .select("role, content")
            .eq("session_id", paramId)
            .order("created_at", { ascending: true })
          if (data && data.length > 0) {
            setMessages(data as Message[])
            setTopicSet(true)
            setIsResumed(true)
            return
          }
        } catch { /* silently fall through to fresh start */ }
        setTopicSet(true)
        streamStart([])
      })()
    } else {
      setTopicSet(true)
      streamStart([])
    }
  }, [topic, topicSet, searchParams, streamStart])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (!topicSet) return
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [topicSet])

  // ── Log pending goal once sessionId is available ──────────────────────
  useEffect(() => {
    if (!pendingGoal || !sessionId) return
    const logGoal = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from("session_intents").insert({
        session_id: sessionId,
        user_id: user.id,
        topic,
        stated_goal: pendingGoal
      })
      setPendingGoal("")
    }
    logGoal()
  }, [pendingGoal, sessionId, topic])

  // ── Struggle detection ──────────────────────────────────────────────────
  async function detectAndLogStruggle(
    userMessage: string,
    currentMessageIndex: number,
    latencyMs: number,
    activeSessionId: string,
    userId: string
  ) {
    const patterns: Record<string, RegExp[]> = {
      blank: [/i don't know/i, /no idea/i, /i have no clue/i, /i can't remember/i],
      gave_up: [/i give up/i, /forget it/i, /this is impossible/i],
      asked_for_answer: [/just tell me/i, /what's the answer/i, /can you just show me/i],
      reexplanation: [/can you (re)?explain/i, /i still don't get/i, /i'm still confused/i],
      hedged: [/i think maybe/i, /not sure but/i, /could it be/i],
    }
    let detected: string | null = null
    for (const [type, regexes] of Object.entries(patterns)) {
      if (regexes.some(r => r.test(userMessage))) { detected = type; break }
    }
    if (!detected && latencyMs > 45000) detected = "slow_response"
    if (!detected) return
    const { count } = await supabase
      .from("struggle_events")
      .select("*", { count: "exact", head: true })
      .eq("session_id", activeSessionId)
      .eq("topic", topic)
    const priorCount = count ?? 0
    await supabase.from("struggle_events").insert({
      user_id: userId,
      session_id: activeSessionId,
      topic,
      struggle_type: detected,
      message_index: currentMessageIndex,
      response_latency_ms: latencyMs,
      prior_struggle_count: priorCount
    })
    setStruggleCount(priorCount + 1)
    if (priorCount >= 2) setRepeatedStruggleFlag(true)
  }

  // ── Session logic ─────────────────────────────────────────────────────────
  async function startSession() {
    if (!topic.trim()) return
    setTopicSet(true)
    streamStart([], notes)
  }

  async function handleStartWithGoal() {
    setTopicSet(true)
    setGoalStep(false)
    await startSession()
    if (statedGoal.trim()) {
      setPendingGoal(statedGoal)
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput("")
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMessage }]
    setMessages([...updatedMessages, { role: "assistant", content: "" }])
    setLoading(true)

    const latencyMs = aiMessageTime ? Date.now() - aiMessageTime : 0
    const currentIndex = messages.length
    setMessageIndex(currentIndex)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { console.error("[sendMessage] No user"); setLoading(false); return }

    let currentSessionId = sessionId
    try {
      if (!currentSessionId) {
        const newSessionId = await createSession(user.id, topic)
        if (!newSessionId) { console.error("[sendMessage] Failed to create session"); setLoading(false); return }
        currentSessionId = newSessionId
        setSessionId(newSessionId)
      }

      const struggleNote = repeatedStruggleFlag
        ? `CONTEXT FOR AI: Student has struggled with this concept ${struggleCount} times this session. Try a completely different explanation approach — use a diagram, analogy, or worked example.\n\nStudent message: `
        : ""

      let fullResponse = ""
      await streamAI(
        {
          message: struggleNote + userMessage,
          notes,
          topic,
          history: messages.slice(-12),
          masteryContext,
          totalSessions,
        },
        (token) => {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + token }
            }
            return updated
          })
        },
        (full) => {
          fullResponse = full
          setLoading(false)
          aiMessageTimeRef.current = Date.now()
          latencyRecordedRef.current = false
          toast("↓ response received", { duration: 1000, style: { opacity: 0.6 } })
        },
        (err) => {
          console.error("[sendMessage] stream error:", err)
          toast.error("AI error — try again")
          setLoading(false)
        },
      )

      setAiMessageTime(Date.now())

      if (currentSessionId && fullResponse) {
        logMessage(currentSessionId, user.id, "user", userMessage).catch(() => {})
        logMessage(currentSessionId, user.id, "assistant", fullResponse).catch(() => {})

        await detectAndLogStruggle(userMessage, currentIndex, latencyMs, currentSessionId, user.id)
      }
    } catch (error) {
      console.error("[sendMessage] error:", error)
      setLoading(false)
    }
  }

  // ── End session with summary dialog (3H) ────────────────────────────────
  async function handleEndSession() {
    if (!sessionId && messages.length === 0) { router.push("/dashboard"); return }
    setShowSummaryDialog(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/dashboard"); return }

      // Get AI evaluation of the session
      const evalRes = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, messages })
      })
      if (!evalRes.ok) {
        console.error("[handleEndSession] evaluate failed:", evalRes.status)
        setSessionSummary("Session complete.")
        if (sessionId) endSession(sessionId, "Session complete.").catch(() => {})
        return
      }

      const evaluation = await evalRes.json()

      // Show summary immediately — before any DB writes
      setSessionSummary(evaluation.honest_summary || "Session complete.")

      // Build recap data
      const scoreBeforeMatch = masteryContext.match(new RegExp(`${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\((\\d+)\\)`))
      const scoreBefore = scoreBeforeMatch ? parseInt(scoreBeforeMatch[1]) : 50
      const recapPayload = {
        topic,
        durationMinutes: Math.floor(elapsed / 60),
        scoreBefore,
        scoreAfter: scoreBefore + (evaluation.mastery_delta ?? 0),
        scoreDelta: evaluation.mastery_delta ?? 0,
        sessionQuality: evaluation.session_quality ?? "productive",
        honestSummary: evaluation.honest_summary ?? ""
      }
      setRecapData(recapPayload)

      // All DB writes are fire-and-forget — don't block the UI
      if (evaluation.mastery_delta !== undefined) {
        import("@/services/mastery.service").then(({ applyMasteryDelta }) =>
          applyMasteryDelta(user.id, topic, "General", evaluation.mastery_delta).then(newScore => {
            if (evaluation.mastery_delta > 0) toast.success(`mastery +${evaluation.mastery_delta} → ${newScore}`)
            else if (evaluation.mastery_delta < 0) toast(`mastery ${evaluation.mastery_delta} → ${newScore}`, { icon: "→" })
          })
        ).catch(err => console.error("[handleEndSession] mastery:", err))
      }

      supabase.from("mastery_evaluations").insert({
        user_id: user.id, session_id: sessionId, topic,
        mastery_delta: evaluation.mastery_delta,
        understanding_level: evaluation.understanding_level,
        can_apply: evaluation.can_apply, can_explain: evaluation.can_explain,
        specific_gaps: evaluation.specific_gaps, specific_strengths: evaluation.specific_strengths,
        confidence_accuracy: evaluation.confidence_accuracy,
        recommended_next_topics: evaluation.recommended_next_topics,
        session_quality: evaluation.session_quality, honest_summary: evaluation.honest_summary
      }).then(() => {})

      if (sessionId) endSession(sessionId, evaluation.honest_summary).catch(() => {})

      supabase.from("session_recaps").insert({
        session_id: sessionId, user_id: user.id,
        topic: recapPayload.topic, duration_minutes: recapPayload.durationMinutes,
        score_before: recapPayload.scoreBefore, score_after: recapPayload.scoreAfter,
        score_delta: recapPayload.scoreDelta, session_quality: recapPayload.sessionQuality,
        honest_summary: recapPayload.honestSummary,
      }).then(() => {})

      toast.success("session saved")
    } catch (err) {
      console.error("[handleEndSession]", err)
      toast.error("could not save session")
      setSessionSummary("Session complete.")
    }
  }

  function confirmEndSession() {
    setShowSummaryDialog(false)
    router.push("/dashboard")
  }

  async function submitFeedback(helped: boolean) {
    setFeedbackGiven(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !sessionId) return
      await supabase.from("session_feedback").insert({
        session_id: sessionId,
        user_id: user.id,
        topic,
        helped,
        confidence_before: confidenceBefore,
        confidence_after: confidenceAfter
      })
      if (statedGoal) {
        await supabase.from("session_intents")
          .update({ goal_achieved: helped })
          .eq("session_id", sessionId)
      }
    } catch (err) {
      console.error("[submitFeedback]", err)
    }
  }

  // ── Derived visual values ────────────────────────────────────────────────
  const progressWidth = Math.min((messages.length / 20) * 100, 100)
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  // ── Goal step screen (STEP 4) ─────────────────────────────────────────────
  if (goalStep && !topicSet) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease"
      }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>
            ONE QUESTION BEFORE WE START
          </p>
          <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "var(--text)", marginBottom: "12px", letterSpacing: "-0.02em" }}>
            What do you want to be able to do by the end of this session?
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "32px", fontFamily: "DM Mono, monospace" }}>
            Be specific. &quot;understand entropy&quot; is weak. &quot;explain why entropy increases in irreversible processes&quot; is strong.
          </p>
          <input
            type="text"
            placeholder="e.g. solve Thevenin equivalent problems without looking at notes..."
            value={statedGoal}
            onChange={e => setStatedGoal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && statedGoal.trim() && handleStartWithGoal()}
            autoFocus
            style={{
              width: "100%", background: "var(--bg-2)", color: "var(--text)",
              border: "1px solid var(--border)", padding: "16px 20px",
              fontFamily: "DM Mono, monospace", fontSize: "14px",
              outline: "none", marginBottom: "12px", transition: "border-color 0.2s"
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <button
            onClick={handleStartWithGoal}
            disabled={!statedGoal.trim()}
            style={{
              width: "100%", background: statedGoal.trim() ? "var(--text)" : "var(--bg-3)",
              color: statedGoal.trim() ? "var(--bg)" : "var(--text-3)",
              border: "none", padding: "16px", fontFamily: "DM Mono, monospace",
              fontSize: "13px", fontWeight: 500, cursor: statedGoal.trim() ? "pointer" : "not-allowed",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "12px",
              transition: "all 0.2s"
            }}
          >
            START SESSION →
          </button>
          <button
            onClick={() => { setGoalStep(false); handleStartWithGoal() }}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer",
              letterSpacing: "0.05em", width: "100%", padding: "8px",
              textTransform: "uppercase"
            }}
          >
            ← SKIP
          </button>
        </div>
      </div>
    )
  }

  // ── Topic entry screen ────────────────────────────────────────────────────
  if (!topicSet) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", paddingTop: "76px", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px", fontFamily: "DM Mono, monospace" }}>SESSION</p>
          <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "8px", letterSpacing: "-0.02em" }}>What are we locking in on?</h1>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>Topic, chapter, concept. Be specific.</p>

          <input
            type="text"
            placeholder="course name (optional)..."
            value={course}
            onChange={e => setCourse(e.target.value)}
            style={{
              width: "100%", background: "var(--bg-2)", color: "var(--text)",
              border: "1px solid var(--border)", padding: "14px 20px",
              fontFamily: "DM Mono, monospace", fontSize: "14px",
              outline: "none", marginBottom: "12px", transition: "border-color 0.2s"
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />

          <TopicSuggestions courseName={course} onSelect={(t) => setTopic(t)} />

          <input type="text" placeholder="e.g. Fourier transforms, thermodynamics..." value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && topic.trim() && setGoalStep(true)} autoFocus style={{ width: "100%", background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none", marginBottom: "12px", transition: "border-color 0.2s" }} onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />

          {/* PDF drag and drop (3E) */}
          <div
            {...getRootProps()}
            style={{
              border: `1px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
              padding: "20px",
              textAlign: "center",
              cursor: "pointer",
              marginBottom: "12px",
              background: isDragActive ? "rgba(200,169,110,0.04)" : "transparent",
              transition: "all 0.2s"
            }}
          >
            <input {...getInputProps()} />
            <p style={{
              color: notesFilename ? "var(--success)" : "var(--text-3)",
              fontSize: "12px",
              fontFamily: "DM Mono, monospace",
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }}>
              {notesUploading ? "EXTRACTING..." : notesFilename ? `✓ ${notesFilename}` : isDragActive ? "DROP IT" : "↑ DROP LECTURE NOTES OR PAST PAPER (PDF)"}
            </p>
          </div>

          <button onClick={() => { if (!topic.trim()) return; setGoalStep(true) }} disabled={!topic.trim()} style={{ width: "100%", background: topic.trim() ? "var(--text)" : "var(--bg-3)", color: topic.trim() ? "var(--bg)" : "var(--text-3)", border: "none", padding: "16px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: topic.trim() ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px", transition: "all 0.2s" }}>LOCK IN →</button>
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", width: "100%", padding: "8px", textTransform: "uppercase" }}>← BACK</button>
        </div>
      </div>
    )
  }

  // ── Session screen ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* Background atmosphere orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: "-200px", right: "-200px",
          width: "700px", height: "700px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,169,110,0.025) 0%, transparent 70%)",
          animation: "drift1 25s linear infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-150px", left: "-150px",
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,169,110,0.015) 0%, transparent 70%)",
          animation: "drift2 32s linear infinite",
        }} />
      </div>

      {/* Header — fixed */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        height: "52px", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px",
        background: "rgba(10,10,11,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>{topic}</p>
          {isResumed && (
            <span style={{
              background: "var(--bg-3)", border: "1px solid var(--border)",
              color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
              padding: "3px 8px", letterSpacing: "0.03em", textTransform: "uppercase",
            }}>RESUMED</span>
          )}
        </div>
        <p style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          fontFamily: "DM Mono, monospace", fontSize: "12px", fontWeight: 400,
          color: "var(--text-3)", letterSpacing: "0.1em",
          fontVariantNumeric: "tabular-nums",
        }}>
          {formatTime(elapsed)}
        </p>

        {/* END SESSION with tooltip (3K) */}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button onClick={() => setShowSummaryDialog(true)} style={{
                background: "none", border: "none",
                color: "var(--text-3)", fontFamily: "DM Mono, monospace",
                fontSize: "11px", cursor: "pointer",
                letterSpacing: "0.12em", textTransform: "uppercase",
                transition: "color 0.25s"
              }}
                onMouseOver={e => (e.currentTarget.style.color = "var(--danger)")}
                onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                END SESSION
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content style={{
                background: "var(--bg-3)", border: "1px solid var(--border)",
                padding: "8px 12px", fontFamily: "DM Mono, monospace",
                fontSize: "11px", color: "var(--text-3)",
                letterSpacing: "0.08em"
              }} sideOffset={8}>
                ESC TO END · {formatTime(elapsed)}
                <Tooltip.Arrow style={{ fill: "var(--border)" }} />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        {/* Progress indicator */}
        <div style={{ position: "absolute", bottom: "-1px", left: 0, height: "1px", width: `${progressWidth}%`, background: "var(--accent)", opacity: 0.35, transition: "width 0.8s ease" }} />
      </div>

      {/* Messages — scrollable area between fixed header and footer */}
      <div className="session-messages" style={{ flex: 1, overflowY: "auto", paddingTop: "72px", paddingBottom: "100px", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", width: "100%", padding: "32px 24px", display: "flex", flexDirection: "column", gap: "40px" }}>
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isStreaming = loading && i === messages.length - 1 && msg.role === "assistant"
              return (
              <motion.div
                key={`${msg.role}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
                layout={false}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div style={{
                  maxWidth: msg.role === "user" ? "58%" : "100%",
                  padding: msg.role === "user" ? "12px 16px" : "0",
                  background: msg.role === "user" ? "var(--bg-2)" : "transparent",
                  border: msg.role === "user" ? "1px solid var(--border)" : "none",
                  color: msg.role === "user" ? "var(--text-2)" : "var(--text)",
                  fontSize: msg.role === "assistant" ? "15px" : "13px",
                  lineHeight: msg.role === "assistant" ? "1.9" : "1.7",
                  letterSpacing: msg.role === "assistant" ? "0.01em" : "0",
                  fontFamily: "DM Mono, monospace",
                  fontWeight: msg.role === "assistant" ? 300 : 400,
                }}>
                  {msg.role === "assistant" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex, rehypeRaw]}
                        components={{
                          p: ({ children }) => (
                            <p style={{ marginBottom: "16px", lineHeight: "1.9", fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300, letterSpacing: "0.01em", color: "var(--text)" }}>
                              {children}
                            </p>
                          ),
                          code: ({ children, className }) => {
                            const match    = /language-(\w+)/.exec(className ?? "")
                            const language = match?.[1] ?? ""
                            const isBlock  = !!className
                            const codeStr  = String(children).replace(/\n$/, "")

                            if (language === "svg") {
                              return (
                                <div
                                  style={{
                                    background: "var(--bg-3)", border: "1px solid var(--border)",
                                    borderTop: "2px solid var(--accent)",
                                    padding: "24px", margin: "16px 0",
                                    display: "flex", justifyContent: "center", alignItems: "center",
                                    overflowX: "auto",
                                  }}
                                  dangerouslySetInnerHTML={{ __html: codeStr }}
                                />
                              )
                            }

                            if (language === "plot" || language === "plotly") {
                              if (isStreaming) return <pre style={{ fontFamily: "DM Mono, monospace", fontSize: "12px", background: "#0d0d0f", border: "1px solid var(--border)", borderTop: "2px solid var(--accent)", padding: "20px 24px", color: "var(--text-3)", marginBottom: "16px" }}>{codeStr}</pre>
                              return <PlotlyChart code={codeStr} />
                            }

                            if (language === "desmos") {
                              if (isStreaming) return <pre style={{ fontFamily: "DM Mono, monospace", fontSize: "12px", background: "#0d0d0f", border: "1px solid var(--border)", borderTop: "2px solid var(--accent)", padding: "20px 24px", color: "var(--text-3)", marginBottom: "16px" }}>{codeStr}</pre>
                              return <DesmosEmbed code={codeStr} />
                            }

                            if (language === "p5" || language === "animation") {
                              if (isStreaming) return <pre style={{ fontFamily: "DM Mono, monospace", fontSize: "12px", background: "#0d0d0f", border: "1px solid var(--border)", borderTop: "2px solid var(--accent)", padding: "20px 24px", color: "var(--text-3)", marginBottom: "16px" }}>{codeStr}</pre>
                              return <P5Sketch code={codeStr} />
                            }

                            if (!isBlock) {
                              return (
                                <code style={{ fontFamily: "DM Mono, monospace", fontSize: "13px", background: "var(--bg-2)", padding: "2px 6px", color: "var(--accent)" }}>
                                  {children}
                                </code>
                              )
                            }

                            if (language === "mermaid") {
                              return <MermaidDiagram code={codeStr} />
                            }

                            const lineCount = codeStr.split("\n").length
                            return (
                              <div style={{ position: "relative", marginBottom: "16px" }}>
                                {language && (
                                  <span style={{
                                    position: "absolute", top: "10px", left: "14px", zIndex: 1,
                                    color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
                                    letterSpacing: "0.12em", textTransform: "uppercase",
                                  }}>{language}</span>
                                )}
                                <CopyButton code={codeStr} />
                                <SyntaxHighlighter
                                  language={language || "text"}
                                  style={atomDark}
                                  showLineNumbers={lineCount > 5}
                                  customStyle={{
                                    margin: 0, borderRadius: 0,
                                    border: "1px solid var(--border)",
                                    borderTop: "2px solid var(--accent)",
                                    background: "#0d0d0f",
                                    fontSize: "13px", lineHeight: "1.7",
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
                          pre: ({ children }) => <>{children}</>,
                          ul: ({ children }) => (
                            <ul style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li style={{ lineHeight: "1.9", fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300, color: "var(--text)" }}>{children}</li>
                          ),
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
                          blockquote: ({ children }) => (
                            <div style={{
                              background: "var(--bg-3)", borderLeft: "3px solid var(--accent)",
                              padding: "18px 22px", marginBottom: "16px",
                              fontSize: "15px", fontFamily: "DM Mono, monospace", fontWeight: 300,
                              color: "var(--text)", lineHeight: "1.8",
                            }}>
                              {children}
                            </div>
                          ),
                          strong: ({ children }) => (
                            <strong style={{ color: "var(--text)", fontWeight: 500 }}>{children}</strong>
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
              </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Thinking indicator with Lottie (3I) */}
          {loading && messages[messages.length - 1]?.content === "" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", justifyContent: "flex-start", paddingLeft: "4px" }}
            >
              {lottieData ? (
                <Lottie
                  animationData={lottieData}
                  style={{ width: 40, height: 40 }}
                  loop
                />
              ) : (
                <div style={{ display: "flex", gap: "6px", alignItems: "center", padding: "12px 0" }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: "var(--text-3)",
                      animation: `dotPulse 0.9s ease-in-out ${i * 0.25}s infinite`
                    }} />
                  ))}
                </div>
              )}
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar — fixed */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "rgba(10,10,11,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", width: "100%", padding: "16px 24px" }}>
          <div className="session-input-bar" style={{
            display: "flex",
            border: "1px solid var(--border)",
            transition: "border-color 0.2s",
          }}>
            <input
              type="text"
              placeholder="reply..."
              value={input}
              onChange={e => {
                const newVal = e.target.value
                // Draft event: detect large deletions (>10 chars removed)
                if (prevInputRef.current.length - newVal.length > 10 && sessionId) {
                  supabase.auth.getUser().then(({ data: { user } }) => {
                    if (!user || !sessionId) return
                    supabase.from("draft_events").insert({
                      user_id: user.id, session_id: sessionId, topic,
                      event_type: "large_deletion",
                      chars_deleted: prevInputRef.current.length - newVal.length,
                    }).then(() => {})
                  }).catch(() => {})
                }
                prevInputRef.current = newVal
                setInput(newVal)
              }}
              onKeyDown={e => {
                // Response latency: first keypress after AI response
                if (!latencyRecordedRef.current && aiMessageTimeRef.current > 0 && sessionId) {
                  latencyRecordedRef.current = true
                  const latencyMs = Date.now() - aiMessageTimeRef.current
                  supabase.auth.getUser().then(({ data: { user } }) => {
                    if (!user || !sessionId) return
                    supabase.from("response_latency_events").insert({
                      user_id: user.id, session_id: sessionId, topic,
                      latency_ms: latencyMs,
                    }).then(() => {})
                  }).catch(() => {})
                }
                if (e.key === "Enter") sendMessage()
              }}
              style={{ flex: 1, background: "transparent", color: "var(--text)", border: "none", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none" }}
            />
            <VoiceButton onTranscript={(text) => setInput(prev => prev ? prev + " " + text : text)} />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                background: input.trim() && !loading ? "var(--text)" : "var(--bg-3)",
                color: input.trim() && !loading ? "var(--bg)" : "var(--text-3)",
                border: "none", borderLeft: "1px solid var(--border)",
                padding: "16px 24px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500,
                letterSpacing: "0.08em",
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >→</button>
          </div>
          {/* Hotkey hint (3L) */}
          <AnimatePresence>
            {input.trim() && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  fontFamily: "DM Mono, monospace", fontSize: "10px",
                  color: "var(--text-3)", letterSpacing: "0.12em",
                  textTransform: "uppercase", textAlign: "center",
                  marginTop: "8px"
                }}
              >
                CTRL+↵ TO SEND · ESC TO END SESSION
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Session summary dialog (3H) */}
      <Dialog.Root open={showSummaryDialog} onOpenChange={(open) => {
        setShowSummaryDialog(open)
        if (open && !sessionSummary) handleEndSession()
      }}>
        <Dialog.Portal>
          <Dialog.Overlay style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            animation: "fadeIn 0.2s ease"
          }} />
          <Dialog.Content style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 101,
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
            padding: "48px",
            maxWidth: "520px",
            width: "90vw",
            animation: "slideUp 0.3s cubic-bezier(0,0,0.2,1)"
          }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
              SESSION COMPLETE
            </p>
            <Dialog.Title style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "var(--text)", marginBottom: "24px", letterSpacing: "-0.02em" }}>
              Here is what happened.
            </Dialog.Title>
            <div style={{ color: "var(--text-2)", fontSize: "15px", fontFamily: "DM Mono, monospace", lineHeight: "1.9", marginBottom: "24px", minHeight: "80px" }}>
              {sessionSummary || (
                <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>generating honest summary...</span>
              )}
            </div>

            {/* Stated goal reminder */}
            {statedGoal && (
              <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: "16px", marginBottom: "20px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px", fontFamily: "DM Mono, monospace" }}>
                  YOUR GOAL WAS
                </p>
                <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>
                  {statedGoal}
                </p>
              </div>
            )}

            {/* Feedback section */}
            {!feedbackGiven ? (
              <div style={{ marginBottom: "24px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                  DID THIS SESSION HELP?
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
                  <div>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "DM Mono, monospace" }}>CONFIDENCE BEFORE</p>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => setConfidenceBefore(n)} style={{
                          width: "32px", height: "32px",
                          background: confidenceBefore === n ? "var(--accent)" : "var(--bg-3)",
                          border: `1px solid ${confidenceBefore === n ? "var(--accent)" : "var(--border)"}`,
                          color: confidenceBefore === n ? "var(--bg)" : "var(--text-3)",
                          fontFamily: "DM Mono, monospace", fontSize: "12px",
                          cursor: "pointer", transition: "all 0.15s"
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "DM Mono, monospace" }}>CONFIDENCE AFTER</p>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => setConfidenceAfter(n)} style={{
                          width: "32px", height: "32px",
                          background: confidenceAfter === n ? "var(--accent)" : "var(--bg-3)",
                          border: `1px solid ${confidenceAfter === n ? "var(--accent)" : "var(--border)"}`,
                          color: confidenceAfter === n ? "var(--bg)" : "var(--text-3)",
                          fontFamily: "DM Mono, monospace", fontSize: "12px",
                          cursor: "pointer", transition: "all 0.15s"
                        }}>{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => submitFeedback(true)}
                    style={{
                      flex: 1, background: "none",
                      border: "1px solid var(--success)", color: "var(--success)",
                      padding: "12px", fontFamily: "DM Mono, monospace",
                      fontSize: "12px", letterSpacing: "0.08em",
                      textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s"
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = "rgba(90,158,111,0.1)" }}
                    onMouseOut={e => { e.currentTarget.style.background = "none" }}
                  >
                    IT HELPED
                  </button>
                  <button
                    onClick={() => submitFeedback(false)}
                    style={{
                      flex: 1, background: "none",
                      border: "1px solid var(--border)", color: "var(--text-3)",
                      padding: "12px", fontFamily: "DM Mono, monospace",
                      fontSize: "12px", letterSpacing: "0.08em",
                      textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s"
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.color = "var(--danger)" }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)" }}
                  >
                    NOT REALLY
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "24px", letterSpacing: "0.05em" }}>
                feedback saved. this makes studyly better.
              </p>
            )}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={confirmEndSession}
                style={{
                  flex: 1,
                  background: "var(--text)",
                  color: "var(--bg)",
                  border: "none", padding: "16px",
                  fontFamily: "DM Mono, monospace", fontSize: "13px",
                  fontWeight: 500, letterSpacing: "0.08em",
                  textTransform: "uppercase", cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                BACK TO DASHBOARD →
              </button>
              {recapData && (
                <button
                  onClick={() => setShowRecap(true)}
                  style={{
                    background: "none", border: "1px solid var(--accent)",
                    color: "var(--accent)", padding: "16px 20px",
                    fontFamily: "DM Mono, monospace", fontSize: "13px",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    cursor: "pointer", transition: "all 0.2s"
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = "rgba(200,169,110,0.08)" }}
                  onMouseOut={e => { e.currentTarget.style.background = "none" }}
                >
                  SHARE
                </button>
              )}
              <Dialog.Close asChild>
                <button style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--text-3)", padding: "16px 20px",
                  fontFamily: "DM Mono, monospace", fontSize: "13px",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer", transition: "color 0.2s"
                }}
                  onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
                  onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
                >
                  KEEP GOING
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 1; }
        }
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-40px, 30px); }
          50%      { transform: translate(-20px, 60px); }
          75%      { transform: translate(30px, 20px); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(30px, -20px); }
          50%      { transform: translate(15px, -50px); }
          75%      { transform: translate(-25px, -15px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
        .session-messages {
          scrollbar-width: none;
        }
        .session-messages::-webkit-scrollbar {
          display: none;
        }
        .session-input-bar:focus-within {
          border-color: var(--text-3) !important;
        }
      `}</style>

      {showRecap && recapData && (
        <RecapCard {...recapData} onClose={() => setShowRecap(false)} />
      )}
    </div>
  )
}

// ── Page export with Suspense boundary for useSearchParams ────────────────────
export default function SessionPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    }>
      <SessionInner />
    </Suspense>
  )
}
