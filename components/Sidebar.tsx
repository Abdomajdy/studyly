"use client"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  type UserCourse,
  type RecentSession,
  formatDate,
  formatExamDate,
  getExamUrgencyColor,
} from "@/lib/helpers"

type SidebarProps = {
  activePage: "dashboard" | "sessions" | "analytics" | "settings"
  username: string
  courses: UserCourse[]
  recentSessions: RecentSession[]
  stats: {
    totalSessions: number
    masteryCount: number
    weakCount: number
    avgMastery: number | null
  }
}

const NAV_ITEMS: { key: SidebarProps["activePage"]; label: string; href: string }[] = [
  { key: "dashboard",  label: "dashboard",  href: "/dashboard" },
  { key: "sessions",   label: "sessions",   href: "/sessions" },
  { key: "analytics",  label: "analytics",  href: "/analytics" },
  { key: "settings",   label: "settings",   href: "/settings" },
]

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--success)"
  if (score >= 40) return "var(--accent)"
  return "var(--danger)"
}

export default function Sidebar({ activePage, username, courses, recentSessions, stats }: SidebarProps) {
  const router = useRouter()

  return (
    <div style={{ width: "260px", minHeight: "100vh", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

      {/* Logo */}
      <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text)" }}>
          stud<span style={{ color: "var(--accent)" }}>i</span>ly
        </span>
      </div>

      {/* Nav */}
      <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = item.key === activePage
          return (
            <div
              key={item.key}
              onClick={() => !isActive && router.push(item.href)}
              style={{
                padding: "10px 12px",
                background: isActive ? "var(--bg-2)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "2px",
                cursor: isActive ? "default" : "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseOver={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-2)" }}
              onMouseOut={e => { if (!isActive) e.currentTarget.style.background = "transparent" }}
            >
              <span style={{ fontSize: "11px", color: isActive ? "var(--text-3)" : "var(--text-3)" }}>
                {isActive ? "◆" : "○"}
              </span>
              <span style={{
                fontSize: "13px",
                fontFamily: "DM Mono, monospace",
                letterSpacing: "0.03em",
                color: isActive ? "var(--text)" : "var(--text-2)",
              }}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Courses */}
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

      {/* Recent Sessions */}
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

      {/* Stats */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>stats</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>sessions</p>
            <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.totalSessions}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>topics tracked</p>
            <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.masteryCount}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>weak topics</p>
            <p style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.weakCount}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>avg mastery</p>
            <p style={{
              fontSize: "13px", fontFamily: "DM Serif Display, serif",
              color: stats.avgMastery != null ? getScoreColor(stats.avgMastery) : "var(--text-3)",
            }}>
              {stats.avgMastery ?? "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: "auto", padding: "20px 24px" }}>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", transition: "color 0.2s", padding: 0 }}
          onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
          onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
        >sign out</button>
      </div>
    </div>
  )
}
