"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import * as d3 from "d3"
import { Brain, Zap, Target, Eye, Gauge, ArrowRight, RefreshCw, Clock, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────
type NumericScores = {
  focus_score: number
  persistence_score: number
  speed_score: number
  calibration_score: number
  consistency_score: number
}

type PatternAnalysis = {
  thinking_style: string
  thinking_style_description: string
  learning_velocity: string
  learning_velocity_description: string
  struggle_pattern: string
  struggle_pattern_description: string
  focus_profile: string
  focus_profile_description: string
  confidence_alignment: string
  confidence_alignment_description: string
  peak_performance: string
  response_style: string
  response_style_description: string
  strengths: string[]
  growth_areas: string[]
  recommendations: string[]
  learner_archetype: string
  archetype_description: string
  numeric_scores: NumericScores
}

type RawData = {
  totalSessions: number
  totalMessages: number
  avgDuration: number
  struggleCounts: Record<string, number>
  avgLatency: number
  tabAways: number
  distractions: number
  mastery: { topic: string; score: number }[]
  topicCounts: Record<string, number>
  hourCounts: Record<number, number>
  dayCounts: Record<number, number>
  feedbacks: { helped: number; notHelped: number; total: number }
  drafts: { count: number; avgCharsDeleted: number }
}

// ── D3 Radar Chart ───────────────────────────────────────────────────────────
function RadarChart({ scores }: { scores: NumericScores }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const width = 280
    const height = 280
    const center = width / 2
    const radius = 110
    const levels = 4

    const categories = [
      { key: "focus_score", label: "Focus" },
      { key: "persistence_score", label: "Persistence" },
      { key: "speed_score", label: "Speed" },
      { key: "calibration_score", label: "Calibration" },
      { key: "consistency_score", label: "Consistency" },
    ]

    const g = svg.append("g").attr("transform", `translate(${center}, ${center})`)
    const angleSlice = (Math.PI * 2) / categories.length

    // Grid circles
    for (let l = 1; l <= levels; l++) {
      const r = (radius / levels) * l
      g.append("circle")
        .attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "#2a2a2e")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", l < levels ? "2,4" : "none")
    }

    // Axis lines + labels
    categories.forEach((cat, i) => {
      const angle = angleSlice * i - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      g.append("line")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", x).attr("y2", y)
        .attr("stroke", "#2a2a2e")
        .attr("stroke-width", 1)

      const labelX = Math.cos(angle) * (radius + 24)
      const labelY = Math.sin(angle) * (radius + 24)

      g.append("text")
        .attr("x", labelX)
        .attr("y", labelY)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "#8a8a8a")
        .attr("font-family", "DM Mono, monospace")
        .attr("font-size", "10px")
        .attr("letter-spacing", "0.05em")
        .text(cat.label)
    })

    // Data polygon
    const values = categories.map(cat => (scores[cat.key as keyof NumericScores] || 0) / 100)
    const points = values.map((v, i) => {
      const angle = angleSlice * i - Math.PI / 2
      return {
        x: Math.cos(angle) * radius * v,
        y: Math.sin(angle) * radius * v,
      }
    })

    const line = d3.lineRadial<number>()
      .radius(d => d * radius)
      .angle((_, i) => angleSlice * i)
      .curve(d3.curveLinearClosed)

    // Animated fill
    const path = g.append("path")
      .datum(values)
      .attr("fill", "rgba(200,169,110,0.12)")
      .attr("stroke", "#c8a96e")
      .attr("stroke-width", 2)
      .attr("d", line(new Array(categories.length).fill(0) as number[]))

    path.transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr("d", line(values) as string)

    // Data points
    points.forEach((pt, i) => {
      g.append("circle")
        .attr("cx", 0).attr("cy", 0)
        .attr("r", 4)
        .attr("fill", "#c8a96e")
        .attr("stroke", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim())
        .attr("stroke-width", 2)
        .transition()
        .duration(1000)
        .ease(d3.easeCubicOut)
        .attr("cx", pt.x)
        .attr("cy", pt.y)

      // Score label
      g.append("text")
        .attr("x", pt.x)
        .attr("y", pt.y - 12)
        .attr("text-anchor", "middle")
        .attr("fill", "#c8a96e")
        .attr("font-family", "DM Mono, monospace")
        .attr("font-size", "11px")
        .attr("font-weight", "500")
        .attr("opacity", 0)
        .text(scores[categories[i].key as keyof NumericScores])
        .transition()
        .delay(800)
        .duration(400)
        .attr("opacity", 1)
    })

  }, [scores])

  return <svg ref={svgRef} width={280} height={280} />
}

