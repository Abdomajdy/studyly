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
import type { FriendWithPresence, StudyGroupSummary } from "@/lib/helpers"
import {
  getFriends, getMyGroups, updatePresence, clearPresence, createGroup,
  searchUsers, sendFriendRequest, getPendingFriendRequests, respondToFriendRequest,
  getPendingGroupInvites, respondToGroupInvite,
  type FriendRequest, type GroupInvite,
} from "@/services/social.service"

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
  const [courseLastTopic, setCourseLastTopic] = useState<Record<string, string>>({})
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<{ id: string; date: string; title: string; type: string }[]>([])
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEventDate, setNewEventDate] = useState("")
  const [newEventTitle, setNewEventTitle] = useState("")
  const [newEventType, setNewEventType] = useState<"exam" | "assignment" | "paper" | "other">("exam")
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [newCourseName, setNewCourseName] = useState("")
  const [newCourseCode, setNewCourseCode] = useState("")
  const [newExamDate, setNewExamDate] = useState("")

  // Social state
  const [friends, setFriends] = useState<FriendWithPresence[]>([])
  const [groups, setGroups] = useState<StudyGroupSummary[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupCourse, setNewGroupCourse] = useState("")

  // Friend request state
  const [friendSearch, setFriendSearch] = useState("")
  const [friendSearchResults, setFriendSearchResults] = useState<{ id: string; username: string }[]>([])
  const [friendSearching, setFriendSearching] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [pendingGroupInvites, setPendingGroupInvites] = useState<GroupInvite[]>([])
  const [inviteTab, setInviteTab] = useState<"search" | "requests">("search")

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

      // Last studied topic per course
      const { data: courseSessions } = await supabase
        .from("study_sessions")
        .select("topic, course, started_at")
        .eq("user_id", user.id)
        .not("course", "is", null)
        .order("started_at", { ascending: false })
      if (courseSessions) {
        const lastMap: Record<string, string> = {}
        courseSessions.forEach(s => {
          if (s.course && !lastMap[s.course.toLowerCase()]) lastMap[s.course.toLowerCase()] = s.topic
        })
        setCourseLastTopic(lastMap)
      }

      // Calendar events
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, date, title, type")
        .eq("user_id", user.id)
        .order("date", { ascending: true })
      if (events) setCalendarEvents(events)

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

      // Social data
      const [friendsData, groupsData, requestsData, groupInvitesData] = await Promise.all([
        getFriends(user.id),
        getMyGroups(user.id),
        getPendingFriendRequests(user.id),
        getPendingGroupInvites(user.id),
      ])
      setFriends(friendsData)
      setGroups(groupsData)
      setPendingRequests(requestsData)
      setPendingGroupInvites(groupInvitesData)

      // Set presence to online
      await updatePresence(user.id, "online")

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()

    // Clear presence on tab close
    const handleUnload = () => {
      if (userId) {
        navigator.sendBeacon("/api/presence-clear", JSON.stringify({ userId }))
      }
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [router])

  // ── Add calendar event ──────────────────────────────────────────────────
  async function addCalendarEvent() {
    if (!newEventDate || !newEventTitle.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({ user_id: user.id, date: newEventDate, title: newEventTitle.trim(), type: newEventType })
      .select()
      .single()
    if (error) { console.error("[addCalendarEvent]", error); toast.error("failed to add event"); return }
    if (data) setCalendarEvents(prev => [...prev, data])
    setNewEventDate("")
    setNewEventTitle("")
    setNewEventType("exam")
    setShowAddEvent(false)
    toast.success("event added")
  }

  async function addCourse() {
    if (!newCourseName.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from("user_courses")
      .insert({
        user_id: user.id,
        course_name: newCourseName.trim(),
        course_code: newCourseCode.trim() || null,
        exam_date: newExamDate || null,
      })
      .select()
      .single()
    if (error) { console.error("[addCourse]", error); toast.error("failed to add course"); return }
    if (data) setCourses(prev => [...prev, data])
    setNewCourseName("")
    setNewCourseCode("")
    setNewExamDate("")
    setShowAddCourse(false)
    toast.success("course added")
  }

  async function deleteCalendarEvent(id: string) {
    await supabase.from("calendar_events").delete().eq("id", id)
    setCalendarEvents(prev => prev.filter(e => e.id !== id))
  }

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
        stats={{
          totalSessions: animatedSessions,
          masteryCount: animatedTopics,
          weakCount: animatedWeak,
          avgMastery: animatedAvg || null,
        }}
        friends={friends}
        groups={groups}
        pendingCount={pendingRequests.length + pendingGroupInvites.length}
        onAddFriend={() => { setInviteTab(pendingRequests.length + pendingGroupInvites.length > 0 ? "requests" : "search"); setShowInviteModal(true) }}
        onCreateGroup={() => setShowCreateGroupModal(true)}
      />

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>

        {/* Background atmosphere orbs (3F) */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          {/* Noise texture overlay */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.03,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat", backgroundSize: "128px 128px",
          }} />
          <div style={{
            position: "absolute", top: "-10%", right: "-5%",
            width: "600px", height: "600px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.035) 0%, transparent 70%)",
            animation: "drift1 20s ease-in-out infinite"
          }} />
          <div style={{
            position: "absolute", bottom: "-10%", left: "-5%",
            width: "500px", height: "500px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.025) 0%, transparent 70%)",
            animation: "drift2 28s ease-in-out infinite"
          }} />
          <div style={{
            position: "absolute", top: "40%", left: "30%",
            width: "400px", height: "400px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(126,184,218,0.015) 0%, transparent 70%)",
            animation: "drift1 35s ease-in-out infinite reverse"
          }} />
        </div>

        <div className="dash-content" style={{ position: "relative", zIndex: 1 }}>
          <div className="dash-grid">

            {/* ── Left column: heading + courses hero + mastery ─────────────── */}
            <div>
              {/* Dynamic heading */}
              <div style={{ marginBottom: "32px" }}>
                <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                  {username || "there"}
                </p>
                <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                  {headLine1} <span style={{ fontStyle: headItalic ? "italic" : "normal" }}>{headLine2}</span>
                </h1>
              </div>

              {/* Lock In button */}
              <button
                onClick={() => router.push("/session")}
                className="lock-in-btn"
                style={{ width: "100%", background: "linear-gradient(135deg, #f0ede8 0%, #d8d3ca 100%)", color: "var(--bg)", border: "none", padding: "20px", fontFamily: "DM Mono, monospace", fontSize: "14px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "24px", transition: "all 0.3s ease", position: "relative", overflow: "hidden" }}
              >Lock In</button>

              {/* First-time user callout */}
              {isFirstTime && (
                <div style={{
                  border: "1px solid var(--border)",
                  borderLeft: "2px solid var(--accent)",
                  padding: "20px 24px",
                  marginBottom: "40px",
                }}>
                  <p style={{ color: "var(--text-2)", fontSize: "14px", fontFamily: "DM Serif Display, serif", fontStyle: "italic", lineHeight: 1.7 }}>
                    start your first session. pick any topic you're studying right now.
                  </p>
                </div>
              )}

              {/* ── COURSES HERO ──────────────────────────────────────────────── */}
              <div style={{ marginBottom: "48px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    your courses
                  </p>
                  <button
                    onClick={() => setShowAddCourse(!showAddCourse)}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" }}
                  >
                    {showAddCourse ? "cancel" : "+ add"}
                  </button>
                </div>

                {/* Add course form */}
                <div style={{
                  display: "grid",
                  gridTemplateRows: showAddCourse ? "1fr" : "0fr",
                  transition: "grid-template-rows 0.3s ease",
                  marginBottom: showAddCourse ? "12px" : "0",
                }}>
                  <div style={{ overflow: "hidden" }}>
                  <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "20px", opacity: showAddCourse ? 1 : 0, transition: "opacity 0.2s ease" }}>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <input
                        type="text"
                        placeholder="course name"
                        value={newCourseName}
                        onChange={e => setNewCourseName(e.target.value)}
                        autoFocus
                        style={{
                          flex: 2, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                          padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: "12px", outline: "none",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                      />
                      <input
                        type="text"
                        placeholder="code (opt)"
                        value={newCourseCode}
                        onChange={e => setNewCourseCode(e.target.value)}
                        style={{
                          flex: 1, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                          padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: "12px", outline: "none",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="date"
                        value={newExamDate}
                        onChange={e => setNewExamDate(e.target.value)}
                        style={{
                          flex: 1, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                          padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: "12px", outline: "none",
                          colorScheme: "dark",
                        }}
                      />
                      <button
                        onClick={addCourse}
                        disabled={!newCourseName.trim()}
                        style={{
                          background: newCourseName.trim() ? "var(--text)" : "var(--bg-3)",
                          color: newCourseName.trim() ? "var(--bg)" : "var(--text-3)",
                          border: "none", padding: "10px 20px", fontFamily: "DM Mono, monospace", fontSize: "11px",
                          cursor: newCourseName.trim() ? "pointer" : "not-allowed",
                          letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s",
                          flexShrink: 0,
                        }}
                      >
                        Add
                      </button>
                    </div>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "8px" }}>
                      exam date is optional — add it when you know it
                    </p>
                  </div>
                  </div>
                </div>

                {courses.length === 0 && !showAddCourse ? (
                  <div style={{ background: "var(--bg-2)", border: "1px dashed var(--border)", padding: "32px 24px", textAlign: "center" }}>
                    <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic", lineHeight: 1.7, marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                      no courses yet. add your first one to start tracking.
                    </p>
                    <button
                      onClick={() => setShowAddCourse(true)}
                      style={{ background: "var(--text)", color: "var(--bg)", border: "none", padding: "12px 32px", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}
                    >
                      Add Course
                    </button>
                  </div>
                ) : courses.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {courses.map((course, ci) => {
                      const courseTopics = mastery.filter(m =>
                        m.course.toLowerCase() === course.course_name.toLowerCase() ||
                        m.course.toLowerCase() === (course.course_code || "").toLowerCase()
                      )
                      const courseAvg = courseTopics.length > 0
                        ? Math.round(courseTopics.reduce((s, m) => s + m.score, 0) / courseTopics.length)
                        : null
                      const courseWeak = courseTopics.filter(m => m.score < 40).length
                      const daysUntilExam = course.exam_date
                        ? Math.ceil((new Date(course.exam_date).getTime() - Date.now()) / 86400000)
                        : null
                      const lastTopic = courseLastTopic[course.course_name.toLowerCase()] || courseLastTopic[(course.course_code || "").toLowerCase()] || null
                      const weakestInCourse = courseTopics.length > 0 ? courseTopics.reduce((a, b) => a.score < b.score ? a : b) : null
                      const isHov = hoveredRow === `course-${course.id}`

                      return (
                        <div
                          key={course.id}
                          onMouseOver={() => setHoveredRow(`course-${course.id}`)}
                          onMouseOut={() => setHoveredRow(null)}
                          onClick={() => router.push(`/course?name=${encodeURIComponent(course.course_name)}`)}
                          style={{
                            background: isHov ? "var(--bg-3)" : "var(--bg-2)",
                            border: "1px solid var(--border)",
                            borderLeft: `3px solid ${courseAvg !== null ? getScoreColor(courseAvg) : "var(--accent-dim)"}`,
                            padding: "24px",
                            cursor: "pointer",
                            boxShadow: isHov ? "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(200,169,110,0.06)" : "0 0 0 rgba(0,0,0,0)",
                            transition: "box-shadow 0.25s ease, background 0.25s ease",
                            opacity: 0, animation: "fadeIn 0.4s ease forwards",
                            animationDelay: `${ci * 0.08}s`,
                            minWidth: 0, overflow: "hidden",
                          }}
                        >
                          {/* Course header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                            <div style={{ minWidth: 0 }}>
                              <h3 style={{ color: "var(--text)", fontSize: "16px", fontFamily: "DM Serif Display, serif", lineHeight: 1.3, marginBottom: "4px" }}>
                                {course.course_name}
                              </h3>
                              {course.course_code && (
                                <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                                  {course.course_code}
                                </p>
                              )}
                            </div>
                            {courseAvg !== null && (
                              <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "12px" }}>
                                <p style={{ color: getScoreColor(courseAvg), fontSize: "28px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>
                                  {courseAvg}
                                </p>
                                <p style={{ color: getScoreColor(courseAvg), fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>
                                  {getScoreLabel(courseAvg)}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Mastery bar */}
                          {courseAvg !== null && (
                            <div style={{ height: "3px", background: "var(--border)", marginBottom: "16px", width: "100%" }}>
                              <div style={{
                                height: "100%",
                                width: visible ? `${courseAvg}%` : "0%",
                                background: getScoreColor(courseAvg),
                                opacity: 0.7,
                                transition: `width 0.8s ease ${ci * 0.1}s`,
                              }} />
                            </div>
                          )}

                          {/* Stats row */}
                          <div style={{ display: "flex", gap: "16px", fontSize: "11px", fontFamily: "DM Mono, monospace", color: "var(--text-3)", marginBottom: "12px" }}>
                            <span>{courseTopics.length} topic{courseTopics.length !== 1 ? "s" : ""}</span>
                            {courseWeak > 0 && <span style={{ color: "var(--danger)" }}>{courseWeak} weak</span>}
                            {daysUntilExam !== null && (
                              <span style={{
                                color: daysUntilExam <= 2 ? "var(--danger)" : daysUntilExam <= 7 ? "var(--accent)" : "var(--text-3)",
                                fontWeight: daysUntilExam <= 2 ? 600 : 400,
                              }}>
                                exam {daysUntilExam <= 0 ? "TODAY" : daysUntilExam === 1 ? "TOMORROW" : `in ${daysUntilExam}d`}
                              </span>
                            )}
                          </div>

                          {/* Last studied / weakest topic */}
                          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                            {lastTopic && (
                              <p style={{ color: "var(--text-2)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginBottom: weakestInCourse ? "6px" : "0" }}>
                                <span style={{ color: "var(--text-3)" }}>last: </span>{lastTopic}
                              </p>
                            )}
                            {weakestInCourse && weakestInCourse.score < 50 && (
                              <p style={{ color: "var(--danger)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                                <span style={{ color: "var(--text-3)" }}>weakest: </span>{weakestInCourse.topic} ({weakestInCourse.score})
                              </p>
                            )}
                            {!lastTopic && !weakestInCourse && (
                              <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", fontStyle: "italic" }}>
                                no sessions yet
                              </p>
                            )}
                          </div>

                          {/* Hover CTA */}
                          {isHov && (
                            <p style={{ color: "var(--accent)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "12px" }}>
                              {weakestInCourse ? `lock in on ${weakestInCourse.topic} →` : "start a session →"}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>

              {/* Topic mastery moved to /analytics and /patterns */}

              {userId && <PeerComparison userId={userId} mastery={mastery} />}
            </div>

            {/* ── Right column: calendar + needs work ─────────────────────── */}
            <div
              className="right-panel"
              style={{
                opacity: visible ? 1 : 0,
                transition: "opacity 0.4s ease 0.3s",
              }}
            >
              {/* Calendar */}
              <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "24px", marginBottom: "20px" }}>
                {/* Month navigation */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-3)", cursor: "pointer", fontSize: "12px", padding: "6px 10px", fontFamily: "DM Mono, monospace", transition: "all 0.15s" }}
                    onMouseOver={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
                    onMouseOut={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
                  >
                    ←
                  </button>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text)", fontSize: "15px", fontFamily: "DM Serif Display, serif", letterSpacing: "0.02em" }}>
                      {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][calendarMonth.getMonth()]}
                    </p>
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                      {calendarMonth.getFullYear()}
                    </p>
                  </div>
                  <button
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-3)", cursor: "pointer", fontSize: "12px", padding: "6px 10px", fontFamily: "DM Mono, monospace", transition: "all 0.15s" }}
                    onMouseOver={e => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--text-3)" }}
                    onMouseOut={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
                  >
                    →
                  </button>
                </div>

                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0", marginBottom: "4px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em" }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                {(() => {
                  const year = calendarMonth.getFullYear()
                  const month = calendarMonth.getMonth()
                  const firstDay = new Date(year, month, 1).getDay()
                  const daysInMonth = new Date(year, month + 1, 0).getDate()
                  const today = new Date()
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

                  const eventTypeColor: Record<string, string> = {
                    exam: "var(--danger)",
                    assignment: "var(--accent)",
                    paper: "#7b68ee",
                    other: "var(--text-3)",
                  }

                  // Build event map for this month: merge course exams + custom events
                  const dateEventMap: Record<string, { title: string; type: string; id?: string }[]> = {}

                  // Course exams
                  courses.forEach(c => {
                    if (!c.exam_date) return
                    const ed = new Date(c.exam_date)
                    if (ed.getMonth() === month && ed.getFullYear() === year) {
                      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(ed.getDate()).padStart(2, "0")}`
                      if (!dateEventMap[key]) dateEventMap[key] = []
                      dateEventMap[key].push({ title: `${c.course_code || c.course_name} exam`, type: "exam" })
                    }
                  })

                  // Custom events
                  calendarEvents.forEach(ev => {
                    const [ey, em, eday] = ev.date.split("-").map(Number)
                    if (em - 1 === month && ey === year) {
                      const key = `${ey}-${String(em).padStart(2, "0")}-${String(eday).padStart(2, "0")}`
                      if (!dateEventMap[key]) dateEventMap[key] = []
                      dateEventMap[key].push({ title: ev.title, type: ev.type, id: ev.id })
                    }
                  })

                  const cells: React.ReactNode[] = []
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(<div key={`empty-${i}`} style={{ padding: "8px 0" }} />)
                  }
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    const isToday = dateStr === todayStr
                    const events = dateEventMap[dateStr]
                    const isHovDate = hoveredDate === dateStr

                    cells.push(
                      <div
                        key={day}
                        onMouseOver={() => events ? setHoveredDate(dateStr) : undefined}
                        onMouseOut={() => setHoveredDate(null)}
                        style={{
                          textAlign: "center",
                          padding: "4px 0",
                          position: "relative",
                        }}
                      >
                        <div style={{
                          display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: isToday ? "var(--text)" : isHovDate && events ? "var(--bg-3)" : "transparent",
                          transition: "background 0.15s",
                          cursor: events ? "pointer" : "default",
                        }}>
                          <span style={{
                            fontSize: "13px", fontFamily: "DM Mono, monospace",
                            color: isToday ? "var(--bg)" : events ? "var(--text)" : "var(--text-3)",
                            fontWeight: isToday || events ? 600 : 400,
                          }}>
                            {day}
                          </span>
                        </div>

                        {/* Event dots */}
                        {events && (
                          <div style={{
                            display: "flex", gap: "3px", justifyContent: "center",
                            position: "absolute", bottom: "0", left: "50%", transform: "translateX(-50%)",
                          }}>
                            {events.slice(0, 3).map((ev, ei) => (
                              <div key={ei} style={{
                                width: "5px", height: "5px", borderRadius: "50%",
                                background: eventTypeColor[ev.type] || "var(--text-3)",
                              }} />
                            ))}
                          </div>
                        )}

                        {/* Hover tooltip */}
                        {isHovDate && events && (
                          <div style={{
                            position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
                            background: "var(--bg)", border: "1px solid var(--border)",
                            padding: "10px 14px", zIndex: 20,
                            minWidth: "160px", textAlign: "left",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                          }}>
                            <p style={{ color: "var(--text-3)", fontSize: "9px", fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>
                              {new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </p>
                            {events.map((ev, ei) => (
                              <div key={ei} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: ei < events.length - 1 ? "4px" : "0" }}>
                                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: eventTypeColor[ev.type] || "var(--text-3)", flexShrink: 0 }} />
                                <p style={{ color: "var(--text)", fontSize: "11px", fontFamily: "DM Mono, monospace", lineHeight: 1.4 }}>
                                  {ev.title}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0" }}>
                      {cells}
                    </div>
                  )
                })()}

                {/* Legend */}
                <div style={{ display: "flex", gap: "16px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  {[
                    { label: "exam", color: "var(--danger)" },
                    { label: "assignment", color: "var(--accent)" },
                    { label: "paper", color: "#7b68ee" },
                    { label: "other", color: "var(--text-3)" },
                  ].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: l.color }} />
                      <span style={{ fontSize: "9px", fontFamily: "DM Mono, monospace", color: "var(--text-3)", letterSpacing: "0.05em" }}>{l.label}</span>
                    </div>
                  ))}
                </div>

                {/* Add event button */}
                <button
                  onClick={() => setShowAddEvent(!showAddEvent)}
                  style={{
                    width: "100%", marginTop: "12px",
                    background: "none", border: "1px dashed var(--border)",
                    color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "11px",
                    padding: "10px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
                    transition: "all 0.15s",
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent-dim)"; e.currentTarget.style.color = "var(--accent)" }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)" }}
                >
                  {showAddEvent ? "cancel" : "+ add event"}
                </button>

                {/* Add event form */}
                <div style={{
                  display: "grid",
                  gridTemplateRows: showAddEvent ? "1fr" : "0fr",
                  transition: "grid-template-rows 0.3s ease",
                }}>
                  <div style={{ overflow: "hidden" }}>
                  <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px", opacity: showAddEvent ? 1 : 0, transition: "opacity 0.2s ease" }}>
                    <input
                      type="text"
                      placeholder="e.g. CHEM 1101 midterm"
                      value={newEventTitle}
                      onChange={e => setNewEventTitle(e.target.value)}
                      style={{
                        background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                        padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: "12px", outline: "none",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                    />
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={e => setNewEventDate(e.target.value)}
                      style={{
                        background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
                        padding: "10px 12px", fontFamily: "DM Mono, monospace", fontSize: "12px", outline: "none",
                        colorScheme: "dark",
                      }}
                    />
                    <div style={{ display: "flex", gap: "4px" }}>
                      {(["exam", "assignment", "paper", "other"] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setNewEventType(t)}
                          style={{
                            flex: 1, padding: "8px 4px",
                            background: newEventType === t ? "var(--bg-3)" : "var(--bg)",
                            border: `1px solid ${newEventType === t ? "var(--text-3)" : "var(--border)"}`,
                            color: newEventType === t ? "var(--text)" : "var(--text-3)",
                            fontSize: "10px", fontFamily: "DM Mono, monospace", cursor: "pointer",
                            letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.15s",
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={addCalendarEvent}
                      disabled={!newEventTitle.trim() || !newEventDate}
                      style={{
                        background: newEventTitle.trim() && newEventDate ? "var(--text)" : "var(--bg-3)",
                        color: newEventTitle.trim() && newEventDate ? "var(--bg)" : "var(--text-3)",
                        border: "none", padding: "10px", fontFamily: "DM Mono, monospace", fontSize: "11px",
                        cursor: newEventTitle.trim() && newEventDate ? "pointer" : "not-allowed",
                        letterSpacing: "0.08em", textTransform: "uppercase", transition: "all 0.15s",
                      }}
                    >
                      Add Event
                    </button>
                  </div>
                  </div>
                </div>
              </div>

              {/* Upcoming events list */}
              {(() => {
                const todayStr = new Date().toISOString().split("T")[0]
                const allUpcoming: { title: string; date: string; type: string; id?: string }[] = []

                // Course exams
                courses.forEach(c => {
                  if (c.exam_date && c.exam_date >= todayStr) {
                    allUpcoming.push({ title: `${c.course_code || c.course_name} exam`, date: c.exam_date, type: "exam" })
                  }
                })
                // Custom events
                calendarEvents.forEach(ev => {
                  if (ev.date >= todayStr) {
                    allUpcoming.push({ title: ev.title, date: ev.date, type: ev.type, id: ev.id })
                  }
                })

                allUpcoming.sort((a, b) => a.date.localeCompare(b.date))

                if (allUpcoming.length === 0) return null

                const eventTypeColor: Record<string, string> = {
                  exam: "var(--danger)", assignment: "var(--accent)", paper: "#7b68ee", other: "var(--text-3)",
                }

                return (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>
                      upcoming
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {allUpcoming.slice(0, 5).map((ev, i) => {
                        const daysLeft = Math.ceil((new Date(ev.date).getTime() - Date.now()) / 86400000)
                        return (
                          <div key={i} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 12px",
                            borderLeft: `2px solid ${eventTypeColor[ev.type] || "var(--border)"}`,
                            background: daysLeft <= 2 && ev.type === "exam" ? "rgba(224,90,90,0.04)" : "transparent",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                              <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ev.title}
                              </p>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                              <span style={{
                                fontSize: "11px", fontFamily: "DM Mono, monospace", fontWeight: 600,
                                color: daysLeft <= 2 ? "var(--danger)" : daysLeft <= 7 ? "var(--accent)" : "var(--text-3)",
                              }}>
                                {daysLeft === 0 ? "TODAY" : daysLeft === 1 ? "1d" : `${daysLeft}d`}
                              </span>
                              {ev.id && (
                                <button
                                  onClick={() => deleteCalendarEvent(ev.id!)}
                                  style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: "10px", padding: "0 2px", fontFamily: "DM Mono, monospace" }}
                                  onMouseOver={e => (e.currentTarget.style.color = "var(--danger)")}
                                  onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
                                >
                                  x
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Suggested next */}
              {mastery.length > 0 && (() => {
                const weakest = mastery[0]
                const nearestExam = courses
                  .filter(c => c.exam_date)
                  .sort((a, b) => new Date(a.exam_date!).getTime() - new Date(b.exam_date!).getTime())[0]

                const recommendation = weakest.score < 40
                  ? `${weakest.topic} is at ${weakest.score} — needs work.`
                  : nearestExam
                  ? `${nearestExam.course_name || nearestExam.course_code} exam coming up.`
                  : `${weakest.topic} is your weakest right now.`

                return (
                  <div
                    onClick={() => router.push(`/session?topic=${encodeURIComponent(weakest.topic)}`)}
                    style={{
                      borderLeft: "2px solid var(--accent)",
                      padding: "12px 14px",
                      marginBottom: "20px",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = "var(--bg-2)")}
                    onMouseOut={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <p style={{ color: "var(--accent)", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px" }}>
                      SUGGESTED NEXT
                    </p>
                    <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", lineHeight: "1.6" }}>
                      {recommendation}
                    </p>
                  </div>
                )
              })()}

              {/* Needs work */}
              {weakTopics.length > 0 && (
                <div>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>
                    needs work
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {weakTopics.map(topic => (
                      <div
                        key={topic.id}
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(topic.topic)}`)}
                        style={{
                          background: "var(--bg-2)",
                          borderLeft: "2px solid var(--danger)",
                          padding: "10px 12px",
                          cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = "var(--bg-3)")}
                        onMouseOut={e => (e.currentTarget.style.background = "var(--bg-2)")}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p style={{ color: "var(--text)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                            {topic.topic}
                          </p>
                          <span style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Serif Display, serif", flexShrink: 0, paddingLeft: "8px" }}>
                            {topic.score}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <style>{`
        .dash-content {
          max-width: 1280px;
          margin: 0 auto;
          padding: 64px 40px 64px 48px;
        }
        .dash-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 48px;
          align-items: start;
        }
        @media (min-width: 1100px) {
          .dash-grid { grid-template-columns: 1fr 400px; }
        }
        @media (max-width: 600px) {
          .dash-content { padding: 40px 24px; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; }
        }
        .lock-in-btn:hover {
          box-shadow: 0 0 24px rgba(200,169,110,0.15), 0 4px 16px rgba(0,0,0,0.2);
          transform: translateY(-1px);
        }
        .lock-in-btn:active {
          transform: translateY(0);
          box-shadow: 0 0 8px rgba(200,169,110,0.1);
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
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

      {/* ═══════════════════════════════════════════════════════════════
          INVITE FRIEND MODAL
          ═══════════════════════════════════════════════════════════ */}
      {showInviteModal && (
        <div
          onClick={() => setShowInviteModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "32px", width: "420px", maxWidth: "90vw" }}
          >
            <p style={{ color: "var(--text)", fontSize: "18px", fontFamily: "DM Serif Display, serif", marginBottom: "20px" }}>
              Friends
            </p>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "2px", marginBottom: "20px" }}>
              {(["search", "requests"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setInviteTab(tab)}
                  style={{
                    flex: 1, padding: "10px", border: "none",
                    background: inviteTab === tab ? "var(--bg-3)" : "var(--bg-2)",
                    color: inviteTab === tab ? "var(--text)" : "var(--text-3)",
                    fontFamily: "DM Mono, monospace", fontSize: "11px",
                    cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
                    transition: "all 0.15s", position: "relative",
                  }}
                >
                  {tab === "search" ? "add friend" : "requests"}
                  {tab === "requests" && (pendingRequests.length + pendingGroupInvites.length) > 0 && (
                    <span style={{
                      position: "absolute", top: 4, right: 8,
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: "var(--accent)",
                    }} />
                  )}
                </button>
              ))}
            </div>

            {inviteTab === "search" ? (
              <div>
                <input
                  type="text"
                  placeholder="search by username..."
                  value={friendSearch}
                  onChange={async (e) => {
                    const q = e.target.value
                    setFriendSearch(q)
                    if (q.trim().length >= 2) {
                      setFriendSearching(true)
                      const results = await searchUsers(q, userId)
                      setFriendSearchResults(results)
                      setFriendSearching(false)
                    } else {
                      setFriendSearchResults([])
                    }
                  }}
                  style={{
                    background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)",
                    padding: "12px 16px", fontFamily: "DM Mono, monospace", fontSize: "13px",
                    width: "100%", outline: "none", marginBottom: "4px",
                  }}
                />

                {friendSearch.trim().length >= 2 && (
                  <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                    {friendSearching ? (
                      <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", padding: "12px", textAlign: "center" }}>
                        searching...
                      </p>
                    ) : friendSearchResults.length === 0 ? (
                      <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", padding: "12px", textAlign: "center" }}>
                        no users found
                      </p>
                    ) : (
                      friendSearchResults.map(user => {
                        const alreadyFriend = friends.some(f => f.user_id === user.id)
                        return (
                          <div
                            key={user.id}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "10px 12px", borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{
                                width: "28px", height: "28px", borderRadius: "50%",
                                background: "var(--bg-3)", display: "flex",
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <span style={{ fontSize: "10px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                                  {user.username[0] || "?"}
                                </span>
                              </div>
                              <span style={{ fontSize: "12px", fontFamily: "DM Mono, monospace", color: "var(--text-2)" }}>
                                {user.username}
                              </span>
                            </div>
                            {alreadyFriend ? (
                              <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>
                                friends
                              </span>
                            ) : (
                              <button
                                onClick={async () => {
                                  const result = await sendFriendRequest(userId, user.id)
                                  if (result.success) {
                                    toast.success(`request sent to ${user.username}`)
                                  } else {
                                    toast.error(result.error || "failed")
                                  }
                                }}
                                style={{
                                  background: "none", border: "1px solid var(--border)",
                                  color: "var(--text-2)", padding: "4px 12px",
                                  fontFamily: "DM Mono, monospace", fontSize: "10px",
                                  cursor: "pointer", transition: "all 0.15s",
                                }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)" }}
                              >
                                add
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {friendSearch.trim().length < 2 && (
                  <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", padding: "12px", textAlign: "center", fontStyle: "italic" }}>
                    type at least 2 characters to search
                  </p>
                )}
              </div>
            ) : (
              <div style={{ maxHeight: "340px", overflowY: "auto" }}>
                {/* Friend requests */}
                {pendingRequests.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
                      friend requests
                    </p>
                    {pendingRequests.map(req => (
                      <div
                        key={req.id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 12px", background: "var(--bg-2)", marginBottom: "2px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{
                            width: "28px", height: "28px", borderRadius: "50%",
                            background: "var(--bg-3)", display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}>
                            <span style={{ fontSize: "10px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                              {req.sender_username[0]}
                            </span>
                          </div>
                          <span style={{ fontSize: "12px", fontFamily: "DM Mono, monospace", color: "var(--text-2)" }}>
                            {req.sender_username}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={async () => {
                              const ok = await respondToFriendRequest(req.id, userId, true)
                              if (ok) {
                                toast.success(`${req.sender_username} added!`)
                                setPendingRequests(prev => prev.filter(r => r.id !== req.id))
                                const updated = await getFriends(userId)
                                setFriends(updated)
                              }
                            }}
                            style={{
                              background: "var(--text)", color: "var(--bg)", border: "none",
                              padding: "4px 12px", fontFamily: "DM Mono, monospace", fontSize: "10px",
                              cursor: "pointer",
                            }}
                          >
                            accept
                          </button>
                          <button
                            onClick={async () => {
                              await respondToFriendRequest(req.id, userId, false)
                              setPendingRequests(prev => prev.filter(r => r.id !== req.id))
                            }}
                            style={{
                              background: "none", border: "1px solid var(--border)",
                              color: "var(--text-3)", padding: "4px 10px",
                              fontFamily: "DM Mono, monospace", fontSize: "10px",
                              cursor: "pointer",
                            }}
                          >
                            decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Group invites */}
                {pendingGroupInvites.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
                      group invites
                    </p>
                    {pendingGroupInvites.map(inv => (
                      <div
                        key={inv.id}
                        style={{
                          padding: "12px", background: "var(--bg-2)", marginBottom: "2px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                          <div>
                            <p style={{ color: "var(--text)", fontSize: "12px", fontFamily: "DM Mono, monospace" }}>
                              {inv.group_name}
                            </p>
                            <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                              {inv.group_course} &middot; invited by {inv.invited_by_username}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            onClick={async () => {
                              const ok = await respondToGroupInvite(inv.id, userId, true)
                              if (ok) {
                                toast.success(`joined ${inv.group_name}!`)
                                setPendingGroupInvites(prev => prev.filter(i => i.id !== inv.id))
                                const updated = await getMyGroups(userId)
                                setGroups(updated)
                              }
                            }}
                            style={{
                              background: "var(--text)", color: "var(--bg)", border: "none",
                              padding: "4px 12px", fontFamily: "DM Mono, monospace", fontSize: "10px",
                              cursor: "pointer",
                            }}
                          >
                            join
                          </button>
                          <button
                            onClick={async () => {
                              await respondToGroupInvite(inv.id, userId, false)
                              setPendingGroupInvites(prev => prev.filter(i => i.id !== inv.id))
                            }}
                            style={{
                              background: "none", border: "1px solid var(--border)",
                              color: "var(--text-3)", padding: "4px 10px",
                              fontFamily: "DM Mono, monospace", fontSize: "10px",
                              cursor: "pointer",
                            }}
                          >
                            decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingRequests.length === 0 && pendingGroupInvites.length === 0 && (
                  <div style={{ padding: "24px", textAlign: "center" }}>
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                      no pending requests
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => { setShowInviteModal(false); setFriendSearch(""); setFriendSearchResults([]) }}
              style={{
                background: "none", border: "none", color: "var(--text-3)",
                fontFamily: "DM Mono, monospace", fontSize: "11px", cursor: "pointer",
                marginTop: "20px", padding: 0, width: "100%", textAlign: "center",
              }}
            >
              close
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CREATE GROUP MODAL
          ═══════════════════════════════════════════════════════════ */}
      {showCreateGroupModal && (
        <div
          onClick={() => setShowCreateGroupModal(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--bg)", border: "1px solid var(--border)", padding: "32px", width: "400px", maxWidth: "90vw" }}
          >
            <p style={{ color: "var(--text)", fontSize: "18px", fontFamily: "DM Serif Display, serif", marginBottom: "20px" }}>
              Create a Study Group
            </p>

            <input
              type="text"
              placeholder="group name"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              style={{
                background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)",
                padding: "12px 16px", fontFamily: "DM Mono, monospace", fontSize: "13px",
                width: "100%", outline: "none", marginBottom: "8px",
              }}
            />

            {courses.length > 0 ? (
              <select
                value={newGroupCourse}
                onChange={e => setNewGroupCourse(e.target.value)}
                style={{
                  background: "var(--bg-2)", color: newGroupCourse ? "var(--text)" : "var(--text-3)",
                  border: "1px solid var(--border)", padding: "12px 16px",
                  fontFamily: "DM Mono, monospace", fontSize: "13px",
                  width: "100%", outline: "none", marginBottom: "16px",
                  cursor: "pointer",
                }}
              >
                <option value="" disabled>select a course</option>
                {courses.map(c => (
                  <option key={c.id} value={c.course_name}>{c.course_name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="course name"
                value={newGroupCourse}
                onChange={e => setNewGroupCourse(e.target.value)}
                style={{
                  background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)",
                  padding: "12px 16px", fontFamily: "DM Mono, monospace", fontSize: "13px",
                  width: "100%", outline: "none", marginBottom: "16px",
                }}
              />
            )}

            <button
              onClick={async () => {
                if (!newGroupName.trim() || !newGroupCourse.trim()) return
                const groupId = await createGroup(userId, newGroupName, newGroupCourse)
                if (groupId) {
                  toast.success("group created!")
                  setNewGroupName("")
                  setNewGroupCourse("")
                  setShowCreateGroupModal(false)
                  const updated = await getMyGroups(userId)
                  setGroups(updated)
                } else {
                  toast.error("failed to create group")
                }
              }}
              disabled={!newGroupName.trim() || !newGroupCourse.trim()}
              style={{
                background: newGroupName.trim() && newGroupCourse.trim() ? "var(--text)" : "var(--bg-3)",
                color: newGroupName.trim() && newGroupCourse.trim() ? "var(--bg)" : "var(--text-3)",
                border: "none", padding: "12px 24px", fontFamily: "DM Mono, monospace",
                fontSize: "12px",
                cursor: newGroupName.trim() && newGroupCourse.trim() ? "pointer" : "not-allowed",
                width: "100%", letterSpacing: "0.05em", textTransform: "uppercase",
              }}
            >
              create group
            </button>

            <button
              onClick={() => { setShowCreateGroupModal(false); setNewGroupName(""); setNewGroupCourse("") }}
              style={{
                background: "none", border: "none", color: "var(--text-3)",
                fontFamily: "DM Mono, monospace", fontSize: "11px", cursor: "pointer",
                marginTop: "16px", padding: 0, width: "100%", textAlign: "center",
              }}
            >
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
