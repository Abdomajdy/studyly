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
  formatExamDate,
  getExamUrgencyColor,
} from "@/lib/helpers"

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Profile
  const [username, setUsername] = useState("")
  const [university, setUniversity] = useState("")
  const [email, setEmail] = useState("")
  const [editingUsername, setEditingUsername] = useState(false)
  const [editingUniversity, setEditingUniversity] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)

  // Courses
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [newCourseName, setNewCourseName] = useState("")
  const [newCourseCode, setNewCourseCode] = useState("")
  const [newExamDate, setNewExamDate] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Sidebar data
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      setUserId(user.id)
      setEmail(user.email ?? "")

      const { data: profile } = await supabase.from("profiles").select("username, university").eq("id", user.id).single()
      if (profile) {
        setUsername(profile.username ?? "")
        setUniversity(profile.university ?? "")
      }

      const masteryData = await getMastery(user.id)
      setMastery(masteryData)

      const { count } = await supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      const { data: sessions } = await supabase.from("study_sessions").select("id, topic, started_at, ended_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(5)
      if (sessions) setRecentSessions(sessions)

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

  // ── Save handlers ─────────────────────────────────────────────────────────
  async function saveField(field: "username" | "university", value: string) {
    if (!userId) return
    const { error } = await supabase.from("profiles").update({ [field]: value.trim() }).eq("id", userId)
    if (error) { console.error(`[settings] save ${field}:`, error); return }
    setSavedField(field)
    setTimeout(() => setSavedField(null), 1500)
    if (field === "username") setEditingUsername(false)
    if (field === "university") setEditingUniversity(false)
  }

  async function addCourse() {
    if (!userId || !newCourseName.trim()) return
    const { data, error } = await supabase
      .from("user_courses")
      .insert({
        user_id: userId,
        course_name: newCourseName.trim(),
        course_code: newCourseCode.trim() || null,
        exam_date: newExamDate || null,
      })
      .select()
      .single()
    if (error) { console.error("[settings] add course:", error); return }
    setCourses(prev => [...prev, data])
    setNewCourseName("")
    setNewCourseCode("")
    setNewExamDate("")
  }

  async function deleteCourse(id: string) {
    const { error } = await supabase.from("user_courses").delete().eq("id", id)
    if (error) { console.error("[settings] delete course:", error); return }
    setCourses(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--bg-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    padding: "12px 16px",
    fontFamily: "DM Mono, monospace",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 0.2s",
  }

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
        activePage="settings"
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

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "64px 48px" }}>
          <div style={{ marginBottom: "48px" }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
              {username || "there"}
            </p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Settings
            </h1>
          </div>

          {/* ── Section 1: Profile ──────────────────────────────────────────── */}
          <div style={{ marginBottom: "40px" }}>
            <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>profile</p>

            {/* Username */}
            <div style={{ marginBottom: "16px" }}>
              <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "6px" }}>username</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {editingUsername ? (
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    onBlur={() => saveField("username", username)}
                    onKeyDown={e => e.key === "Enter" && saveField("username", username)}
                    autoFocus
                    style={{ ...inputStyle, flex: 1 }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingUsername(true)}
                    style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", cursor: "pointer", padding: "12px 0" }}
                  >
                    {username || "—"}
                  </p>
                )}
                {savedField === "username" && (
                  <span style={{ color: "var(--success)", fontSize: "11px", fontFamily: "DM Mono, monospace", transition: "opacity 0.3s" }}>saved</span>
                )}
              </div>
            </div>

            {/* Email (read-only) */}
            <div style={{ marginBottom: "16px" }}>
              <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "6px" }}>email</p>
              <p style={{ color: "var(--text-3)", fontSize: "14px", fontFamily: "DM Mono, monospace", padding: "12px 0" }}>
                {email}
              </p>
            </div>

            {/* University */}
            <div>
              <p style={{ color: "var(--text-3)", fontSize: "11px", marginBottom: "6px" }}>university</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {editingUniversity ? (
                  <input
                    type="text"
                    value={university}
                    onChange={e => setUniversity(e.target.value)}
                    onBlur={() => saveField("university", university)}
                    onKeyDown={e => e.key === "Enter" && saveField("university", university)}
                    autoFocus
                    placeholder="your university"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                ) : (
                  <p
                    onClick={() => setEditingUniversity(true)}
                    style={{ color: university ? "var(--text)" : "var(--text-3)", fontSize: "14px", fontFamily: "DM Mono, monospace", cursor: "pointer", padding: "12px 0", fontStyle: university ? "normal" : "italic" }}
                  >
                    {university || "click to add"}
                  </p>
                )}
                {savedField === "university" && (
                  <span style={{ color: "var(--success)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>saved</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 2: Courses ──────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "40px", marginBottom: "40px" }}>
            <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>courses</p>

            {courses.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "24px" }}>
                {courses.map(course => (
                  <div key={course.id} style={{
                    background: "var(--bg-2)", padding: "14px 16px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <p style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
                          {course.course_name}
                        </p>
                        {course.course_code && (
                          <span style={{ color: "var(--text-3)", fontSize: "11px" }}>{course.course_code}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                      {course.exam_date && (
                        <span style={{ fontSize: "11px", color: getExamUrgencyColor(course.exam_date), fontFamily: "DM Mono, monospace" }}>
                          {formatExamDate(course.exam_date)}
                        </span>
                      )}
                      {deletingId === course.id ? (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => deleteCourse(course.id)}
                            style={{ background: "none", border: "none", color: "var(--danger)", fontSize: "11px", fontFamily: "DM Mono, monospace", cursor: "pointer" }}
                          >yes</button>
                          <button
                            onClick={() => setDeletingId(null)}
                            style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", cursor: "pointer" }}
                          >cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(course.id)}
                          style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "14px", cursor: "pointer", padding: "0 4px", transition: "color 0.2s" }}
                          onMouseOver={e => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add course form */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input
                type="text"
                placeholder="course name"
                value={newCourseName}
                onChange={e => setNewCourseName(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
              />
              <input
                type="text"
                placeholder="code"
                value={newCourseCode}
                onChange={e => setNewCourseCode(e.target.value)}
                style={{ ...inputStyle, width: "120px" }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
              />
              <input
                type="date"
                value={newExamDate}
                onChange={e => setNewExamDate(e.target.value)}
                style={{ ...inputStyle, width: "160px" }}
                onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
            <button
              onClick={addCourse}
              disabled={!newCourseName.trim()}
              style={{
                background: newCourseName.trim() ? "var(--bg-3)" : "transparent",
                color: newCourseName.trim() ? "var(--text-2)" : "var(--text-3)",
                border: "1px solid var(--border)",
                padding: "10px 20px",
                fontFamily: "DM Mono, monospace",
                fontSize: "12px",
                cursor: newCourseName.trim() ? "pointer" : "not-allowed",
                letterSpacing: "0.05em",
                transition: "all 0.2s",
              }}
            >add course</button>
          </div>

          {/* ── Section 3: Account ──────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "40px" }}>
            <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>account</p>

            <div style={{ display: "flex", gap: "16px" }}>
              <button
                onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
                style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--text-3)", padding: "10px 20px",
                  fontFamily: "DM Mono, monospace", fontSize: "12px",
                  cursor: "pointer", letterSpacing: "0.05em",
                  transition: "color 0.2s, border-color 0.2s",
                }}
                onMouseOver={e => { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
                onMouseOut={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
              >sign out</button>

              <button
                title="coming soon"
                style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--text-3)", padding: "10px 20px",
                  fontFamily: "DM Mono, monospace", fontSize: "12px",
                  cursor: "not-allowed", letterSpacing: "0.05em",
                  opacity: 0.5,
                }}
              >delete account</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