// ── Hour Heatmap ─────────────────────────────────────────────────────────────
function HourHeatmap({ hourCounts }: { hourCounts: Record<number, number> }) {
  const max = Math.max(...Object.values(hourCounts), 1)
  return (
    <div style={{ display: "flex", gap: "2px", flexWrap: "wrap" }}>
      {Array.from({ length: 24 }, (_, h) => {
        const count = hourCounts[h] || 0
        const intensity = count / max
        return (
          <div
            key={h}
            title={`${h}:00 — ${count} sessions`}
            style={{
              width: "28px", height: "28px",
              background: count > 0 ? `rgba(200,169,110,${0.15 + intensity * 0.7})` : "#1a1a1e",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "9px", fontFamily: "DM Mono, monospace",
              color: intensity > 0.5 ? "#0a0a0b" : "var(--text-3)",
              cursor: "default",
            }}
          >
            {h}
          </div>
        )
      })}
    </div>
  )
}

// ── Trait Tag ─────────────────────────────────────────────────────────────────
function TraitTag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "5px 12px",
      border: `1px solid ${color}`,
      color,
      fontSize: "11px",
      fontFamily: "DM Mono, monospace",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      marginRight: "8px",
      marginBottom: "8px",
    }}>
      {label}
    </span>
  )
}

