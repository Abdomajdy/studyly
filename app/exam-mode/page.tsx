"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { getMastery } from "@/services/mastery.service"
import Sidebar from "@/components/Sidebar"
import {
  type MasteryRow,
  type RecentSession,
  type UserCourse,
  getScoreColor,
} from "@/lib/helpers"

export default function ExamModePage() {
  const router = useRouter()
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [activeExam, setActiveExam] = useState<UserCourse | null>(null)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single()
      if (profile) setUsername(profile.username)

      const { data: userCourses } = await supabase
        .from("user_courses")
        .select("id, course_name, course_code, exam_date")
        .eq("user_id", user.id)
        .order("exam_date", { ascending: true })
      if (userCourses) setCourses(userCourses)

      const masteryData = await getMastery(user.id)
      setMastery(masteryData ?? [])

      const { count } = await supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      const { data: sessions } = await supabase.from("study_sessions").select("id, topic, started_at, ended_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(5)
      if (sessions) setRecentSessions(sessions)

      // Find exam within 48 hours
      const now = new Date()
      const upcoming = (userCourses ?? []).find(c => {
        if (!c.exam_date) return false
        const examDate = new Date(c.exam_date)
        const diffHours = (examDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        return diffHours >= 0 && diffHours <= 48
      })
      if (upcoming) setActiveExam(upcoming)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router])

  function getDaysUntil(dateStr: string) {
    const diff = new Date(dateStr).getTime() - Date.now()
    const hours = diff / (1000 * 60 * 60)
    if (hours < 24) return `${Math.ceil(hours)}h`
    return `${Math.ceil(hours / 24)}d`
  }

  const avgMastery = mastery.length > 0
    ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length)
    : null

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>loading...</p>
    </div>
  )

  const examTopics = activeExam
    ? mastery
        .filter(m => m.course.toLowerCase().includes(activeExam.course_name.toLowerCase()) ||
                     activeExam.course_name.toLowerCase().includes(m.course.toLowerCase()))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
    : mastery.sort((a, b) => a.score - b.score).slice(0, 3)

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", display: "flex",
      opacity: visible ? 1 : 0, transition: "opacity 0.6s ease"
    }}>
      <Sidebar
        activePage="exam-mode"
        username={username}
        courses={courses}
        recentSessions={recentSessions}
        stats={{
          totalSessions,
          masteryCount: mastery.length,
          weakCount: mastery.filter(m => m.score < 40).length,
          avgMastery,
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {/* Orb */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "10%", right: "5%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(224,90,90,0.04) 0%, transparent 70%)", animation: "drift1 20s ease-in-out infinite" }} />
        </div>

        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "64px 48px", position: "relative", zIndex: 1 }}>

          <div style={{ marginBottom: "48px" }}>
            <p style={{ color: "var(--danger)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "DM Mono, monospace" }}>
              EXAM MODE
            </p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "12px" }}>
              {activeExam
                ? `${activeExam.course_name} in ${getDaysUntil(activeExam.exam_date!)}.`
                : "No exam in the next 48 hours."
              }
            </h1>
            {activeExam ? (
              <p style={{ color: "var(--text-3)", fontSize: "14px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>
                here are the {examTopics.length} topics you need to lock in on before tomorrow. no decisions. just these.
              </p>
            ) : (
              <p style={{ color: "var(--text-3)", fontSize: "14px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>
                exam mode activates 48 hours before your exam. add your exam dates in settings.
              </p>
            )}
          </div>

          {examTopics.length > 0 && (
            <div style={{ marginBottom: "48px" }}>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                {activeExam ? "LOCK IN ON THESE — IN ORDER" : "YOUR WEAKEST TOPICS"}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {examTopics.map((t, i) => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/session?topic=${encodeURIComponent(t.topic)}`)}
                    style={{
                      background: "var(--bg-2)",
                      borderLeft: `2px solid ${getScoreColor(t.score)}`,
                      padding: "20px 24px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      cursor: "pointer", transition: "all 0.2s"
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)" }}
                    onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none" }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace" }}>{i + 1}</span>
                        <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace" }}>{t.topic}</p>
                      </div>
                      <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", paddingLeft: "22px" }}>{t.course}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: getScoreColor(t.score), fontSize: "22px", fontFamily: "DM Serif Display, serif" }}>{t.score}</p>
                      <p style={{ color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>LOCK IN →</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {courses.filter(c => c.exam_date).length > 0 && (
            <div style={{ marginBottom: "48px" }}>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                UPCOMING EXAMS
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)" }}>
                {courses.filter(c => c.exam_date).map(c => {
                  const daysLeft = Math.ceil((new Date(c.exam_date!).getTime() - Date.now()) / 86400000)
                  const isUrgent = daysLeft <= 2
                  return (
                    <div key={c.id} style={{
                      background: isUrgent ? "rgba(224,90,90,0.04)" : "var(--bg)",
                      padding: "18px 24px",
                      display: "flex", alignItems: "center", justifyContent: "space-between"
                    }}>
                      <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace" }}>
                        {c.course_code || c.course_name}
                      </p>
                      <p style={{ color: isUrgent ? "var(--danger)" : "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
                        {daysLeft <= 0 ? "TODAY" : `${daysLeft}d`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontFamily: "DM Mono, monospace", fontSize: "12px",
              cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
              transition: "color 0.2s"
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            ← BACK TO DASHBOARD
          </button>
        </div>
      </div>

      <style>{`
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-20px, 20px); }
        }
      `}</style>
    </div>
  )
}
