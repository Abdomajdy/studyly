"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Sidebar from "@/components/Sidebar"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  getScoreColor,
  getScoreLabel,
  hasExamWithin48Hours,
} from "@/lib/helpers"
import PeerComparison from "@/components/PeerComparison"
import { toast } from "sonner"

// ── Count-up hook (3C) ───────────────────────────────────────────────────────
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === 0) { setValue(0); return }
    const startTime = performance.now()
    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      setValue(Math.floor(progress * target))
      if (progress < 1) requestAnimationFrame(tick)
      else setValue(target)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return value
}

export default function DashboardPage() {
  const router = useRouter()
  const [userId,         setUserId]         = useState("")
  const [mastery,        setMastery]        = useState<MasteryRow[]>([])
  const [username,       setUsername]       = useState("")
  const [loading,        setLoading]        = useState(true)
  const [visible,        setVisible]        = useState(false)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [courses,        setCourses]        = useState<UserCourse[]>([])
  const [totalSessions,  setTotalSessions]  = useState(0)

  // UI state
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [scoreDeltas, setScoreDeltas] = useState<Record<string, number>>({})
  const [masteryExplanations, setMasteryExplanations] = useState<Record<string, string>>({})

  // ── Data loading ──────────────────────────────────────────────────────────
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
      if (profile) setUsername(profile.username)

      const masteryData = await getMastery(user.id)
      setMastery(masteryData)

      // Real total count
      const { count } = await supabase
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      // Recent 5 for sidebar
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("id, topic, started_at, ended_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(5)
      if (sessions) setRecentSessions(sessions)

      const { data: userCourses } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
      if (userCourses) setCourses(userCourses)

      // Latest mastery evaluation per topic for honest explanations
      const { data: evals } = await supabase
        .from("mastery_evaluations")
        .select("topic, honest_summary")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      if (evals) {
        const explanationMap: Record<string, string> = {}
        evals.forEach(e => {
          if (!explanationMap[e.topic]) explanationMap[e.topic] = e.honest_summary
        })
        setMasteryExplanations(explanationMap)
      }

      // Check for exams that were 7 days ago with no outcome recorded
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
      const { data: pastExams } = await supabase
        .from("user_courses")
        .select("course_name, exam_date")
        .eq("user_id", user.id)
        .lte("exam_date", sevenDaysAgo)
        .gte("exam_date", new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0])

      if (pastExams?.length) {
        for (const exam of pastExams) {
          const { data: existing } = await supabase
            .from("exam_outcomes")
            .select("id")
            .eq("user_id", user.id)
            .eq("course", exam.course_name)
            .single()

          if (!existing) {
            toast(`how did your ${exam.course_name} exam go?`, {
              duration: 8000,
              action: {
                label: "TELL US",
                onClick: () => router.push(`/exam-outcome?course=${encodeURIComponent(exam.course_name)}&date=${exam.exam_date}`)
              }
            })
            break // Only show one at a time
          }
        }
      }

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router])

  // ── Real-time mastery refresh on window focus (3A) ──────────────────────
  useEffect(() => {
    async function refetch() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const masteryData = await getMastery(user.id)
      setMastery(masteryData ?? [])
    }
    window.addEventListener("focus", refetch)
    return () => window.removeEventListener("focus", refetch)
  }, [])

  // ── Mastery score delta badges (3B) ─────────────────────────────────────
  useEffect(() => {
    if (!mastery.length) return
    const stored = localStorage.getItem("studyly_last_scores")
    const lastScores: Record<string, number> = stored ? JSON.parse(stored) : {}
    const deltas: Record<string, number> = {}

    mastery.forEach(row => {
      const key = `${row.topic}__${row.course}`
      if (lastScores[key] !== undefined && lastScores[key] !== row.score) {
        deltas[key] = row.score - lastScores[key]
      }
      lastScores[key] = row.score
    })

    setScoreDeltas(deltas)
    localStorage.setItem("studyly_last_scores", JSON.stringify(lastScores))
  }, [mastery])

  // ── Derived values ────────────────────────────────────────────────────────
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

  const isFirstTime = mastery.length === 0 && recentSessions.length === 0

  // ── Animated counters (3C) ──────────────────────────────────────────────
  const animatedSessions = useCountUp(totalSessions)
  const animatedTopics = useCountUp(mastery.length)
  const animatedAvg = useCountUp(avgMastery ?? 0)
  const animatedWeak = useCountUp(mastery.filter(m => m.score < 40).length)

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

      <Sidebar
        activePage="dashboard"
        username={username}
        courses={courses}
        recentSessions={recentSessions}
        examUrgent={hasExamWithin48Hours(courses)}
        stats={{
          totalSessions: animatedSessions,
          masteryCount: animatedTopics,
          weakCount: animatedWeak,
          avgMastery: animatedAvg || null,
        }}
      />

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>

        {/* Background atmosphere orbs (3F) */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{
            position: "absolute", top: "-10%", right: "-5%",
            width: "600px", height: "600px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.03) 0%, transparent 70%)",
            animation: "drift1 20s ease-in-out infinite"
          }} />
          <div style={{
            position: "absolute", bottom: "-10%", left: "-5%",
            width: "500px", height: "500px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.02) 0%, transparent 70%)",
            animation: "drift2 28s ease-in-out infinite"
          }} />
        </div>

        <div className="dash-content" style={{ position: "relative", zIndex: 1 }}>
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
                style={{ width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", padding: "20px", fontFamily: "DM Mono, monospace", fontSize: "14px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "24px", transition: "opacity 0.2s" }}
                onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseOut={e => (e.currentTarget.style.opacity = "1")}
              >Lock In →</button>

              {/* Suggested next recommendation (3E) */}
              {mastery.length > 0 && (() => {
                const weakest = mastery[0]
                const nearestExam = courses
                  .filter(c => c.exam_date)
                  .sort((a, b) => new Date(a.exam_date!).getTime() - new Date(b.exam_date!).getTime())[0]

                const recommendation = weakest.score < 40
                  ? `${weakest.topic} is at ${weakest.score} — that needs work before anything else.`
                  : nearestExam
                  ? `${nearestExam.course_name || nearestExam.course_code} exam is coming up. Focus there.`
                  : `${weakest.topic} is your weakest area right now. Lock in on that.`

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    style={{
                      border: "1px solid var(--border)",
                      borderLeft: "2px solid var(--accent)",
                      padding: "16px 20px",
                      marginBottom: "40px",
                      cursor: "pointer"
                    }}
                    onClick={() => router.push(`/session?topic=${encodeURIComponent(weakest.topic)}`)}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--bg-2)")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <p style={{ color: "var(--accent)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px" }}>
                      SUGGESTED NEXT
                    </p>
                    <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>
                      {recommendation}
                    </p>
                    <p style={{ color: "var(--accent)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginTop: "10px", letterSpacing: "0.08em" }}>
                      LOCK IN ON THIS →
                    </p>
                  </motion.div>
                )
              })()}

              {/* First-time user callout */}
              {isFirstTime && (
                <div style={{
                  border: "1px solid var(--border)",
                  borderLeft: "2px solid var(--accent)",
                  padding: "20px 24px",
                  marginBottom: "56px",
                }}>
                  <p style={{ color: "var(--text-2)", fontSize: "14px", fontFamily: "DM Serif Display, serif", fontStyle: "italic", lineHeight: 1.7 }}>
                    start your first session. pick any topic you're studying right now.
                  </p>
                </div>
              )}

              {/* Mastery table */}
              <div>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>topic mastery</p>
                {mastery.length === 0 ? (
                  <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>no sessions yet. lock in to start tracking.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {mastery.map((row, i) => {
                      const color = getScoreColor(row.score)
                      const isHov = hoveredRow === row.id
                      const deltaKey = `${row.topic}__${row.course}`
                      const delta = scoreDeltas[deltaKey]
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
                            opacity: visible ? 1 : 0,
                            transitionProperty: "transform, box-shadow, opacity",
                            transitionDuration: "0.18s, 0.18s, 0.4s",
                            transitionDelay: `0s, 0s, ${i * 0.05}s`,
                            transitionTimingFunction: "ease",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: "var(--text)", fontSize: "14px", marginBottom: "2px", fontFamily: "DM Mono, monospace" }}>
                              {row.topic}
                            </p>
                            <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: masteryExplanations[row.topic] ? "4px" : "8px" }}>
                              {row.course}
                            </p>
                            {masteryExplanations[row.topic] && (
                              <p style={{ color: "var(--text-3)", fontSize: "11px", fontStyle: "italic", marginBottom: "8px", lineHeight: 1.5, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {masteryExplanations[row.topic]}
                              </p>
                            )}
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
                          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                            {/* Delta badge (3B) */}
                            {delta !== undefined && (
                              <motion.span
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                  fontSize: "11px",
                                  fontFamily: "DM Mono, monospace",
                                  color: delta > 0 ? "var(--success)" : "var(--danger)",
                                }}
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </motion.span>
                            )}
                            <div>
                              <p style={{ color, fontSize: "22px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>
                                {row.score}
                              </p>
                              <p style={{ color, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>
                                {getScoreLabel(row.score)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {userId && <PeerComparison userId={userId} mastery={mastery} />}
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
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(topic.topic)}`)}
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
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, -20px); }
          66% { transform: translate(-20px, 15px); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-25px, 20px); }
          66% { transform: translate(20px, -15px); }
        }
        @keyframes urgentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