// ── Score Bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string
}) {
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = "0%"
      requestAnimationFrame(() => {
        if (barRef.current) barRef.current.style.width = `${value}%`
      })
    }
  }, [value])

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon size={14} style={{ color }} />
          <span style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", letterSpacing: "0.05em" }}>
            {label}
          </span>
        </div>
        <span style={{ color, fontSize: "14px", fontFamily: "DM Serif Display, serif" }}>
          {value}
        </span>
      </div>
      <div style={{ height: "4px", background: "var(--bg-3)", width: "100%", position: "relative" }}>
        <div
          ref={barRef}
          style={{
            height: "100%",
            background: color,
            transition: "width 1s cubic-bezier(0.16,1,0.3,1)",
            position: "absolute", top: 0, left: 0,
          }}
        />
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PatternsPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [visible, setVisible] = useState(false)
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null)
  const [raw, setRaw] = useState<RawData | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")

      // Check for cached analysis
      const { data: cached } = await supabase
        .from("thinking_patterns")
        .select("analysis, computed_at")
        .eq("user_id", user.id)
        .single()

      if (cached?.analysis) {
        try {
          const parsed = typeof cached.analysis === "string" ? JSON.parse(cached.analysis) : cached.analysis
          setAnalysis(parsed)
        } catch { /* ignore parse error, will regenerate */ }
      }

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router])

  async function runAnalysis() {
    setAnalyzing(true)
    setError("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "unknown" }))
        setError(err.error || "Analysis failed")
        return
      }

      const result = await res.json()
      setAnalysis(result.analysis)
      setRaw(result.raw)
    } catch (err) {
      setError(String(err))
    } finally {
      setAnalyzing(false)
    }
  }

  const scoreColor = (v: number) => v >= 70 ? "#5a9e6f" : v >= 40 ? "#c8a96e" : "#e05a5a"
  const traitColor = (trait: string) => {
    const colors: Record<string, string> = {
      analytical: "#7eb8da", intuitive: "#a8a0d2", methodical: "#5a9e6f",
      exploratory: "#c8a96e", fast: "#5a9e6f", moderate: "#c8a96e",
      slow: "#e05a5a", deep_focus: "#5a9e6f", moderate_focus: "#c8a96e",
      easily_distracted: "#e05a5a", well_calibrated: "#5a9e6f",
      overconfident: "#e05a5a", underconfident: "#c8a96e",
      pushes_through: "#5a9e6f", gives_up_early: "#e05a5a",
      quick_and_impulsive: "#c8a96e", thoughtful_and_measured: "#5a9e6f",
    }
    return colors[trait] || "#8a8a8a"
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
        activePage="patterns"
        stats={sidebar.stats}
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
                LEARNING INTELLIGENCE
              </p>
              <h1 className="flourish-underline" style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: "20px" }}>
                My Patterns
              </h1>
            </div>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              style={{
                background: analyzing ? "var(--bg-3)" : "var(--text)",
                color: analyzing ? "var(--text-3)" : "var(--bg)",
                border: "none", padding: "14px 24px",
                fontFamily: "DM Mono, monospace", fontSize: "12px",
                letterSpacing: "0.08em", textTransform: "uppercase",
                cursor: analyzing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "8px",
                transition: "all 0.2s",
              }}
            >
              <RefreshCw size={14} style={analyzing ? { animation: "spin 1s linear infinite" } : undefined} />
              {analyzing ? "ANALYZING..." : analysis ? "REANALYZE" : "ANALYZE MY PATTERNS"}
            </button>
          </div>

          {error && (
            <div style={{ background: "rgba(224,90,90,0.08)", border: "1px solid var(--danger)", padding: "16px 20px", marginBottom: "32px" }}>
              <p style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Mono, monospace" }}>{error}</p>
            </div>
          )}

          {!analysis && !analyzing && (
            <div style={{
              border: "1px solid var(--border)", padding: "80px 48px",
              textAlign: "center",
            }}>
              <Brain size={40} style={{ color: "var(--text-3)", marginBottom: "20px" }} />
              <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "24px", color: "var(--text)", marginBottom: "12px" }}>
                Discover how you think
              </p>
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", maxWidth: "400px", margin: "0 auto 32px", lineHeight: "1.7" }}>
                Studyly analyzes your session data — response speed, struggle patterns, attention, confidence — to build a profile of how you learn.
              </p>
              <button
                onClick={runAnalysis}
                style={{
                  background: "var(--text)", color: "var(--bg)",
                  border: "none", padding: "16px 32px",
                  fontFamily: "DM Mono, monospace", fontSize: "13px",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px",
                }}
              >
                <Brain size={14} /> RUN ANALYSIS
              </button>
            </div>
          )}

          {analyzing && (
            <div style={{
              border: "1px solid var(--border)", padding: "80px 48px",
              textAlign: "center",
            }}>
              <RefreshCw size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", marginBottom: "20px" }} />
              <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "20px", color: "var(--text)", marginBottom: "8px" }}>
                Analyzing your learning data...
              </p>
              <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace" }}>
                Reading sessions, struggles, attention patterns, and confidence signals
              </p>
            </div>
          )}

          {analysis && !analyzing && (
            <div className="dark-fixed" style={{ display: "contents" }}>
              {/* ── Archetype Hero ────────────────────────────────────────── */}
              <div style={{
                border: "1px solid var(--border)",
                padding: "48px",
                marginBottom: "2px",
                position: "relative",
                overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: "-100px", right: "-100px",
                  width: "400px", height: "400px", borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(200,169,110,0.04) 0%, transparent 70%)",
                  pointerEvents: "none",
                }} />
                <p style={{ color: "var(--accent)", fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
                  YOUR LEARNER ARCHETYPE
                </p>
                <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "12px", letterSpacing: "-0.02em" }}>
                  {analysis.learner_archetype}
                </h2>
                <p style={{ color: "var(--text-2)", fontSize: "15px", fontFamily: "DM Mono, monospace", lineHeight: "1.8", maxWidth: "600px" }}>
                  {analysis.archetype_description}
                </p>
                <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap" }}>
                  <TraitTag label={analysis.thinking_style} color={traitColor(analysis.thinking_style)} />
                  <TraitTag label={analysis.learning_velocity} color={traitColor(analysis.learning_velocity)} />
                  <TraitTag label={analysis.focus_profile.replace(/_/g, " ")} color={traitColor(analysis.focus_profile)} />
                  <TraitTag label={analysis.response_style.replace(/_/g, " ")} color={traitColor(analysis.response_style)} />
                  <TraitTag label={analysis.struggle_pattern.replace(/_/g, " ")} color={traitColor(analysis.struggle_pattern)} />
                </div>
              </div>

              {/* ── Radar + Score Bars Row ────────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px", marginBottom: "2px" }}>
                {/* Radar Chart */}
                <div style={{ border: "1px solid var(--border)", padding: "32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px", fontFamily: "DM Mono, monospace" }}>
                    COGNITIVE PROFILE
                  </p>
                  <RadarChart scores={analysis.numeric_scores} />
                </div>

                {/* Score Bars */}
                <div style={{ border: "1px solid var(--border)", padding: "32px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "24px", fontFamily: "DM Mono, monospace" }}>
                    DIMENSION SCORES
                  </p>
                  <ScoreBar label="FOCUS" value={analysis.numeric_scores.focus_score} icon={Eye} color={scoreColor(analysis.numeric_scores.focus_score)} />
                  <ScoreBar label="PERSISTENCE" value={analysis.numeric_scores.persistence_score} icon={Target} color={scoreColor(analysis.numeric_scores.persistence_score)} />
                  <ScoreBar label="SPEED" value={analysis.numeric_scores.speed_score} icon={Zap} color={scoreColor(analysis.numeric_scores.speed_score)} />
                  <ScoreBar label="CALIBRATION" value={analysis.numeric_scores.calibration_score} icon={Gauge} color={scoreColor(analysis.numeric_scores.calibration_score)} />
                  <ScoreBar label="CONSISTENCY" value={analysis.numeric_scores.consistency_score} icon={TrendingUp} color={scoreColor(analysis.numeric_scores.consistency_score)} />
                </div>
              </div>

              {/* ── Thinking Dimensions Grid ──────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px", marginBottom: "2px" }}>
                {[
                  { label: "THINKING STYLE", value: analysis.thinking_style.replace(/_/g, " "), desc: analysis.thinking_style_description, icon: Brain },
                  { label: "LEARNING VELOCITY", value: analysis.learning_velocity.replace(/_/g, " "), desc: analysis.learning_velocity_description, icon: Zap },
                  { label: "STRUGGLE PATTERN", value: analysis.struggle_pattern.replace(/_/g, " "), desc: analysis.struggle_pattern_description, icon: Target },
                  { label: "FOCUS PROFILE", value: analysis.focus_profile.replace(/_/g, " "), desc: analysis.focus_profile_description, icon: Eye },
                  { label: "CONFIDENCE ALIGNMENT", value: analysis.confidence_alignment.replace(/_/g, " "), desc: analysis.confidence_alignment_description, icon: Gauge },
                  { label: "RESPONSE STYLE", value: analysis.response_style.replace(/_/g, " "), desc: analysis.response_style_description, icon: Clock },
                ].map((dim) => (
                  <div key={dim.label} style={{ border: "1px solid var(--border)", padding: "28px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                      <dim.icon size={14} style={{ color: "var(--accent)" }} />
                      <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                        {dim.label}
                      </p>
                    </div>
                    <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "20px", color: "var(--text)", marginBottom: "10px", textTransform: "capitalize" }}>
                      {dim.value}
                    </p>
                    <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.8" }}>
                      {dim.desc}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Peak Performance ──────────────────────────────────────── */}
              <div style={{ border: "1px solid var(--border)", padding: "28px", marginBottom: "2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <Clock size={14} style={{ color: "var(--accent)" }} />
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                    PEAK PERFORMANCE
                  </p>
                </div>
                <p style={{ color: "var(--text)", fontSize: "15px", fontFamily: "DM Mono, monospace", lineHeight: "1.8", marginBottom: "20px" }}>
                  {analysis.peak_performance}
                </p>
                {raw?.hourCounts && <HourHeatmap hourCounts={raw.hourCounts} />}
              </div>

              {/* ── Strengths + Growth Areas ──────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px", marginBottom: "2px" }}>
                <div style={{ border: "1px solid var(--border)", padding: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                    <TrendingUp size={14} style={{ color: "#5a9e6f" }} />
                    <p style={{ color: "#5a9e6f", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                      STRENGTHS
                    </p>
                  </div>
                  {analysis.strengths.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                      <span style={{ color: "#5a9e6f", fontSize: "14px", lineHeight: "1.6" }}>+</span>
                      <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>{s}</p>
                    </div>
                  ))}
                </div>
                <div style={{ border: "1px solid var(--border)", padding: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                    <AlertTriangle size={14} style={{ color: "#c8a96e" }} />
                    <p style={{ color: "#c8a96e", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                      GROWTH AREAS
                    </p>
                  </div>
                  {analysis.growth_areas.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
                      <span style={{ color: "#c8a96e", fontSize: "14px", lineHeight: "1.6" }}>→</span>
                      <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>{g}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Recommendations ──────────────────────────────────────── */}
              <div style={{ border: "1px solid var(--border)", padding: "28px", marginBottom: "2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                  <Lightbulb size={14} style={{ color: "#c8a96e" }} />
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
                    PERSONALIZED RECOMMENDATIONS
                  </p>
                </div>
                <div style={{ display: "grid", gap: "12px" }}>
                  {analysis.recommendations.map((rec, i) => (
                    <div key={i} style={{
                      display: "flex", gap: "14px", alignItems: "flex-start",
                      padding: "16px 20px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--border)",
                    }}>
                      <span style={{
                        color: "var(--accent)", fontSize: "16px",
                        fontFamily: "DM Serif Display, serif",
                        minWidth: "20px",
                      }}>
                        {i + 1}
                      </span>
                      <p style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace", lineHeight: "1.8" }}>
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Raw Numbers ───────────────────────────────────────────── */}
              {raw && (
                <div style={{ border: "1px solid var(--border)", padding: "28px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px", fontFamily: "DM Mono, monospace" }}>
                    RAW DATA POINTS
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                    {[
                      { label: "sessions", value: raw.totalSessions },
                      { label: "messages", value: raw.totalMessages },
                      { label: "avg duration", value: `${raw.avgDuration}m` },
                      { label: "avg response", value: `${(raw.avgLatency / 1000).toFixed(1)}s` },
                      { label: "tab-aways", value: raw.tabAways },
                      { label: "distractions", value: raw.distractions },
                      { label: "text rewrites", value: raw.drafts.count },
                      { label: "feedback given", value: raw.feedbacks.total },
                    ].map((stat) => (
                      <div key={stat.label}>
                        <p style={{ color: "var(--text-3)", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px", fontFamily: "DM Mono, monospace" }}>
                          {stat.label}
                        </p>
                        <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "22px", color: "var(--text)" }}>
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
