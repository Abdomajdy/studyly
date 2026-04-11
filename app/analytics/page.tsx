"use client"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import { type MasteryRow, getScoreColor } from "@/lib/helpers"

// ── Types ──────────────────────────────────────────────────────────────────
type SessionRecap = {
  topic: string
  score_before: number
  score_after: number
  score_delta: number
  session_quality: string
  duration_minutes: number
  created_at: string
}

type MasteryEval = {
  topic: string
  understanding_level: string
  session_quality: string
  specific_gaps: string[]
  specific_strengths: string[]
  confidence_accuracy: string
  created_at: string
}

type StudySession = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

type ThinkingPattern = {
  analysis: string
  traits: string[]
  computed_at: string
}

// ── Animated counter ───────────────────────────────────────────────────────
function AnimatedValue({ value, color, suffix }: { value: number; color?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const animated = useRef(false)
  const animate = useCallback(() => {
    if (animated.current || !ref.current) return
    animated.current = true
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / 800, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      if (ref.current) ref.current.textContent = String(Math.round(eased * value)) + (suffix || "")
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value, suffix])
  useEffect(() => { animate() }, [animate])
  return <span ref={ref} style={{ color: color || "var(--text)", fontSize: "40px", fontFamily: "DM Serif Display, serif", lineHeight: 1 }}>0</span>
}

// ── SVG Radar Chart ────────────────────────────────────────────────────────
function RadarChart({ data, size = 240 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 32
  const n = data.length
  if (n < 3) return null
  const angleStep = (2 * Math.PI) / n
  const rings = [25, 50, 75, 100]

  const points = data.map((d, i) => {
    const angle = i * angleStep - Math.PI / 2
    const dist = (d.value / 100) * r
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) }
  })
  const poly = points.map(p => `${p.x},${p.y}`).join(" ")

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      {rings.map(ring => (
        <polygon key={ring} points={
          Array.from({ length: n }, (_, i) => {
            const angle = i * angleStep - Math.PI / 2
            const dist = (ring / 100) * r
            return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`
          }).join(" ")
        } fill="none" stroke="var(--border)" strokeWidth={ring === 50 ? 1 : 0.5} opacity={0.5} />
      ))}
      {data.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="var(--border)" strokeWidth={0.5} opacity={0.3} />
      })}
      <polygon points={poly} fill="rgba(200,169,110,0.12)" stroke="var(--accent)" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={data[i].color} />
      ))}
      {data.map((d, i) => {
        const angle = i * angleStep - Math.PI / 2
        const lx = cx + (r + 18) * Math.cos(angle)
        const ly = cy + (r + 18) * Math.sin(angle)
        return (
          <text key={i} x={lx} y={ly} fill="var(--text-3)" fontSize="9" fontFamily="DM Mono, monospace"
            textAnchor={Math.abs(angle) < 0.1 || Math.abs(angle - Math.PI) < 0.1 ? "middle" : angle > -Math.PI / 2 && angle < Math.PI / 2 ? "start" : "end"}
            dominantBaseline="central"
          >{d.label}</text>
        )
      })}
    </svg>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 200, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    y: height - 4 - ((v - min) / range) * (height - 8),
  }))
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  const area = d + ` L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={area} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
    </svg>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [username, setUsername] = useState("")
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [recaps, setRecaps] = useState<SessionRecap[]>([])
  const [evals, setEvals] = useState<MasteryEval[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [patterns, setPatterns] = useState<ThinkingPattern | null>(null)
  const [totalSessions, setTotalSessions] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")

      const [profileRes, masteryData, countRes, sessionsRes, recapsRes, evalsRes, patternsRes] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).single(),
        getMastery(user.id),
        supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("study_sessions").select("id, topic, started_at, ended_at, duration_minutes").eq("user_id", user.id).order("started_at", { ascending: true }).limit(200),
        supabase.from("session_recaps").select("topic, score_before, score_after, score_delta, session_quality, duration_minutes, created_at").eq("user_id", user.id).order("created_at", { ascending: true }).limit(100),
        supabase.from("mastery_evaluations").select("topic, understanding_level, session_quality, specific_gaps, specific_strengths, confidence_accuracy, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("thinking_patterns").select("analysis, traits, computed_at").eq("user_id", user.id).single(),
      ])

      if (profileRes.data) setUsername(profileRes.data.username)
      setMastery(masteryData)
      setTotalSessions(countRes.count ?? 0)
      if (sessionsRes.data) setSessions(sessionsRes.data)
      if (recapsRes.data) setRecaps(recapsRes.data)
      if (evalsRes.data) setEvals(evalsRes.data)
      if (patternsRes.data) setPatterns(patternsRes.data)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router])

  // ── Computed data ──────────────────────────────────────────────────────────
  const avgMastery = mastery.length > 0 ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length) : null

  // Weekly mastery trend (average score per week from recaps)
  const weeklyTrend = useMemo(() => {
    if (recaps.length < 2) return []
    const weeks: Record<string, number[]> = {}
    recaps.forEach(r => {
      const d = new Date(r.created_at)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().split("T")[0]
      if (!weeks[key]) weeks[key] = []
      weeks[key].push(r.score_after)
    })
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([week, scores]) => ({
      week,
      avg: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
    }))
  }, [recaps])

  // Session quality distribution
  const qualityDist = useMemo(() => {
    const counts: Record<string, number> = { excellent: 0, productive: 0, minimal: 0, wasted: 0 }
    evals.forEach(e => { if (e.session_quality in counts) counts[e.session_quality]++ })
    const total = Object.values(counts).reduce((s, v) => s + v, 0)
    return { counts, total }
  }, [evals])

  // Top improvement & biggest drops
  const topMovers = useMemo(() => {
    if (recaps.length === 0) return { improved: [], declined: [] }
    const byTopic: Record<string, number> = {}
    recaps.forEach(r => { byTopic[r.topic] = (byTopic[r.topic] || 0) + r.score_delta })
    const sorted = Object.entries(byTopic).map(([topic, delta]) => ({ topic, delta })).sort((a, b) => b.delta - a.delta)
    return {
      improved: sorted.filter(t => t.delta > 0).slice(0, 5),
      declined: sorted.filter(t => t.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
    }
  }, [recaps])

  // Most common gaps across all evaluations
  const commonGaps = useMemo(() => {
    const gapCount: Record<string, number> = {}
    evals.forEach(e => {
      (e.specific_gaps || []).forEach(g => { gapCount[g] = (gapCount[g] || 0) + 1 })
    })
    return Object.entries(gapCount).sort(([, a], [, b]) => b - a).slice(0, 6).map(([gap, count]) => ({ gap, count }))
  }, [evals])

  // Common strengths
  const commonStrengths = useMemo(() => {
    const strCount: Record<string, number> = {}
    evals.forEach(e => {
      (e.specific_strengths || []).forEach(s => { strCount[s] = (strCount[s] || 0) + 1 })
    })
    return Object.entries(strCount).sort(([, a], [, b]) => b - a).slice(0, 5).map(([strength, count]) => ({ strength, count }))
  }, [evals])

  // Confidence calibration
  const confidenceDist = useMemo(() => {
    const counts: Record<string, number> = { overconfident: 0, calibrated: 0, underconfident: 0 }
    evals.forEach(e => { if (e.confidence_accuracy in counts) counts[e.confidence_accuracy]++ })
    return counts
  }, [evals])

  // Study hours by day of week
  const dayOfWeekHours = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const mins = Array(7).fill(0)
    sessions.forEach(s => {
      const d = new Date(s.started_at).getDay()
      mins[d] += s.duration_minutes || 0
    })
    return days.map((label, i) => ({ label, minutes: mins[i] }))
  }, [sessions])

  // Course radar data
  const courseRadar = useMemo(() => {
    const byCourse: Record<string, number[]> = {}
    mastery.forEach(m => {
      if (!byCourse[m.course]) byCourse[m.course] = []
      byCourse[m.course].push(m.score)
    })
    return Object.entries(byCourse).map(([course, scores]) => ({
      label: course.length > 12 ? course.slice(0, 12) + "…" : course,
      value: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      color: getScoreColor(Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)),
    }))
  }, [mastery])

  // Patterns analysis parsed
  const parsedPatterns = useMemo(() => {
    if (!patterns) return null
    try { return JSON.parse(patterns.analysis) } catch { return null }
  }, [patterns])

  const totalStudyHours = Math.round(sessions.reduce((s, sess) => s + (sess.duration_minutes || 0), 0) / 60)
  const productiveRate = qualityDist.total > 0 ? Math.round(((qualityDist.counts.excellent + qualityDist.counts.productive) / qualityDist.total) * 100) : 0

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  const sectionLabel = { color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase" as const, marginBottom: "16px", fontFamily: "DM Mono, monospace" }
  const cardStyle = { background: "var(--bg-2)", border: "1px solid var(--border)", padding: "24px" }
  const qualityColors: Record<string, string> = { excellent: "var(--success)", productive: "var(--accent)", minimal: "var(--text-3)", wasted: "var(--danger)" }
  const maxDayMin = Math.max(...dayOfWeekHours.map(d => d.minutes), 1)

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="analytics"
        stats={{ totalSessions, masteryCount: mastery.length, weakCount: mastery.filter(m => m.score < 40).length, avgMastery }}
        friends={sidebar.friends}
        groups={sidebar.groups}
        pendingCount={sidebar.pendingCount}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "64px 48px" }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "48px" }}>
            <div>
              <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "DM Mono, monospace" }}>
                {username || "there"}
              </p>
              <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                Overall Progress
              </h1>
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginTop: "8px" }}>
                cross-course trends, weak points, and how you're growing
              </p>
            </div>
            <button
              onClick={() => router.push("/patterns")}
              className="patterns-btn"
              style={{
                background: "none", border: "1px solid var(--accent)", color: "var(--accent)",
                padding: "12px 20px", fontFamily: "DM Mono, monospace", fontSize: "12px",
                letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", transition: "background 0.2s",
              }}
            >
              MY PATTERNS →
            </button>
          </div>

          {/* ── Stat cards ────────────────────────────────────────────────── */}
          <div style={{ display: "flex", gap: "2px", marginBottom: "48px", flexWrap: "wrap" }}>
            {[
              { label: "total sessions", value: totalSessions },
              { label: "study hours", value: totalStudyHours },
              { label: "avg mastery", value: avgMastery ?? 0, color: avgMastery != null ? getScoreColor(avgMastery) : "var(--text-3)", suffix: "" },
              { label: "productive rate", value: productiveRate, suffix: "%", color: productiveRate >= 70 ? "var(--success)" : productiveRate >= 40 ? "var(--accent)" : "var(--danger)" },
            ].map((card, i) => (
              <div key={card.label} style={{ flex: "1 1 140px", border: "1px solid var(--border)", padding: "24px", opacity: 0, animation: "fadeIn 0.4s ease forwards", animationDelay: `${i * 0.08}s` }}>
                <AnimatedValue value={card.value} color={card.color} suffix={card.suffix} />
                <p style={{ ...sectionLabel, marginTop: "8px", marginBottom: 0 }}>{card.label}</p>
              </div>
            ))}
          </div>

          <div className="analytics-grid">
            {/* ── Left Column ─────────────────────────────────────────────── */}
            <div>

              {/* Mastery Growth Sparkline */}
              {weeklyTrend.length >= 2 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                  <p style={sectionLabel}>mastery trend over time</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <Sparkline values={weeklyTrend.map(w => w.avg)} color="var(--accent)" width={320} height={60} />
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: "var(--text)", fontSize: "24px", fontFamily: "DM Serif Display, serif" }}>{weeklyTrend[weeklyTrend.length - 1].avg}</p>
                      <p style={{ color: weeklyTrend[weeklyTrend.length - 1].avg >= weeklyTrend[0].avg ? "var(--success)" : "var(--danger)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                        {weeklyTrend[weeklyTrend.length - 1].avg >= weeklyTrend[0].avg ? "↑" : "↓"} from {weeklyTrend[0].avg}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Session Quality Distribution */}
              {qualityDist.total > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                  <p style={sectionLabel}>session quality</p>
                  <div style={{ display: "flex", height: "8px", gap: "2px", marginBottom: "12px" }}>
                    {(["excellent", "productive", "minimal", "wasted"] as const).map(q => (
                      qualityDist.counts[q] > 0 ? (
                        <div key={q} style={{
                          flex: qualityDist.counts[q],
                          background: qualityColors[q],
                          opacity: 0.7,
                          transition: "flex 0.6s ease",
                        }} />
                      ) : null
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    {(["excellent", "productive", "minimal", "wasted"] as const).map(q => (
                      qualityDist.counts[q] > 0 ? (
                        <div key={q} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "8px", height: "8px", background: qualityColors[q], opacity: 0.7 }} />
                          <span style={{ fontSize: "11px", color: "var(--text-2)", fontFamily: "DM Mono, monospace" }}>
                            {q} ({qualityDist.counts[q]})
                          </span>
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              {/* Top Improvements */}
              {topMovers.improved.length > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                  <p style={sectionLabel}>biggest improvements</p>
                  {topMovers.improved.map((t, i) => (
                    <div key={t.topic} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < topMovers.improved.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>{t.topic}</span>
                      <span style={{ color: "var(--success)", fontSize: "14px", fontFamily: "DM Serif Display, serif" }}>+{t.delta}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Needs Work */}
              {topMovers.declined.length > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px", borderLeft: "2px solid var(--danger)" }}>
                  <p style={sectionLabel}>declining topics</p>
                  {topMovers.declined.map((t, i) => (
                    <div key={t.topic} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < topMovers.declined.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>{t.topic}</span>
                      <span style={{ color: "var(--danger)", fontSize: "14px", fontFamily: "DM Serif Display, serif" }}>{t.delta}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Study Schedule — day of week */}
              <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                <p style={sectionLabel}>when you study</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px" }}>
                  {dayOfWeekHours.map((day) => (
                    <div key={day.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                      <div style={{
                        width: "100%",
                        height: `${Math.max(3, (day.minutes / maxDayMin) * 64)}px`,
                        background: day.minutes > 0 ? "var(--accent)" : "var(--border)",
                        opacity: day.minutes > 0 ? 0.6 : 0.2,
                        transition: "height 0.6s ease",
                      }} />
                      <span style={{ fontSize: "9px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right Column ────────────────────────────────────────────── */}
            <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease 0.3s" }}>

              {/* Course Radar */}
              {courseRadar.length >= 3 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px", textAlign: "center" }}>
                  <p style={{ ...sectionLabel, textAlign: "left" }}>course balance</p>
                  <RadarChart data={courseRadar} />
                </div>
              )}

              {/* Confidence Calibration */}
              {evals.length > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                  <p style={sectionLabel}>confidence calibration</p>
                  {(["calibrated", "underconfident", "overconfident"] as const).map(key => {
                    const count = confidenceDist[key]
                    const total = Object.values(confidenceDist).reduce((s, v) => s + v, 0)
                    if (total === 0) return null
                    const pct = Math.round((count / total) * 100)
                    const color = key === "calibrated" ? "var(--success)" : key === "underconfident" ? "var(--accent)" : "var(--danger)"
                    return (
                      <div key={key} style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-2)", fontFamily: "DM Mono, monospace" }}>{key}</span>
                          <span style={{ fontSize: "11px", color, fontFamily: "DM Mono, monospace" }}>{pct}%</span>
                        </div>
                        <div style={{ height: "4px", background: "var(--border)" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: color, opacity: 0.7, transition: "width 0.6s ease" }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Recurring Gaps */}
              {commonGaps.length > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px", borderLeft: "2px solid var(--danger)" }}>
                  <p style={sectionLabel}>recurring weak points</p>
                  <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginBottom: "12px" }}>
                    these keep showing up — focus here
                  </p>
                  {commonGaps.map((g, i) => (
                    <div key={g.gap} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < commonGaps.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--text)", fontSize: "12px", fontFamily: "DM Mono, monospace", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.gap}</span>
                      <span style={{ color: "var(--danger)", fontSize: "11px", fontFamily: "DM Mono, monospace", flexShrink: 0, marginLeft: "8px" }}>×{g.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Consistent Strengths */}
              {commonStrengths.length > 0 && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px", borderLeft: "2px solid var(--success)" }}>
                  <p style={sectionLabel}>consistent strengths</p>
                  {commonStrengths.map((s, i) => (
                    <div key={s.strength} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < commonStrengths.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <span style={{ color: "var(--text)", fontSize: "12px", fontFamily: "DM Mono, monospace", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.strength}</span>
                      <span style={{ color: "var(--success)", fontSize: "11px", fontFamily: "DM Mono, monospace", flexShrink: 0, marginLeft: "8px" }}>×{s.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pattern Summary (from thinking_patterns) */}
              {parsedPatterns && (
                <div className="dark-fixed" style={{ ...cardStyle, marginBottom: "16px" }}>
                  <p style={sectionLabel}>your learner profile</p>
                  <p style={{ color: "var(--accent)", fontSize: "18px", fontFamily: "DM Serif Display, serif", marginBottom: "4px" }}>
                    {parsedPatterns.learner_archetype}
                  </p>
                  <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", lineHeight: 1.6, marginBottom: "16px" }}>
                    {parsedPatterns.archetype_description}
                  </p>
                  {parsedPatterns.recommendations && (
                    <div>
                      <p style={{ ...sectionLabel, marginBottom: "8px" }}>recommendations</p>
                      {(parsedPatterns.recommendations as string[]).slice(0, 3).map((rec: string, i: number) => (
                        <p key={i} style={{ color: "var(--text-2)", fontSize: "11px", fontFamily: "DM Mono, monospace", lineHeight: 1.6, marginBottom: "6px", paddingLeft: "12px", borderLeft: "1px solid var(--accent-dim)" }}>
                          {rec}
                        </p>
                      ))}
                    </div>
                  )}
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
          gap: 16px;
          align-items: start;
        }
        @media (min-width: 1000px) {
          .analytics-grid { grid-template-columns: 58% 42%; }
        }
        .patterns-btn:hover { background: rgba(200,169,110,0.08) !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
