"use client"
import { useEffect, useState, useMemo, Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter, useSearchParams } from "next/navigation"
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

type CourseSession = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  course: string | null
}

type SessionOutcome = {
  session_id: string
  summary: string
}

// ── SVG Mastery Ring ────────────────────────────────────────────────────────
function MasteryRing({ score, size = 140, stroke = 8 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const [animatedOffset, setAnimatedOffset] = useState(circumference)

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedOffset(circumference - (score / 100) * circumference)
    }, 300)
    return () => clearTimeout(timer)
  }, [score, circumference])

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Background track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--border)" strokeWidth={stroke}
        />
        {/* Score arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={getScoreColor(score)} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <p style={{
          color: getScoreColor(score), fontSize: "32px",
          fontFamily: "DM Serif Display, serif", lineHeight: 1,
        }}>
          {score}
        </p>
        <p style={{
          color: "var(--text-3)", fontSize: "9px",
          letterSpacing: "0.12em", textTransform: "uppercase", marginTop: "4px",
        }}>
          {getScoreLabel(score)}
        </p>
      </div>
    </div>
  )
}

// ── Activity heatmap (last 8 weeks) ─────────────────────────────────────────
function ActivityHeatmap({ sessions }: { sessions: CourseSession[] }) {
  const weeks = 8
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build date -> count map
  const dateMap = useMemo(() => {
    const map: Record<string, number> = {}
    sessions.forEach(s => {
      const d = new Date(s.started_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [sessions])

  // Generate grid — 7 rows (Mon–Sun), `weeks` columns
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - (weeks * 7 - 1) - startDate.getDay() + 1)

  const cells: { date: Date; key: string; count: number }[] = []
  const d = new Date(startDate)
  while (d <= today) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    cells.push({ date: new Date(d), key, count: dateMap[key] || 0 })
    d.setDate(d.getDate() + 1)
  }

  const maxCount = Math.max(1, ...cells.map(c => c.count))

  function getCellColor(count: number): string {
    if (count === 0) return "var(--bg-3)"
    const intensity = Math.min(count / maxCount, 1)
    if (intensity > 0.7) return "var(--accent)"
    if (intensity > 0.3) return "var(--accent-dim)"
    return "#3d3428"
  }

  const dayLabels = ["M", "", "W", "", "F", "", ""]
  const cellSize = 14
  const gap = 3

  // Group cells into columns by week
  const columns: typeof cells[] = []
  let col: typeof cells = []
  cells.forEach((cell, i) => {
    const dayOfWeek = cell.date.getDay()
    const mondayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    if (mondayIndex === 0 && col.length > 0) {
      columns.push(col)
      col = []
    }
    col.push(cell)
  })
  if (col.length > 0) columns.push(col)

  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  return (
    <div>
      <div style={{ display: "flex", gap: `${gap}px` }}>
        {/* Day labels */}
        <div style={{ display: "flex", flexDirection: "column", gap: `${gap}px`, marginRight: "4px" }}>
          {dayLabels.map((label, i) => (
            <div key={i} style={{
              width: "12px", height: `${cellSize}px`,
              fontSize: "8px", color: "var(--text-3)", fontFamily: "DM Mono, monospace",
              display: "flex", alignItems: "center",
            }}>
              {label}
            </div>
          ))}
        </div>
        {/* Week columns */}
        {columns.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: `${gap}px` }}>
            {week.map(cell => (
              <div
                key={cell.key}
                onMouseOver={() => setHoveredCell(cell.key)}
                onMouseOut={() => setHoveredCell(null)}
                style={{
                  width: `${cellSize}px`, height: `${cellSize}px`,
                  background: getCellColor(cell.count),
                  borderRadius: "2px",
                  position: "relative",
                  transition: "transform 0.1s",
                  transform: hoveredCell === cell.key ? "scale(1.3)" : "scale(1)",
                }}
              >
                {hoveredCell === cell.key && cell.count > 0 && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                    background: "var(--bg-3)", border: "1px solid var(--border)",
                    padding: "4px 8px", whiteSpace: "nowrap", zIndex: 10,
                    fontSize: "10px", color: "var(--text-2)", fontFamily: "DM Mono, monospace",
                  }}>
                    {cell.count} session{cell.count !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CoursePageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    }>
      <CoursePage />
    </Suspense>
  )
}

