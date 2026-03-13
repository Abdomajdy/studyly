"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"

// ── Types ─────────────────────────────────────────────────────────────────────
type Session = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

type MasteryRow = {
  id: string
  topic: string
  course: string
  score: number
  last_studied_at: string
}

type UserCourse = {
  id: string
  course_name: string
  course_code: string | null
  exam_date: string | null
}

export default function SessionsPage() {
  const router = useRouter()
  const [sessions,      setSessions]      = useState<Session[]>([])
  const [username,      setUsername]      = useState("")
  const [loading,       setLoading]       = useState(true)
  const [visible,       setVisible]       = useState(false)
  const [courses,       setCourses]       = useState<UserCourse[]>([])
  const [mastery,       setMastery]       = useState<MasteryRow[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [hoveredRow,    setHoveredRow]    = useState<string | null>(null)

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single()
      if (profile) setUsername(profile.username)

      const { data: sessionData } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at, duration_minutes")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
      if (sessionData) {
        setSessions(sessionData)
        setTotalSessions(sessionData.length)
      }

      const { data: userCourses } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
      if (userCourses) setCourses(userCourses)

      const masteryData = await getMastery(user.id)
      setMastery(masteryData)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getScoreColor(score: number) {
    if (score >= 70) return "var(--success)"
    if (score >= 40) return "var(--accent)"
    return "var(--danger)"
  }

  function getScoreLabel(score: number) {
    if (score >= 70) return "strong"
    if (score >= 40) return "shaky"
    return "weak"
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "today"
    if (diffDays === 1) return "yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  function formatExamDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return "passed"
    if (diffDays === 0) return "today"
    if (diffDays === 1) return "tomorrow"
    if (diffDays <= 7) return `${diffDays}d`
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`
    return `${Math.ceil(diffDays / 30)}mo`
  }

  function getExamUrgencyColor(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 3) return "var(--danger)"
    if (diffDays <= 7) return "var(--accent)"
    return "var(--text-3)"
  }

  function getDuration(session: Session): string {
    if (!session.ended_at) return "in progress"
    if (session.duration_minutes != null) return `${session.duration_minutes}m`
    const start = new Date(session.started_at).getTime()
    const end = new Date(session.ended_at).getTime()
    const mins = Math.round((end - start) / 60000)
    return `${mins}m`
  }

  const Logo = () => (
    <span style={{ fontFamily: "DM Mono, monospace", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text)" }}>
      stud<span style={{ color: "var(--accent)" }}>i</span>ly
    </span>
  )

  // ── Derived ───────────────────────────────────────────────────────────────
  const avgMastery = mastery.length > 0
    ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length)
    : null

  const recentSessions = sessions.slice(0, 5)

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div style={{ width: "260px", minHeight: "100vh", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--border)" }}>
          <Logo />
        </div>

        <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
          {/* dashboard — inactive, clickable */}
          <div
            onClick={() => router.push("/dashboard")}
            style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px", cursor: "pointer" }}
            onMouseOver={e => (e.currentTarget.style.background = "var(--bg-2)")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>dashboard</span>
          </div>
          {/* sessions — active */}
          <div style={{ padding: "10px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>◆</span>
            <span style={{ fontSize: "13px", color: "var(--text)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>sessions</span>
          </div>
          {/* settings — disabled */}
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", opacity: 0.4, cursor: "not-allowed" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>settings</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>soon</span>
          </div>
        </div>

        {/* Courses */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>courses</p>
          {courses.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "12px", fontStyle: "italic", lineHeight: "1.6" }}>no courses yet — add one from settings</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {courses.map(course => (
                <div key={course.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>
                      {course.course_code || course.course_name}
                    </p>
                    {course.course_code && (
                      <p style={{ color: "var(--text-3)", fontSize: "11px" }}>{course.course_name}</p>
                    )}
                  </div>
                  {course.exam_date && (
                    <span style={{ fontSize: "11px", color: getExamUrgencyColor(course.exam_date), fontFamily: "DM Mono, monospace", letterSpacing: "0.05em" }}>
                      {formatExamDate(course.exam_date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sessions */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>recent sessions</p>
          {recentSessions.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "12px", fontStyle: "italic", lineHeight: "1.6" }}>no sessions yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {recentSessions.map(session => (
                <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>
                    {session.topic}
                  </p>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                    {formatDate(session.started_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>stats</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>sessions</p>
              <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{totalSessions}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>topics tracked</p>
              <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{mastery.length}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>weak topics</p>
              <p style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{mastery.filter(m => m.score < 40).length}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>avg mastery</p>
              <p style={{
                fontSize: "13px", fontFamily: "DM Serif Display, serif",
                color: avgMastery != null ? getScoreColor(avgMastery) : "var(--text-3)",
              }}>
                {avgMastery ?? "—"}
              </p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>streak</p>
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>—</p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", padding: "20px 24px" }}>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
            style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", transition: "color 0.2s", padding: 0 }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >sign out</button>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="sess-content">

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "48px" }}>
            <div>
              <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                {username || "there"}
              </p>
              <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                Your sessions
              </h1>
            </div>
            <button
              onClick={() => router.push("/session")}
              style={{ background: "var(--text)", color: "var(--bg)", border: "none", padding: "14px 24px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0, marginTop: "8px", transition: "opacity 0.2s" }}
              onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={e => (e.currentTarget.style.opacity = "1")}
            >Lock In →</button>
          </div>

          {/* Sessions list */}
          {sessions.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>
              no sessions yet. hit lock in to start.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {sessions.map((session, i) => {
                const isHov = hoveredRow === session.id
                const duration = getDuration(session)
                const isInProgress = !session.ended_at
                return (
                  <div
                    key={session.id}
                    onMouseOver={() => setHoveredRow(session.id)}
                    onMouseOut={() => setHoveredRow(null)}
                    style={{
                      background: "var(--bg-2)",
                      borderLeft: "2px solid var(--border)",
                      padding: "18px 20px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "default",
                      transform: isHov ? "translateY(-1px)" : "translateY(0)",
                      boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.35)" : "none",
                      opacity: visible ? 1 : 0,
                      transitionProperty: "transform, box-shadow, opacity",
                      transitionDuration: "0.18s, 0.18s, 0.4s",
                      transitionDelay: `0s, 0s, ${i * 0.04}s`,
                      transitionTimingFunction: "ease",
                    }}
                  >
                    {/* Left: topic + date */}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", marginBottom: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "480px" }}>
                        {session.topic}
                      </p>
                      <p style={{ color: "var(--text-3)", fontSize: "12px" }}>
                        {formatDate(session.started_at)}
                      </p>
                    </div>

                    {/* Right: duration */}
                    <div style={{ flexShrink: 0, paddingLeft: "24px" }}>
                      <p style={{
                        fontSize: "13px",
                        fontFamily: "DM Mono, monospace",
                        color: isInProgress ? "var(--accent)" : "var(--text-3)",
                        letterSpacing: "0.05em",
                      }}>
                        {duration}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .sess-content {
          max-width: 800px;
          margin: 0 auto;
          padding: 64px 48px;
        }
        @media (max-width: 600px) {
          .sess-content { padding: 40px 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
