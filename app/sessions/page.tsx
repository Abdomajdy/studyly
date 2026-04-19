"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  formatDate,
  hasExamWithin48Hours,
  getScoreColor,
} from "@/lib/helpers"

type FullSession = {
  id: string
  topic: string
  course: string | null
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

type SessionEval = {
  session_id: string
  mastery_delta: number
  session_quality: string
  honest_summary: string
}

type GroupMode = "time" | "course"

function formatDuration(mins: number | null, startedAt?: string, endedAt?: string | null): string {
  // If duration_minutes is stored, use it
  if (mins != null && mins > 0) {
    if (mins < 1) return "<1m"
    if (mins < 60) return `${Math.round(mins)}m`
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
  }
  // Calculate from timestamps
  if (startedAt && endedAt) {
    const diff = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000)
    if (diff < 1) return "<1m"
    if (diff < 60) return `${diff}m`
    return `${Math.floor(diff / 60)}h ${diff % 60}m`
  }
  return ""
}

function getQualityColor(quality: string): string {
  switch (quality) {
    case "excellent": return "var(--success)"
    case "productive": return "var(--accent)"
    case "minimal": return "var(--text-3)"
    case "wasted": return "var(--danger)"
    default: return "var(--text-3)"
  }
}

function groupByTime(sessions: FullSession[]): { label: string; sessions: FullSession[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 6 * 86400000

  const groups: { label: string; sessions: FullSession[] }[] = [
    { label: "today", sessions: [] },
    { label: "yesterday", sessions: [] },
    { label: "this week", sessions: [] },
    { label: "older", sessions: [] },
  ]

  for (const s of sessions) {
    const t = new Date(s.started_at).getTime()
    if (t >= todayStart) groups[0].sessions.push(s)
    else if (t >= yesterdayStart) groups[1].sessions.push(s)
    else if (t >= weekStart) groups[2].sessions.push(s)
    else groups[3].sessions.push(s)
  }

  return groups.filter(g => g.sessions.length > 0)
}

function groupByCourse(sessions: FullSession[]): { label: string; sessions: FullSession[] }[] {
  const courseMap: Record<string, FullSession[]> = {}
  for (const s of sessions) {
    const key = s.course || "uncategorized"
    if (!courseMap[key]) courseMap[key] = []
    courseMap[key].push(s)
  }
  return Object.entries(courseMap)
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions.length - a.sessions.length)
}

