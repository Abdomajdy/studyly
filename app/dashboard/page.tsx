"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"

// ── Types (untouched) ─────────────────────────────────────────────────────────
type MasteryRow = {
  id: string
  topic: string
  course: string
  score: number
  last_studied_at: string
}

type RecentSession = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
}

type UserCourse = {
  id: string
  course_name: string
  course_code: string | null
  exam_date: string | null
}

export default function DashboardPage() {
  const router = useRouter()
  const [mastery,        setMastery]        = useState<MasteryRow[]>([])
  const [username,       setUsername]       = useState("")
  const [loading,        setLoading]        = useState(true)
  const [visible,        setVisible]        = useState(false)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [courses,        setCourses]        = useState<UserCourse[]>([])
  const [totalSessions,  setTotalSessions]  = useState(0)

  // new UI state
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  // ── Data loading (untouched) ────────────────────────────────────────────────
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

      const masteryData = await getMastery(user.id)
      setMastery(masteryData)

      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(5)
      if (sessions) {
        setRecentSessions(sessions)
        setTotalSessions(sessions.length)
      }

      const { data: userCourses } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
      if (userCourses) setCourses(userCourses)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [])

  // ── Helpers (untouched) ─────────────────────────────────────────────────────
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

  const Logo = () => (
    <span style={{ fontFamily: "DM Mono, monospace", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text)" }}>
      stud<span style={{ color: "var(--accent)" }}>i</span>ly
    </span>
  )

  // ── Derived values ──────────────────────────────────────────────────────────
  const avgMastery = mastery.length > 0
    ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length)
    : null

  const weakTopics = mastery
    .filter(m => m.score < 50)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)

  function getHeading(): [string, string, boolean] {
    if (recentSessions.length === 0)
      return ["Day one.", "Let's find out what you know.", false]
    const daysSince = Math.floor(
      (Date.now() - new Date(recentSessions[0].started_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSince > 3)
      return ["You've been away.", "Let's ease back in.", false]
    if (mastery.some(m => m.score < 40))
      return ["You have gaps.", "Let's close them.", false]
    return ["What are we", "locking in on?", true]
  }
  const [headLine1, headLine2, headItalic] = getHeading()

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div style={{ width: "260px", minHeight: "100vh", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--border)" }}>
          <Logo />
        </div>

        <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>◆</span>
            <span style={{ fontSize: "13px", color: "var(--text)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>dashboard</span>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px", opacity: 0.4, cursor: "not-allowed" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>sessions</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>soon</span>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", opacity: 0.4, cursor: "not-allowed" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>settings</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>soon</span>
          </div>
        </div>

        {/* Courses (untouched) */}
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

        {/* Recent Sessions (untouched) */}
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

        {/* Stats — upgraded with avg mastery + streak */}
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
            {/* New: avg mastery */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>avg mastery</p>
              <p style={{
                fontSize: "13px", fontFamily: "DM Serif Display, serif",
                color: avgMastery != null ? getScoreColor(avgMastery) : "var(--text-3)",
              }}>
                {avgMastery ?? "—"}
              </p>
            </div>
            {/* New: streak placeholder */}
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

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="dash-content">
          <div className="dash-grid">

            {/* ── Left column: actions + mastery ─────────────────────────────── */}
            <div>
              {/* Dynamic heading */}
              <div style={{ marginBottom: "48px" }}>
                <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                  {username || "there"}
                </p>
                <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                  {headLine1}<br />
                  <span style={{ fontStyle: headItalic ? "italic" : "normal" }}>{headLine2}</span>
                </h1>
              </div>

              {/* Lock In button */}
              <button
                onClick={() => router.push("/session")}
                style={{ width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", padding: "20px", fontFamily: "DM Mono, monospace", fontSize: "14px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "56px", transition: "opacity 0.2s" }}
                onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseOut={e => (e.currentTarget.style.opacity = "1")}
              >Lock In →</button>

              {/* Mastery table — upgraded rows */}
              <div>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>topic mastery</p>
                {mastery.length === 0 ? (
                  <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>no sessions yet. lock in to start tracking.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {mastery.map((row, i) => {
                      const color   = getScoreColor(row.score)
                      const isHov   = hoveredRow === row.id
                      return (
                        <div
                          key={row.id}
                          onMouseOver={() => setHoveredRow(row.id)}
                          onMouseOut={() => setHoveredRow(null)}
                          style={{
                            background: "var(--bg-2)",
                            borderLeft: `2px solid ${color}`,
                            padding: "18px 20px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            cursor: "default",
                            transform: isHov ? "translateY(-1px)" : "translateY(0)",
                            boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.35)" : "none",
                            transition: "transform 0.18s ease, box-shadow 0.18s ease",
                            // Staggered fade-in
                            opacity: visible ? 1 : 0,
                            transitionProperty: "transform, box-shadow, opacity",
                            transitionDuration: `0.18s, 0.18s, 0.4s`,
                            transitionDelay: `0s, 0s, ${i * 0.05}s`,
                            transitionTimingFunction: "ease",
                          }}
                        >
                          {/* Left: topic + progress bar */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: "var(--text)", fontSize: "14px", marginBottom: "2px", fontFamily: "DM Mono, monospace" }}>
                              {row.topic}
                            </p>
                            <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "8px" }}>
                              {row.course}
                            </p>
                            {/* Micro progress bar */}
                            <div style={{ height: "2px", background: "var(--border)", width: "100%", maxWidth: "200px" }}>
                              <div style={{
                                height: "100%",
                                width: visible ? `${row.score}%` : "0%",
                                background: color,
                                opacity: 0.65,
                                transition: `width 0.8s ease ${i * 0.06}s`,
                              }} />
                            </div>
                          </div>

                          {/* Right: score + label */}
                          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "20px" }}>
                            <p style={{ color, fontSize: "22px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>
                              {row.score}
                            </p>
                            <p style={{ color, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>
                              {getScoreLabel(row.score)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column: gaps panel ────────────────────────────────────── */}
            <div
              className="gaps-panel"
              style={{
                opacity: visible ? 1 : 0,
                transition: "opacity 0.4s ease 0.3s",
              }}
            >
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                your gaps
              </p>

              {weakTopics.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic", lineHeight: 1.7 }}>
                  Nothing critical. Keep going.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {weakTopics.map(topic => (
                    <div
                      key={topic.id}
                      style={{
                        background: "var(--bg-2)",
                        border: "1px solid var(--border)",
                        borderLeft: "2px solid var(--danger)",
                        padding: "18px 20px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <p style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: 1.4 }}>
                          {topic.topic}
                        </p>
                        <span style={{ color: "var(--danger)", fontSize: "18px", fontFamily: "DM Serif Display, serif", flexShrink: 0, paddingLeft: "12px" }}>
                          {topic.score}
                        </span>
                      </div>
                      <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "14px" }}>
                        {topic.course}
                      </p>
                      <button
                        onClick={() => router.push("/session")}
                        style={{
                          background: "none", border: "none", padding: 0,
                          color: "var(--accent)", fontSize: "11px",
                          fontFamily: "DM Mono, monospace", letterSpacing: "0.08em",
                          cursor: "pointer", textTransform: "uppercase",
                          transition: "opacity 0.2s",
                        }}
                        onMouseOver={e => (e.currentTarget.style.opacity = "0.6")}
                        onMouseOut={e => (e.currentTarget.style.opacity = "1")}
                      >
                        Lock in on this →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <style>{`
        .dash-content {
          max-width: 800px;
          margin: 0 auto;
          padding: 64px 48px;
        }
        .dash-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
          align-items: start;
        }
        @media (min-width: 1200px) {
          .dash-content { max-width: 1080px; }
          .dash-grid    { grid-template-columns: 1fr 280px; }
        }
        @media (max-width: 600px) {
          .dash-content { padding: 40px 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
