"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  getScoreColor,
  getScoreLabel,
  formatDate,
  hasExamWithin48Hours,
} from "@/lib/helpers"

type SessionWithDuration = RecentSession & { durationMin: number }
type DayActivity = { date: string; count: number; label: string }

// ── Animated counter ────────────────────────────────────────────────────────
function AnimatedValue({ value, color }: { value: number; color?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const animated = useRef(false)

  const animate = useCallback(() => {
    if (animated.current || !ref.current) return
    animated.current = true
    const start = performance.now()
    const duration = 800
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      if (ref.current) ref.current.textContent = String(Math.round(eased * value))
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value])

  useEffect(() => { animate() }, [animate])

  return <span ref={ref} style={{ color: color || "var(--text)", fontSize: "40px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>0</span>
}

export default function AnalyticsPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [username, setUsername] = useState("")
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [allSessions, setAllSessions] = useState<SessionWithDuration[]>([])
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [weekSessions, setWeekSessions] = useState(0)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [dayActivity, setDayActivity] = useState<DayActivity[]>([])
  const [topicFrequency, setTopicFrequency] = useState<{ topic: string; count: number }[]>([])
  const [avgSessionMin, setAvgSessionMin] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single()
      if (profile) setUsername(profile.username)

      const masteryData = await getMastery(user.id)
      setMastery(masteryData)

      const { count } = await supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { count: wCount } = await supabase
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("started_at", weekAgo)
      setWeekSessions(wCount ?? 0)

      // All sessions for charts
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(50)

      if (sessions) {
        const withDuration = sessions.map(s => ({
          ...s,
          durationMin: s.ended_at
            ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
            : 0
        }))
        setAllSessions(withDuration)
        setRecentSessions(sessions.slice(0, 5))

        // Avg session duration (completed only)
        const completed = withDuration.filter(s => s.durationMin > 0)
        if (completed.length > 0) {
          setAvgSessionMin(Math.round(completed.reduce((s, c) => s + c.durationMin, 0) / completed.length))
        }

        // 14-day activity heatmap
        const activity: DayActivity[] = []
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000)
          const dateStr = d.toISOString().split("T")[0]
          const dayLabel = d.toLocaleDateString("en", { weekday: "short" }).toLowerCase()
          const dayCount = sessions.filter(s => s.started_at.startsWith(dateStr)).length
          activity.push({ date: dateStr, count: dayCount, label: dayLabel })
        }
        setDayActivity(activity)

        // Topic frequency
        const freq: Record<string, number> = {}
        sessions.forEach(s => { freq[s.topic] = (freq[s.topic] || 0) + 1 })
        const sorted = Object.entries(freq).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, 6)
        setTopicFrequency(sorted)
      }

      const { data: userCourses } = await supabase.from("user_courses").select("id, course_name, course_code, exam_date").eq("user_id", user.id).order("created_at", { ascending: true })
      if (userCourses) setCourses(userCourses)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router])

  const avgMastery = mastery.length > 0
    ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length)
    : null

  const weakTopics = mastery.filter(m => m.score < 40).sort((a, b) => a.score - b.score).slice(0, 5)
  const maxActivity = Math.max(...dayActivity.map(d => d.count), 1)
  const maxFreq = Math.max(...topicFrequency.map(t => t.count), 1)

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  const statCards: { label: string; value: number; color?: string }[] = [
    { label: "total sessions", value: totalSessions },
    { label: "this week", value: weekSessions },
    { label: "topics tracked", value: mastery.length },
    { label: "avg mastery", value: avgMastery ?? 0, color: avgMastery != null ? getScoreColor(avgMastery) : "var(--text-3)" },
    { label: "avg session", value: avgSessionMin, color: "var(--text)" },
  ]

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="analytics"
        stats={{
          totalSessions,
          masteryCount: mastery.length,
          weakCount: mastery.filter(m => m.score < 40).length,
          avgMastery,
        }}
        friends={sidebar.friends}
        groups={sidebar.groups}
        pendingCount={sidebar.pendingCount}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "64px 48px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "48px" }}>
            <div>
              <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "DM Mono, monospace" }}>
                {username || "there"}
              </p>
              <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                Your progress
              </h1>
            </div>
            <button
              onClick={() => router.push("/patterns")}
              style={{
                background: "none",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                padding: "12px 20px",
                fontFamily: "DM Mono, monospace",
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
              onMouseOver={e => { e.currentTarget.style.background = "rgba(200,169,110,0.08)" }}
              onMouseOut={e => { e.currentTarget.style.background = "none" }}
            >
              MY PATTERNS →
            </button>
          </div>

          {/* Stat cards row */}
          <div style={{ display: "flex", gap: "2px", marginBottom: "48px", flexWrap: "wrap" }}>
            {statCards.map((card, i) => (
              <div
                key={card.label}
                style={{
                  flex: "1 1 120px",
                  border: "1px solid var(--border)",
                  padding: "24px",
                  opacity: 0,
                  animation: "fadeIn 0.4s ease forwards",
                  animationDelay: `${i * 0.08}s`,
                }}
              >
                <AnimatedValue value={card.value} color={card.color} />
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "8px", fontFamily: "DM Mono, monospace" }}>
                  {card.label}{card.label === "avg session" ? " min" : ""}
                </p>
              </div>
            ))}
          </div>

          <div className="analytics-grid">

            {/* ── Left column ──────────────────────────────────────────────────── */}
            <div>

              {/* 14-day activity chart */}
              <div style={{ marginBottom: "48px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                  14-day activity
                </p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "100px", padding: "0 4px" }}>
                  {dayActivity.map((day, i) => (
                    <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                      <div style={{
                        width: "100%",
                        height: `${Math.max(4, (day.count / maxActivity) * 80)}px`,
                        background: day.count > 0 ? "var(--accent)" : "var(--border)",
                        opacity: day.count > 0 ? 0.7 : 0.3,
                        transition: "height 0.6s ease",
                        transitionDelay: `${i * 0.03}s`,
                      }} />
                      <span style={{ fontSize: "9px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>
                        {day.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mastery bar chart */}
              <div style={{ marginBottom: "48px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                  mastery breakdown
                </p>

                {mastery.length === 0 ? (
                  <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic", fontFamily: "DM Mono, monospace" }}>no mastery data yet. lock in to start tracking.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {mastery.map((row, i) => {
                      const color = getScoreColor(row.score)
                      const isHov = hoveredRow === row.id
                      return (
                        <div
                          key={row.id}
                          onMouseOver={() => setHoveredRow(row.id)}
                          onMouseOut={() => setHoveredRow(null)}
                          style={{
                            background: "var(--bg-2)",
                            borderLeft: `2px solid ${color}`,
                            padding: "16px 20px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            cursor: "pointer",
                            transform: isHov ? "translateY(-1px)" : "translateY(0)",
                            boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
                            transition: "transform 0.18s ease, box-shadow 0.18s ease",
                            opacity: 0,
                            animation: "fadeIn 0.4s ease forwards",
                            animationDelay: `${i * 0.05}s`,
                          }}
                          onClick={() => router.push(`/session?topic=${encodeURIComponent(row.topic)}`)}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>
                              {row.topic}
                            </p>
                            <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginBottom: "8px" }}>
                              {row.course}
                            </p>
                            <div style={{ height: "4px", background: "var(--border)", width: "100%" }}>
                              <div style={{
                                height: "100%",
                                width: visible ? `${row.score}%` : "0%",
                                background: color,
                                transition: `width 0.8s ease ${i * 0.06}s`,
                              }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "20px" }}>
                            <p style={{ color, fontSize: "22px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>
                              {row.score}
                            </p>
                            <p style={{ color, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px", fontFamily: "DM Mono, monospace" }}>
                              {getScoreLabel(row.score)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Topic frequency chart */}
              {topicFrequency.length > 0 && (
                <div style={{ marginBottom: "48px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                    most studied topics
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {topicFrequency.map((t, i) => (
                      <div key={t.topic} style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        opacity: 0, animation: "fadeIn 0.4s ease forwards", animationDelay: `${0.3 + i * 0.05}s`,
                      }}>
                        <span style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", width: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {t.topic}
                        </span>
                        <div style={{ flex: 1, height: "6px", background: "var(--border)" }}>
                          <div style={{
                            height: "100%",
                            width: `${(t.count / maxFreq) * 100}%`,
                            background: "var(--accent)",
                            opacity: 0.6,
                            transition: "width 0.6s ease",
                          }} />
                        </div>
                        <span style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                          {t.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Right column ─────────────────────────────────────────────────── */}
            <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease 0.3s" }}>

              {/* Weakest topics */}
              {weakTopics.length > 0 && (
                <div style={{ marginBottom: "32px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px", fontFamily: "DM Mono, monospace" }}>
                    weakest topics
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {weakTopics.map(t => (
                      <div key={t.id} style={{
                        background: "var(--bg-2)", borderLeft: "2px solid var(--danger)",
                        padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                        cursor: "pointer"
                      }}
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(t.topic)}`)}
                      >
                        <div>
                          <p style={{ color: "var(--text)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>{t.topic}</p>
                          <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>{t.course}</p>
                        </div>
                        <span style={{ color: "var(--danger)", fontSize: "18px", fontFamily: "DM Serif Display, serif" }}>{t.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent sessions with duration */}
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px", fontFamily: "DM Mono, monospace" }}>
                recent sessions
              </p>
              {allSessions.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic", fontFamily: "DM Mono, monospace" }}>no sessions yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {allSessions.slice(0, 10).map((session, i) => (
                    <div key={session.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", background: "var(--bg-2)",
                      opacity: 0, animation: "fadeIn 0.3s ease forwards", animationDelay: `${0.4 + i * 0.04}s`,
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {session.topic}
                        </p>
                        {session.durationMin > 0 && (
                          <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                            {session.durationMin} min
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: "10px", color: "var(--text-3)", flexShrink: 0, fontFamily: "DM Mono, monospace", marginLeft: "12px" }}>
                        {formatDate(session.started_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .analytics-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
          align-items: start;
        }
        @media (min-width: 1000px) {
          .analytics-grid { grid-template-columns: 63% 37%; }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