export default function SessionsPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const [sessions, setSessions] = useState<FullSession[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [messageCountMap, setMessageCountMap] = useState<Record<string, number>>({})
  const [evalMap, setEvalMap] = useState<Record<string, SessionEval>>({})
  const [groupMode, setGroupMode] = useState<GroupMode>("time")
  const [searchQuery, setSearchQuery] = useState("")

  // Sidebar data
  const [username, setUsername] = useState("")
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

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

      const { data: allSessions } = await supabase
        .from("study_sessions")
        .select("id, topic, course, started_at, ended_at, duration_minutes")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
      if (allSessions) {
        setSessions(allSessions)
        setRecentSessions(allSessions.slice(0, 5).map(s => ({ id: s.id, topic: s.topic, started_at: s.started_at, ended_at: s.ended_at })))

        const sessionIds = allSessions.map(s => s.id)
        if (sessionIds.length > 0) {
          // Message counts
          const { data: messageCounts } = await supabase
            .from("message_logs")
            .select("session_id")
            .in("session_id", sessionIds)
          const countMap: Record<string, number> = {}
          messageCounts?.forEach(m => {
            countMap[m.session_id] = (countMap[m.session_id] || 0) + 1
          })
          setMessageCountMap(countMap)

          // Evaluations (mastery delta + quality)
          const { data: evals } = await supabase
            .from("mastery_evaluations")
            .select("session_id, mastery_delta, session_quality, honest_summary")
            .in("session_id", sessionIds)
          if (evals) {
            const em: Record<string, SessionEval> = {}
            evals.forEach(e => { if (e.session_id) em[e.session_id] = e })
            setEvalMap(em)
          }
        }
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

  // Filter by search
  const filtered = searchQuery.trim()
    ? sessions.filter(s => s.topic.toLowerCase().includes(searchQuery.toLowerCase()) || (s.course || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions

  // Hero: only the most recent in-progress session. Rest go into grouped history.
  const allIncomplete = filtered.filter(s => !s.ended_at)
  const heroSession = allIncomplete.length > 0 ? allIncomplete[0] : null
  const remainingAfterHero = heroSession ? filtered.filter(s => s.id !== heroSession.id) : filtered

  const grouped = groupMode === "time" ? groupByTime(remainingAfterHero) : groupByCourse(remainingAfterHero)

  // Total study time
  const totalMinutes = sessions.reduce((sum, s) => {
    if (s.ended_at) {
      const dur = s.duration_minutes ?? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
      return sum + dur
    }
    return sum
  }, 0)
  const totalHours = Math.floor(totalMinutes / 60)
  const remainingMins = totalMinutes % 60

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="sessions"
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

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "64px 48px" }}>

          {/* Header */}
          <div style={{ marginBottom: "32px" }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "DM Mono, monospace" }}>
              {username || "there"}
            </p>
            <h1 className="flourish-underline" style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "28px" }}>
              Session history
            </h1>
            {totalMinutes > 0 && (
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
                {totalHours > 0 ? `${totalHours}h ${remainingMins}m` : `${remainingMins}m`} total study time across {sessions.length} session{sessions.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Search + group toggle */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "32px", alignItems: "center" }}>
            <input
              type="text"
              placeholder="search topics..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1, background: "var(--bg-2)", color: "var(--text)",
                border: "1px solid var(--border)", padding: "12px 16px",
                fontFamily: "DM Mono, monospace", fontSize: "13px",
                outline: "none", transition: "border-color 0.2s"
              }}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
            />
            <div style={{ display: "flex", gap: "2px" }}>
              {(["time", "course"] as GroupMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setGroupMode(mode)}
                  style={{
                    background: groupMode === mode ? "var(--bg-3)" : "var(--bg-2)",
                    border: `1px solid ${groupMode === mode ? "var(--text-3)" : "var(--border)"}`,
                    color: groupMode === mode ? "var(--text)" : "var(--text-3)",
                    fontFamily: "DM Mono, monospace", fontSize: "11px",
                    padding: "10px 14px", cursor: "pointer",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    transition: "all 0.15s"
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <p style={{ color: "var(--text-3)", fontSize: "14px", fontStyle: "italic", marginBottom: "24px", fontFamily: "DM Mono, monospace" }}>
                no sessions yet. start your first one.
              </p>
              <button
                onClick={() => router.push("/session")}
                style={{
                  background: "var(--text)", color: "var(--bg)", border: "none",
                  padding: "16px 40px", fontFamily: "DM Mono, monospace", fontSize: "13px",
                  fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
                  transition: "opacity 0.2s",
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseOut={e => (e.currentTarget.style.opacity = "1")}
              >Lock In</button>
            </div>
          ) : (
            <div>
              {/* HERO CARD — single in-progress or last completed */}
              {(() => {
                if (heroSession) {
                  const msgCount = messageCountMap[heroSession.id] || 0
                  const elapsed = Math.round((Date.now() - new Date(heroSession.started_at).getTime()) / 60000)
                  return (
                    <div style={{ marginBottom: "32px", opacity: 0, animation: "fadeIn 0.5s ease forwards" }}>
                      <div
                        onClick={() => router.push(`/session?id=${heroSession.id}&topic=${encodeURIComponent(heroSession.topic)}`)}
                        onMouseOver={() => setHoveredId("hero")}
                        onMouseOut={() => setHoveredId(null)}
                        className="dark-fixed"
                        style={{
                          background: "var(--bg-2)",
                          border: "1px solid var(--accent-dim)",
                          padding: "32px 36px",
                          cursor: "pointer",
                          transform: hoveredId === "hero" ? "translateY(-2px)" : "translateY(0)",
                          boxShadow: hoveredId === "hero" ? "0 8px 32px rgba(200,169,110,0.08)" : "none",
                          transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
                          <span style={{ color: "var(--accent)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                            session in progress
                          </span>
                        </div>
                        <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "var(--text)", marginBottom: "12px", lineHeight: 1.2 }}>
                          {heroSession.topic}
                        </h2>
                        <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "20px" }}>
                          {[heroSession.course || null, `${msgCount} messages`, elapsed > 0 ? `started ${elapsed}m ago` : "just started"].filter(Boolean).join(" · ")}
                        </p>
                        <span style={{
                          background: "var(--text)", color: "var(--bg)",
                          padding: "10px 28px", fontFamily: "DM Mono, monospace", fontSize: "12px",
                          fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
                          display: "inline-block",
                        }}>
                          Continue Session
                        </span>
                      </div>
                    </div>
                  )
                }

                // No in-progress — show last completed as hero
                const lastCompleted = filtered.find(s => s.ended_at)
                if (lastCompleted) {
                  const evaluation = evalMap[lastCompleted.id]
                  const msgCount = messageCountMap[lastCompleted.id] || 0
                  const duration = formatDuration(lastCompleted.duration_minutes, lastCompleted.started_at, lastCompleted.ended_at)
                  return (
                    <div style={{ marginBottom: "32px", opacity: 0, animation: "fadeIn 0.5s ease forwards" }}>
                      <div
                        onClick={() => router.push(`/session?id=${lastCompleted.id}&topic=${encodeURIComponent(lastCompleted.topic)}`)}
                        onMouseOver={() => setHoveredId("hero")}
                        onMouseOut={() => setHoveredId(null)}
                        className="dark-fixed"
                        style={{
                          background: "var(--bg-2)",
                          border: `1px solid ${evaluation ? getQualityColor(evaluation.session_quality) + "33" : "var(--border)"}`,
                          borderLeft: `3px solid ${evaluation ? getQualityColor(evaluation.session_quality) : "var(--border)"}`,
                          padding: "32px 36px",
                          cursor: "pointer",
                          transform: hoveredId === "hero" ? "translateY(-2px)" : "translateY(0)",
                          boxShadow: hoveredId === "hero" ? "0 8px 32px rgba(0,0,0,0.2)" : "none",
                          transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                          <span style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                            last session
                          </span>
                          {evaluation && (
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{
                                fontSize: "13px", fontFamily: "DM Mono, monospace", fontWeight: 600,
                                color: evaluation.mastery_delta > 0 ? "var(--success)" : evaluation.mastery_delta < 0 ? "var(--danger)" : "var(--text-3)"
                              }}>
                                {evaluation.mastery_delta > 0 ? `+${evaluation.mastery_delta}` : evaluation.mastery_delta}
                              </span>
                              <span style={{
                                fontSize: "10px", fontFamily: "DM Mono, monospace",
                                color: getQualityColor(evaluation.session_quality),
                                letterSpacing: "0.1em", textTransform: "uppercase"
                              }}>
                                {evaluation.session_quality}
                              </span>
                            </div>
                          )}
                        </div>
                        <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "var(--text)", marginBottom: "12px", lineHeight: 1.2 }}>
                          {lastCompleted.topic}
                        </h2>
                        <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: evaluation?.honest_summary ? "16px" : "0" }}>
                          {[lastCompleted.course || null, duration || null, `${msgCount} messages`, formatDate(lastCompleted.started_at)].filter(Boolean).join(" · ")}
                        </p>
                        {evaluation?.honest_summary && (
                          <p style={{
                            color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace",
                            fontStyle: "italic", lineHeight: 1.6,
                          }}>
                            {evaluation.honest_summary}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                }

                return null
              })()}

              {/* Completed sessions grouped */}
              {grouped.map((group, gi) => (
                <div key={group.label} style={{ marginBottom: "24px" }}>
                  <div style={{
                    padding: "10px 0",
                    display: "flex", alignItems: "center", gap: "12px",
                  }}>
                    <span style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                      {group.label}
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                    <span style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>
                      {group.sessions.length}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
                    {group.sessions.map((session, i) => {
                      const isHov = hoveredId === session.id
                      const evaluation = evalMap[session.id]
                      const msgCount = messageCountMap[session.id] || 0
                      const duration = formatDuration(session.duration_minutes, session.started_at, session.ended_at)

                      return (
                        <div
                          key={session.id}
                          onClick={() => router.push(`/session?id=${session.id}&topic=${encodeURIComponent(session.topic)}`)}
                          onMouseOver={() => setHoveredId(session.id)}
                          onMouseOut={() => setHoveredId(null)}
                          className="dark-fixed"
                          style={{
                            background: "var(--bg-2)",
                            borderLeft: evaluation ? `2px solid ${getQualityColor(evaluation.session_quality)}` : "2px solid var(--border)",
                            padding: "16px 20px",
                            cursor: "pointer",
                            transform: isHov ? "translateY(-1px)" : "translateY(0)",
                            boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
                            transition: "transform 0.18s ease, box-shadow 0.18s ease",
                            opacity: 0, animation: "fadeIn 0.4s ease forwards",
                            animationDelay: `${(gi * 2 + i) * 0.04}s`,
                            minWidth: 0, overflow: "hidden",
                          }}
                        >
                          {/* Header: topic + quality badge */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                            <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                              {session.topic}
                            </p>
                            {evaluation && (
                              <span style={{
                                fontSize: "9px", fontFamily: "DM Mono, monospace",
                                color: getQualityColor(evaluation.session_quality),
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                flexShrink: 0, marginLeft: "8px", marginTop: "2px"
                              }}>
                                {evaluation.session_quality}
                              </span>
                            )}
                          </div>

                          {/* Meta row */}
                          <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginBottom: evaluation?.honest_summary ? "10px" : "0" }}>
                            {[
                              session.course || null,
                              duration || null,
                              `${msgCount} msg${msgCount !== 1 ? "s" : ""}`,
                              formatDate(session.started_at),
                            ].filter(Boolean).join(" · ")}
                          </p>

                          {/* Honest summary preview */}
                          {evaluation?.honest_summary && (
                            <p style={{
                              color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace",
                              fontStyle: "italic", lineHeight: 1.5,
                              overflow: "hidden", textOverflow: "ellipsis",
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                              marginBottom: "10px",
                            }}>
                              {evaluation.honest_summary}
                            </p>
                          )}

                          {/* Bottom: mastery delta + hover action */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            {evaluation ? (
                              <span style={{
                                fontSize: "12px", fontFamily: "DM Mono, monospace",
                                color: evaluation.mastery_delta > 0 ? "var(--success)" : evaluation.mastery_delta < 0 ? "var(--danger)" : "var(--text-3)"
                              }}>
                                {evaluation.mastery_delta > 0 ? `+${evaluation.mastery_delta}` : evaluation.mastery_delta}
                              </span>
                            ) : <span />}
                            {isHov && (
                              <span style={{ color: "var(--accent)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em" }}>
                                review →
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && searchQuery && (
                <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", fontStyle: "italic", padding: "40px 0", textAlign: "center" }}>
                  no sessions match "{searchQuery}"
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