function CoursePage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const searchParams = useSearchParams()
  const courseName = searchParams.get("name") || ""

  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [userId, setUserId] = useState("")
  const [username, setUsername] = useState("")

  // Course data
  const [course, setCourse] = useState<UserCourse | null>(null)
  const [topics, setTopics] = useState<MasteryRow[]>([])
  const [sessions, setSessions] = useState<CourseSession[]>([])
  const [outcomes, setOutcomes] = useState<Record<string, string>>({})

  // Sidebar data
  const [allMastery, setAllMastery] = useState<MasteryRow[]>([])
  const [allCourses, setAllCourses] = useState<UserCourse[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

  // UI
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      setUserId(user.id)

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single()
      if (profile) setUsername(profile.username ?? "")

      // Get course info
      const { data: courseData } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .or(`course_name.ilike.${courseName},course_code.ilike.${courseName}`)
        .limit(1)
        .single()
      if (courseData) setCourse(courseData)

      // All courses for sidebar
      const { data: allCoursesData } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
      if (allCoursesData) setAllCourses(allCoursesData)

      // All mastery
      const masteryData = await getMastery(user.id)
      setAllMastery(masteryData)

      // Filter topics for this course
      const courseTopics = masteryData.filter(m =>
        m.course.toLowerCase() === courseName.toLowerCase() ||
        m.course.toLowerCase() === (courseData?.course_code || "").toLowerCase()
      )
      setTopics(courseTopics)

      // Sessions for this course
      const { data: sessionsData } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at, duration_minutes, course")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
      if (sessionsData) {
        const filtered = sessionsData.filter((s: CourseSession) =>
          s.course?.toLowerCase() === courseName.toLowerCase() ||
          s.course?.toLowerCase() === (courseData?.course_code || "").toLowerCase()
        )
        setSessions(filtered)

        // Get outcomes for completed sessions
        const completedIds = filtered.filter(s => s.ended_at).map(s => s.id)
        if (completedIds.length > 0) {
          const { data: outcomesData } = await supabase
            .from("session_outcomes")
            .select("session_id, summary")
            .in("session_id", completedIds)
          if (outcomesData) {
            const map: Record<string, string> = {}
            outcomesData.forEach((o: SessionOutcome) => { map[o.session_id] = o.summary })
            setOutcomes(map)
          }
        }

        // Recent sessions for sidebar
        setRecentSessions(sessionsData.slice(0, 5).map((s: CourseSession) => ({
          id: s.id, topic: s.topic, started_at: s.started_at, ended_at: s.ended_at,
        })))
      }

      const { count } = await supabase
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router, courseName])

  // ── Derived data ──────────────────────────────────────────────────────────
  const avgScore = topics.length > 0
    ? Math.round(topics.reduce((s, t) => s + t.score, 0) / topics.length)
    : null
  const weakTopics = topics.filter(t => t.score < 40).sort((a, b) => a.score - b.score)
  const strongTopics = topics.filter(t => t.score >= 70)
  const shakyTopics = topics.filter(t => t.score >= 40 && t.score < 70)
  const completedSessions = sessions.filter(s => s.ended_at)
  const totalMinutes = completedSessions.reduce((s, sess) => s + (sess.duration_minutes || 0), 0)
  const daysUntilExam = course?.exam_date
    ? Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / 86400000)
    : null

  // Smart recommendation: weakest + most stale topic
  const recommendedTopic = useMemo(() => {
    if (topics.length === 0) return null
    const now = Date.now()
    // Score each topic: lower mastery + more days since study = higher priority
    const scored = topics.map(t => {
      const daysSince = t.last_studied_at
        ? Math.floor((now - new Date(t.last_studied_at).getTime()) / 86400000)
        : 30 // never studied = high staleness
      // Priority = (100 - score) + staleness bonus
      const priority = (100 - t.score) + Math.min(daysSince * 3, 30)
      return { ...t, priority, daysSince }
    })
    return scored.sort((a, b) => b.priority - a.priority)[0]
  }, [topics])

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const groups: { label: string; sessions: CourseSession[] }[] = []
    const groupMap: Record<string, CourseSession[]> = {}
    sessions.forEach(s => {
      const d = new Date(s.started_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(s)
    })
    Object.entries(groupMap).forEach(([dateKey, sess]) => {
      groups.push({ label: formatDate(dateKey + "T00:00:00"), sessions: sess })
    })
    return groups
  }, [sessions])

  // Coverage: % of unique topics studied at least once
  const topicsCovered = topics.length
  const topicsStrong = strongTopics.length

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
        activePage="dashboard"
        stats={{
          totalSessions,
          masteryCount: allMastery.length,
          weakCount: allMastery.filter(m => m.score < 40).length,
          avgMastery: allMastery.length > 0 ? Math.round(allMastery.reduce((s, m) => s + m.score, 0) / allMastery.length) : null,
        }}
        friends={sidebar.friends}
        groups={sidebar.groups}
        pendingCount={sidebar.pendingCount}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 48px 80px" }}>

          {/* ── Back nav ─────────────────────────────────────────────────── */}
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontSize: "11px", fontFamily: "DM Mono, monospace", cursor: "pointer",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "40px",
              padding: 0, transition: "color 0.2s",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            &larr; dashboard
          </button>

          {/* ═══════════════════════════════════════════════════════════════
              HERO: Course header + Mastery Ring + Exam Countdown
              ═══════════════════════════════════════════════════════════ */}
          <div style={{
            display: "grid", gridTemplateColumns: avgScore !== null ? "1fr auto" : "1fr",
            gap: "48px", alignItems: "start", marginBottom: "48px",
          }}>
            {/* Left: title + stats */}
            <div>
              {course?.course_code && (
                <p style={{
                  color: "var(--accent-dim)", fontSize: "12px", fontFamily: "DM Mono, monospace",
                  letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px",
                }}>
                  {course.course_code}
                </p>
              )}
              <h1 className="flourish-underline" style={{
                fontFamily: "DM Serif Display, serif", fontSize: "44px",
                color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
                marginBottom: "32px",
              }}>
                {course?.course_name || courseName}
              </h1>

              {/* Stat chips */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
                {[
                  { label: `${topicsCovered} topic${topicsCovered !== 1 ? "s" : ""}`, color: "var(--text-2)" },
                  { label: `${completedSessions.length} session${completedSessions.length !== 1 ? "s" : ""}`, color: "var(--text-2)" },
                  ...(totalMinutes > 0 ? [{ label: totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m studied` : `${totalMinutes}m studied`, color: "var(--text-2)" }] : []),
                  ...(strongTopics.length > 0 ? [{ label: `${strongTopics.length} strong`, color: "var(--success)" }] : []),
                  ...(weakTopics.length > 0 ? [{ label: `${weakTopics.length} weak`, color: "var(--danger)" }] : []),
                ].map((chip, i) => (
                  <span key={i} style={{
                    border: "1px solid var(--border)",
                    padding: "6px 12px", fontSize: "11px", fontFamily: "DM Mono, monospace",
                    color: chip.color, letterSpacing: "0.03em",
                  }}>
                    {chip.label}
                  </span>
                ))}
              </div>

              {/* Exam countdown — emotional when close */}
              {daysUntilExam !== null && daysUntilExam >= 0 && (
                <div style={{
                  background: daysUntilExam <= 3 ? "rgba(224,90,90,0.08)" : "transparent",
                  border: `1px solid ${daysUntilExam <= 3 ? "var(--danger)" : "var(--border)"}`,
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: "16px",
                }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: daysUntilExam <= 2 ? "var(--danger)" : daysUntilExam <= 7 ? "var(--accent)" : "var(--text-3)",
                    animation: daysUntilExam <= 3 ? "pulse 2s ease infinite" : "none",
                  }} />
                  <div>
                    <p style={{
                      color: daysUntilExam <= 2 ? "var(--danger)" : daysUntilExam <= 7 ? "var(--accent)" : "var(--text)",
                      fontSize: "14px", fontFamily: "DM Serif Display, serif",
                    }}>
                      {daysUntilExam === 0 ? "Exam is today" :
                       daysUntilExam === 1 ? "Exam is tomorrow" :
                       `${daysUntilExam} days until exam`}
                    </p>
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                      {course?.exam_date ? new Date(course.exam_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Mastery ring */}
            {avgScore !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <MasteryRing score={avgScore} />
                <p style={{ color: "var(--text-3)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  course mastery
                </p>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SMART RECOMMENDATION
              ═══════════════════════════════════════════════════════════ */}
          {recommendedTopic && (
            <div
              onClick={() => router.push(`/session?topic=${encodeURIComponent(recommendedTopic.topic)}&course=${encodeURIComponent(courseName)}`)}
              style={{
                border: "1px solid var(--border)",
                padding: "24px 28px", marginBottom: "32px", cursor: "pointer",
                transition: "border-color 0.2s, transform 0.15s",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.transform = "translateY(-1px)" }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)" }}
            >
              <div>
                <p style={{ color: "var(--text-3)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
                  recommended next
                </p>
                <p style={{ color: "var(--text)", fontSize: "16px", fontFamily: "DM Serif Display, serif", marginBottom: "4px" }}>
                  {recommendedTopic.topic}
                </p>
                <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                  {recommendedTopic.score < 40 ? "struggling" : recommendedTopic.score < 70 ? "shaky" : "review"} &middot; score {recommendedTopic.score}
                  {recommendedTopic.last_studied_at ? ` \u00b7 last studied ${formatDate(recommendedTopic.last_studied_at)}` : " \u00b7 never studied"}
                </p>
              </div>
              <div style={{
                background: "var(--text)", color: "var(--bg)",
                padding: "10px 24px", fontFamily: "DM Mono, monospace", fontSize: "11px",
                letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0,
              }}>
                lock in
              </div>
            </div>
          )}

          {/* ── Full-width CTA (for empty or generic start) ──────────────── */}
          {!recommendedTopic && (
            <button
              onClick={() => router.push(`/session?course=${encodeURIComponent(courseName)}`)}
              style={{
                background: "var(--text)", color: "var(--bg)", border: "none",
                padding: "16px 40px", fontFamily: "DM Mono, monospace", fontSize: "13px",
                cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
                transition: "opacity 0.2s", width: "100%", marginBottom: "32px",
              }}
              onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseOut={e => (e.currentTarget.style.opacity = "1")}
            >
              start a session
            </button>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              TWO-COLUMN LAYOUT: Topics + Activity
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "40px", marginBottom: "48px" }}>

            {/* ── LEFT: Topic mastery cards ────────────────────────────────── */}
            <div>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                topic mastery
              </p>

              {topics.length === 0 ? (
                <div style={{ background: "var(--bg-2)", border: "1px dashed var(--border)", padding: "40px 24px", textAlign: "center" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic", fontFamily: "DM Mono, monospace" }}>
                    no topics yet — start a session to track mastery
                  </p>
                </div>
              ) : (
                <div>
                  {[...topics].sort((a, b) => a.score - b.score).map((topic, i, arr) => {
                    const isHov = hoveredTopic === topic.id
                    const daysSince = topic.last_studied_at
                      ? Math.floor((Date.now() - new Date(topic.last_studied_at).getTime()) / 86400000)
                      : null
                    const isStale = daysSince !== null && daysSince >= 7

                    return (
                      <div
                        key={topic.id}
                        onMouseOver={() => setHoveredTopic(topic.id)}
                        onMouseOut={() => setHoveredTopic(null)}
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(topic.topic)}&course=${encodeURIComponent(courseName)}`)}
                        style={{
                          background: isHov ? "var(--bg-2)" : "transparent",
                          padding: "16px 4px",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                          borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                          opacity: 0, animation: "fadeIn 0.4s ease forwards",
                          animationDelay: `${i * 0.04}s`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                            <p style={{
                              color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {topic.topic}
                            </p>
                            {/* Status tag */}
                            {topic.score < 40 && (
                              <span style={{ fontSize: "9px", color: "var(--danger)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                                weak
                              </span>
                            )}
                            {isStale && topic.score >= 40 && (
                              <span style={{ fontSize: "9px", color: "var(--accent-dim)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                                stale
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, paddingLeft: "12px" }}>
                            {topic.last_studied_at && (
                              <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>
                                {formatDate(topic.last_studied_at)}
                              </p>
                            )}
                            <p style={{
                              color: getScoreColor(topic.score), fontSize: "15px",
                              fontFamily: "DM Serif Display, serif", width: "28px", textAlign: "right",
                            }}>
                              {topic.score}
                            </p>
                          </div>
                        </div>
                        {/* Mastery bar */}
                        <div style={{ height: "2px", background: "var(--border)", width: "100%" }}>
                          <div style={{
                            height: "100%", width: `${topic.score}%`,
                            background: getScoreColor(topic.score), opacity: 0.6,
                            transition: "width 0.6s ease",
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── RIGHT: Activity + quick actions ─────────────────────────── */}
            <div>
              {/* Activity heatmap */}
              {sessions.length > 0 && (
                <div style={{ marginBottom: "32px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                    activity
                  </p>
                  <div>
                    <ActivityHeatmap sessions={sessions} />
                    <div style={{ display: "flex", gap: "12px", marginTop: "12px", justifyContent: "flex-end" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>less</span>
                      {["var(--bg-3)", "#3d3428", "var(--accent-dim)", "var(--accent)"].map((c, i) => (
                        <div key={i} style={{ width: "10px", height: "10px", background: c, borderRadius: "2px" }} />
                      ))}
                      <span style={{ fontSize: "9px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>more</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Course breakdown */}
              <div style={{ marginBottom: "32px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                  breakdown
                </p>
                <div>
                  {topics.length > 0 ? (
                    <>
                      {/* Visual topic distribution */}
                      <div style={{ display: "flex", height: "6px", gap: "2px", marginBottom: "16px", overflow: "hidden" }}>
                        {strongTopics.length > 0 && (
                          <div style={{ flex: strongTopics.length, background: "var(--success)", opacity: 0.7, borderRadius: "1px" }} />
                        )}
                        {shakyTopics.length > 0 && (
                          <div style={{ flex: shakyTopics.length, background: "var(--accent)", opacity: 0.7, borderRadius: "1px" }} />
                        )}
                        {weakTopics.length > 0 && (
                          <div style={{ flex: weakTopics.length, background: "var(--danger)", opacity: 0.7, borderRadius: "1px" }} />
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {[
                          { label: "strong (70+)", count: strongTopics.length, color: "var(--success)" },
                          { label: "shaky (40–69)", count: shakyTopics.length, color: "var(--accent)" },
                          { label: "weak (<40)", count: weakTopics.length, color: "var(--danger)" },
                        ].map(row => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: row.color }} />
                              <span style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>{row.label}</span>
                            </div>
                            <span style={{ color: row.count > 0 ? row.color : "var(--text-3)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>
                              {row.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", fontStyle: "italic" }}>
                      no data yet
                    </p>
                  )}
                </div>
              </div>

              {/* Needs work — quick chips */}
              {weakTopics.length > 0 && (
                <div>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                    needs work
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {weakTopics.map(t => (
                      <button
                        key={t.id}
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(t.topic)}&course=${encodeURIComponent(courseName)}`)}
                        style={{
                          background: "transparent", border: "1px solid var(--border)",
                          color: "var(--danger)", padding: "6px 12px",
                          fontFamily: "DM Mono, monospace", fontSize: "10px", cursor: "pointer",
                          transition: "border-color 0.2s",
                        }}
                        onMouseOver={e => (e.currentTarget.style.borderColor = "var(--danger)")}
                        onMouseOut={e => (e.currentTarget.style.borderColor = "var(--border)")}
                      >
                        {t.topic} ({t.score})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              SESSION TIMELINE
              ═══════════════════════════════════════════════════════════ */}
          {sessions.length > 0 && (
            <div style={{ marginBottom: "48px" }}>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>
                session history
              </p>
              <div style={{ position: "relative" }}>
                {/* Timeline line */}
                <div style={{
                  position: "absolute", left: "7px", top: "8px", bottom: "8px",
                  width: "1px", background: "var(--border)",
                }} />

                {sessionsByDate.slice(0, 8).map((group, gi) => (
                  <div key={gi} style={{ marginBottom: "24px" }}>
                    {/* Date label */}
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
                      <div style={{
                        width: "15px", height: "15px", borderRadius: "50%",
                        background: "var(--bg)", border: "2px solid var(--border)",
                        position: "relative", zIndex: 1,
                      }} />
                      <p style={{ color: "var(--text-2)", fontSize: "11px", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                        {group.label}
                      </p>
                    </div>

                    {/* Sessions for this date */}
                    <div style={{ marginLeft: "31px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      {group.sessions.map(sess => {
                        const isExpanded = expandedSession === sess.id
                        const summary = outcomes[sess.id]
                        const time = new Date(sess.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

                        return (
                          <div
                            key={sess.id}
                            onClick={() => setExpandedSession(isExpanded ? null : sess.id)}
                            style={{
                              background: "var(--bg-2)", padding: "14px 18px",
                              cursor: summary ? "pointer" : "default",
                              transition: "background 0.15s",
                            }}
                            onMouseOver={e => (e.currentTarget.style.background = "var(--bg-3)")}
                            onMouseOut={e => (e.currentTarget.style.background = "var(--bg-2)")}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <p style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
                                  {sess.topic}
                                </p>
                                {!sess.ended_at && (
                                  <span style={{
                                    color: "var(--accent)", fontSize: "9px", letterSpacing: "0.1em",
                                    textTransform: "uppercase", fontFamily: "DM Mono, monospace",
                                  }}>
                                    in progress
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                                {sess.duration_minutes && sess.duration_minutes > 0 && (
                                  <span style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>
                                    {sess.duration_minutes}m
                                  </span>
                                )}
                                <span style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>
                                  {time}
                                </span>
                                {summary && (
                                  <span style={{ color: "var(--text-3)", fontSize: "11px", transition: "transform 0.15s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                                    &#9662;
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Expandable summary */}
                            {isExpanded && summary && (
                              <div style={{
                                marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)",
                              }}>
                                <p style={{
                                  color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace",
                                  lineHeight: 1.7, whiteSpace: "pre-wrap",
                                }}>
                                  {summary}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              EMPTY STATE
              ═══════════════════════════════════════════════════════════ */}
          {topics.length === 0 && sessions.length === 0 && (
            <div style={{
              background: "var(--bg-2)", border: "1px dashed var(--border)",
              padding: "64px 32px", textAlign: "center",
            }}>
              <p style={{
                fontFamily: "DM Serif Display, serif", fontSize: "24px",
                color: "var(--text)", marginBottom: "12px",
              }}>
                Fresh start
              </p>
              <p style={{
                color: "var(--text-3)", fontSize: "13px", fontStyle: "italic",
                lineHeight: 1.7, marginBottom: "28px", fontFamily: "DM Mono, monospace",
                maxWidth: "360px", margin: "0 auto 28px",
              }}>
                No sessions yet for this course. Your first study session will start building your mastery map here.
              </p>
              <button
                onClick={() => router.push(`/session?course=${encodeURIComponent(courseName)}`)}
                style={{
                  background: "var(--text)", color: "var(--bg)", border: "none",
                  padding: "14px 40px", fontFamily: "DM Mono, monospace", fontSize: "12px",
                  cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
                }}
              >
                Start First Session
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
