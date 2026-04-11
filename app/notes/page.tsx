"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import { Download } from "lucide-react"

type SessionNote = {
  id: string
  session_id: string
  topic: string
  course: string
  type: string
  title: string
  body: string
  created_at: string
}

type GroupedSession = {
  session_id: string
  topic: string
  course: string
  date: string
  notes: SessionNote[]
}

export default function NotesPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [notes, setNotes] = useState<SessionNote[]>([])
  const [mastery, setMastery] = useState<{ score: number }[]>([])
  const [totalSessions, setTotalSessions] = useState(0)
  const [username, setUsername] = useState("")
  const [filterCourse, setFilterCourse] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const [notesRes, masteryData, sessionsRes, profileRes] = await Promise.all([
        supabase.from("session_notes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        getMastery(user.id),
        supabase.from("study_sessions").select("id", { count: "exact" }).eq("user_id", user.id),
        supabase.from("profiles").select("username").eq("id", user.id).single(),
      ])

      setNotes(notesRes.data || [])
      setMastery(masteryData || [])
      setTotalSessions(sessionsRes.count || 0)
      setUsername(profileRes.data?.username || "")
      setLoading(false)
      setTimeout(() => setVisible(true), 30)
    }
    load()
  }, [router])

  const courses = [...new Set(notes.map(n => n.course))].sort()

  const filtered = notes.filter(n => {
    if (filterCourse !== "all" && n.course !== filterCourse) return false
    if (filterType !== "all" && n.type !== filterType) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!n.title.toLowerCase().includes(q) && !n.body.toLowerCase().includes(q) && !n.topic.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Group notes by session
  const grouped: GroupedSession[] = []
  const sessionMap = new Map<string, GroupedSession>()
  for (const note of filtered) {
    const existing = sessionMap.get(note.session_id)
    if (existing) {
      existing.notes.push(note)
    } else {
      const group: GroupedSession = {
        session_id: note.session_id,
        topic: note.topic,
        course: note.course,
        date: note.created_at,
        notes: [note],
      }
      sessionMap.set(note.session_id, group)
      grouped.push(group)
    }
  }

  function downloadNotes(group: GroupedSession) {
    const header = `# Session Notes - ${group.topic}\n# ${group.course} | ${new Date(group.date).toLocaleDateString()}\n${"─".repeat(40)}\n\n`
    const body = group.notes.map(n => {
      const label = n.type === "struggle" ? "STRUGGLED WITH" : n.type === "key_concept" ? "KEY CONCEPT" : n.type === "formula" ? "FORMULA" : "INSIGHT"
      return `[${label}] ${n.title}\n${n.body}\n`
    }).join("\n")
    const blob = new Blob([header + body], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${group.topic.replace(/\s+/g, "-").toLowerCase()}-notes.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAll() {
    let content = `# All Session Notes\n# Downloaded ${new Date().toLocaleDateString()}\n${"═".repeat(50)}\n\n`
    for (const group of grouped) {
      content += `\n${"─".repeat(40)}\n${group.topic} (${group.course})\n${new Date(group.date).toLocaleDateString()}\n${"─".repeat(40)}\n\n`
      for (const n of group.notes) {
        const label = n.type === "struggle" ? "STRUGGLED WITH" : n.type === "key_concept" ? "KEY CONCEPT" : n.type === "formula" ? "FORMULA" : "INSIGHT"
        content += `[${label}] ${n.title}\n${n.body}\n\n`
      }
    }
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `studyly-notes-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const avgMastery = mastery.length > 0 ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length) : null

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>loading...</p>
      </div>
    )
  }

  const icons: Record<string, string> = { struggle: "!", key_concept: "◆", formula: "∑", insight: "→" }
  const colors: Record<string, string> = { struggle: "var(--danger)", key_concept: "var(--accent)", formula: "#7eb8da", insight: "var(--success)" }
  const labels: Record<string, string> = { struggle: "struggle", key_concept: "concept", formula: "formula", insight: "insight" }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="notes"
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
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "64px 48px" }}>

          {/* Header */}
          <div style={{ marginBottom: "32px" }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "DM Mono, monospace" }}>
              {username || "there"}
            </p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "32px", color: "var(--text)", marginBottom: "8px" }}>
              session notes
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>
              AI-extracted notes from your study sessions — struggles, solutions, and key concepts.
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "28px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              placeholder="search notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)",
                padding: "8px 14px", fontSize: "12px", fontFamily: "DM Mono, monospace",
                width: "220px", outline: "none",
              }}
            />
            <select
              value={filterCourse}
              onChange={e => setFilterCourse(e.target.value)}
              style={{
                background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-2)",
                padding: "8px 12px", fontSize: "12px", fontFamily: "DM Mono, monospace",
                outline: "none", cursor: "pointer",
              }}
            >
              <option value="all">all courses</option>
              {courses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              style={{
                background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-2)",
                padding: "8px 12px", fontSize: "12px", fontFamily: "DM Mono, monospace",
                outline: "none", cursor: "pointer",
              }}
            >
              <option value="all">all types</option>
              <option value="struggle">struggles</option>
              <option value="key_concept">concepts</option>
              <option value="formula">formulas</option>
              <option value="insight">insights</option>
            </select>

            {grouped.length > 0 && (
              <button
                onClick={downloadAll}
                style={{
                  marginLeft: "auto", background: "none", border: "1px solid var(--border)",
                  color: "var(--text-2)", padding: "8px 14px", fontSize: "11px",
                  fontFamily: "DM Mono, monospace", cursor: "pointer", letterSpacing: "0.05em",
                  display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)" }}
              >
                <Download size={12} /> DOWNLOAD ALL
              </button>
            )}
          </div>

          {/* Empty state */}
          {grouped.length === 0 && (
            <div style={{
              border: "1px dashed var(--border)", padding: "60px 40px",
              textAlign: "center", marginTop: "20px",
            }}>
              {notes.length === 0 ? (
                <>
                  <p style={{ color: "var(--text-2)", fontSize: "16px", fontFamily: "DM Serif Display, serif", marginBottom: "10px" }}>
                    no notes yet
                  </p>
                  <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", lineHeight: 1.7 }}>
                    notes are automatically generated when you end a study session.<br />
                    the AI identifies what you struggled with and how it was resolved.
                  </p>
                </>
              ) : (
                <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace" }}>
                  no notes match your filters.
                </p>
              )}
            </div>
          )}

          {/* Grouped notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {grouped.map(group => (
              <div key={group.session_id} className="dark-fixed" style={{
                border: "1px solid var(--border)", padding: "24px",
              }}>
                {/* Session header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
                  <div>
                    <h3 style={{ fontFamily: "DM Serif Display, serif", fontSize: "18px", color: "var(--text)", marginBottom: "4px" }}>
                      {group.topic}
                    </h3>
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", display: "flex", gap: "12px" }}>
                      <span>{group.course}</span>
                      <span>{new Date(group.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span>{group.notes.length} note{group.notes.length !== 1 ? "s" : ""}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => downloadNotes(group)}
                    style={{
                      background: "none", border: "1px solid var(--border)",
                      color: "var(--text-3)", padding: "6px 10px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "5px",
                      fontSize: "10px", fontFamily: "DM Mono, monospace", transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)" }}
                  >
                    <Download size={10} /> .txt
                  </button>
                </div>

                {/* Notes list */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {group.notes.map(note => (
                    <div key={note.id} style={{
                      padding: "12px 14px",
                      borderLeft: `2px solid ${colors[note.type] || "var(--text-3)"}`,
                      background: "var(--bg-3)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                        <span style={{ color: colors[note.type] || "var(--text-3)", fontSize: "11px", fontWeight: 700 }}>
                          {icons[note.type] || "•"}
                        </span>
                        <span style={{
                          color: "var(--text-3)", fontSize: "9px", fontFamily: "DM Mono, monospace",
                          letterSpacing: "0.12em", textTransform: "uppercase",
                        }}>
                          {labels[note.type] || note.type}
                        </span>
                      </div>
                      <p style={{
                        color: "var(--text)", fontSize: "14px",
                        fontFamily: "'Source Serif 4', Georgia, serif",
                        lineHeight: 1.5, margin: "0 0 5px 0", fontWeight: 500,
                      }}>
                        {note.title}
                      </p>
                      <p style={{
                        color: "var(--text-2)", fontSize: "12px",
                        fontFamily: "DM Mono, monospace", lineHeight: 1.7,
                        wordBreak: "break-word", margin: 0,
                      }}>
                        {note.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
