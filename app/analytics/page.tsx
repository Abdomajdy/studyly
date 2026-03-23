"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  getScoreColor,
  getScoreLabel,
  formatDate,
  hasExamWithin48Hours,
} from "@/lib/helpers"

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
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  // Data
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [username, setUsername] = useState("")
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [allSessions, setAllSessions] = useState<RecentSession[]>([])
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [weekSessions, setWeekSessions] = useState(0)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

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

      // Sessions this week
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { count: wCount } = await supabase
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("started_at", weekAgo)
      setWeekSessions(wCount ?? 0)

      // Recent 10 for display + 5 for sidebar
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(10)
      if (sessions) {
        setAllSessions(sessions)
        setRecentSessions(sessions.slice(0, 5))
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
  ]

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="analytics"
        username={username}
        courses={courses}
        recentSessions={recentSessions}
        examUrgent={hasExamWithin48Hours(courses)}
        stats={{
          totalSessions,
          masteryCount: mastery.length,
          weakCount: mastery.filter(m => m.score < 40).length,
          avgMastery,
        }}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "64px 48px" }}>
          <div className="analytics-grid">

            {/* ── Left column: mastery breakdown ──────────────────────────────── */}
            <div>
              <div style={{ marginBottom: "48px" }}>
                <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                  {username || "there"}
                </p>
                <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                  Your progress
                </h1>
              </div>

              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                mastery breakdown
              </p>

              {mastery.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>no mastery data yet. lock in to start tracking.</p>
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
                          cursor: "default",
                          transform: isHov ? "translateY(-1px)" : "translateY(0)",
                          boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
                          transition: "transform 0.18s ease, box-shadow 0.18s ease",
                          opacity: 0,
                          animation: "fadeIn 0.4s ease forwards",
                          animationDelay: `${i * 0.05}s`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>
                            {row.topic}
                          </p>
                          <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "8px" }}>
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

            {/* ── Right column: stats + recent sessions ──────────────────────── */}
            <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease 0.3s" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "32px" }}>
                {statCards.map((card, i) => (
                  <div
                    key={card.label}
                    className="stat-card"
                    style={{
                      border: "1px solid var(--border)",
                      padding: "24px",
                      transition: "border-color 0.2s ease, background 0.2s ease",
                      opacity: 0,
                      animation: "fadeIn 0.4s ease forwards",
                      animationDelay: `${0.2 + i * 0.08}s`,
                    }}
                  >
                    <AnimatedValue value={card.value} color={card.color} />
                    <p style={{ color: "var(--text-3)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "8px" }}>
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>

              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>
                recent sessions
              </p>
              {allSessions.length === 0 ? (
                <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>no sessions yet</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {allSessions.map(session => (
                    <div key={session.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", background: "var(--bg-2)",
                    }}>
                      <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
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
        .stat-card:hover {
          border-color: var(--text-3) !important;
          background: var(--bg-2);
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
