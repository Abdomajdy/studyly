"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  formatDate,
  hasExamWithin48Hours,
} from "@/lib/helpers"

type FullSession = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

function groupSessions(sessions: FullSession[]): { label: string; sessions: FullSession[] }[] {
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

function formatDuration(mins: number | null): string {
  if (mins == null) return ""
  if (mins < 1) return "<1m"
  if (mins < 60) return `${Math.round(mins)}m`
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
}

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<FullSession[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [messageCountMap, setMessageCountMap] = useState<Record<string, number>>({})

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
        .select("id, topic, started_at, ended_at, duration_minutes")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
      if (allSessions) {
        setSessions(allSessions)
        setRecentSessions(allSessions.slice(0, 5).map(s => ({ id: s.id, topic: s.topic, started_at: s.started_at, ended_at: s.ended_at })))

        // Fetch message counts per session
        const sessionIds = allSessions.map(s => s.id)
        if (sessionIds.length > 0) {
          const { data: messageCounts } = await supabase
            .from("message_logs")
            .select("session_id")
            .in("session_id", sessionIds)
          const countMap: Record<string, number> = {}
          messageCounts?.forEach(m => {
            countMap[m.session_id] = (countMap[m.session_id] || 0) + 1
          })
          setMessageCountMap(countMap)
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

  const grouped = groupSessions(sessions)

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="sessions"
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
        <div style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 48px" }}>
          <div style={{ marginBottom: "48px" }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
              {username || "there"}
            </p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Session history
            </h1>
          </div>

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <p style={{ color: "var(--text-3)", fontSize: "14px", fontStyle: "italic", marginBottom: "24px" }}>
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
              >Lock In →</button>
            </div>
          ) : (
            <div>
              {grouped.map((group, gi) => (
                <div key={group.label}>
                  {/* Group separator */}
                  <div style={{
                    borderTop: gi > 0 ? "1px solid var(--border)" : "none",
                    margin: gi > 0 ? "8px 0" : "0 0 8px 0",
                    padding: "12px 0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                      {group.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {group.sessions.map((session, i) => {
                      const isInProgress = !session.ended_at
                      const isHov = hoveredId === session.id
                      return (
                        <div
                          key={session.id}
                          onClick={() => router.push(`/session?id=${session.id}&topic=${encodeURIComponent(session.topic)}`)}
                          onMouseOver={() => setHoveredId(session.id)}
                          onMouseOut={() => setHoveredId(null)}
                          style={{
                            background: "var(--bg-2)",
                            borderLeft: isInProgress ? "2px solid var(--accent)" : "2px solid transparent",
                            padding: "18px 20px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            cursor: "pointer",
                            transform: isHov ? "translateY(-1px)" : "translateY(0)",
                            boxShadow: isHov ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
                            transition: "transform 0.18s ease, box-shadow 0.18s ease",
                            opacity: 0,
                            animation: "fadeIn 0.4s ease forwards",
                            animationDelay: `${(gi * 3 + i) * 0.05}s`,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                            {isInProgress && (
                              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite", flexShrink: 0 }} />
                            )}
                            <div>
                              <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {session.topic}
                              </p>
                              <span style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                                {messageCountMap[session.id] ? `${messageCountMap[session.id]} messages` : "no messages"}
                              </span>
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, paddingLeft: "16px", textAlign: "right" }}>
                            {isHov ? (
                              <span style={{ color: "var(--accent)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em", transition: "opacity 0.2s" }}>
                                continue →
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace" }}>
                                {isInProgress ? "in progress" : formatDuration(session.duration_minutes) || formatDate(session.started_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
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
