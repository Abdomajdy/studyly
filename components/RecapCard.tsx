"use client"
import { useRef, useState, useEffect } from "react"
import * as d3 from "d3"
import { Share2, X, Download } from "lucide-react"

type Props = {
  topic: string
  durationMinutes: number
  scoreBefore: number | null
  scoreAfter: number
  scoreDelta: number
  sessionQuality: string
  honestSummary: string
  onClose: () => void
}

// ── D3 mastery ring ──────────────────────────────────────────────────────────
function MasteryRing({ score, delta }: { score: number; delta: number }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const size = 120
    const strokeWidth = 8
    const radius = (size - strokeWidth) / 2
    const center = size / 2

    // Background ring
    svg.append("circle")
      .attr("cx", center)
      .attr("cy", center)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "#1a1a1e")
      .attr("stroke-width", strokeWidth)

    // Score color
    const color = score >= 70 ? "#5a9e6f" : score >= 40 ? "#c8a96e" : "#e05a5a"

    // Animated progress arc
    const arc = d3.arc<unknown>()
      .innerRadius(radius - strokeWidth / 2)
      .outerRadius(radius + strokeWidth / 2)
      .startAngle(0)
      .cornerRadius(4)

    const progressGroup = svg.append("g")
      .attr("transform", `translate(${center}, ${center})`)

    progressGroup.append("path")
      .datum({ endAngle: 0 })
      .attr("fill", color)
      .attr("opacity", 0.9)
      .transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .attrTween("d", function () {
        const interpolate = d3.interpolate(0, (score / 100) * Math.PI * 2)
        return function (t: number) {
          return arc({ endAngle: interpolate(t) }) || ""
        }
      })

    // Center score text
    const scoreText = svg.append("text")
      .attr("x", center)
      .attr("y", center - 4)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("fill", "#f0ede8")
      .attr("font-family", "DM Serif Display, serif")
      .attr("font-size", "32px")
      .text("0")

    scoreText.transition()
      .duration(1200)
      .ease(d3.easeCubicOut)
      .tween("text", function () {
        const i = d3.interpolateNumber(0, score)
        return function (t: number) {
          d3.select(this).text(Math.round(i(t)))
        }
      })

    // Delta label
    const deltaColor = delta > 0 ? "#5a9e6f" : delta < 0 ? "#e05a5a" : "#4a4a4a"
    svg.append("text")
      .attr("x", center)
      .attr("y", center + 22)
      .attr("text-anchor", "middle")
      .attr("fill", deltaColor)
      .attr("font-family", "DM Mono, monospace")
      .attr("font-size", "11px")
      .attr("letter-spacing", "0.05em")
      .text(`${delta > 0 ? "+" : ""}${delta}`)
      .attr("opacity", 0)
      .transition()
      .delay(800)
      .duration(400)
      .attr("opacity", 1)

  }, [score, delta])

  return <svg ref={svgRef} width={120} height={120} />
}

export default function RecapCard({
  topic, durationMinutes, scoreAfter,
  scoreDelta, honestSummary, onClose
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    setSharing(true)
    try {
      const html2canvas = (await import("html2canvas")).default
      const canvas = await html2canvas(cardRef.current!, {
        backgroundColor: "#0a0a0b",
        scale: 2,
        logging: false
      })
      const blob = await new Promise<Blob>(resolve =>
        canvas.toBlob(b => resolve(b!), "image/png")
      )
      const file = new File([blob], "studyly-session.png", { type: "image/png" })
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Studyly Session",
          text: `just locked in on ${topic} — mastery ${scoreDelta > 0 ? "+" : ""}${scoreDelta}`
        })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "studyly-session.png"
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("[share]", err)
    } finally {
      setSharing(false)
    }
  }

  const qualityColor =
    scoreAfter >= 70 ? "#5a9e6f" :
    scoreAfter >= 40 ? "#c8a96e" : "#e05a5a"

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)",
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px"
    }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div
          ref={cardRef}
          style={{
            background: "#0a0a0b",
            border: "1px solid #2a2a2e",
            padding: "40px",
            marginBottom: "16px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div style={{
            position: "absolute", top: "-60px", right: "-60px",
            width: "250px", height: "250px", borderRadius: "50%",
            background: `radial-gradient(circle, ${qualityColor}15 0%, transparent 70%)`,
            pointerEvents: "none"
          }} />

          <p style={{
            color: "#c8a96e", fontSize: "10px",
            letterSpacing: "0.2em", textTransform: "uppercase",
            marginBottom: "20px", fontFamily: "DM Mono, monospace"
          }}>
            STUDYLY SESSION
          </p>

          <p style={{
            fontFamily: "DM Serif Display, serif",
            fontSize: "24px", color: "#f0ede8",
            letterSpacing: "-0.02em", marginBottom: "28px",
            lineHeight: 1.2
          }}>
            {topic}
          </p>

          {/* D3 ring + stats side by side */}
          <div style={{
            display: "flex", alignItems: "center", gap: "28px",
            marginBottom: "28px",
          }}>
            <MasteryRing score={scoreAfter} delta={scoreDelta} />
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <p style={{ color: "#4a4a4a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px", fontFamily: "DM Mono, monospace" }}>
                  DURATION
                </p>
                <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "22px", color: "#f0ede8" }}>
                  {durationMinutes}m
                </p>
              </div>
              <div>
                <p style={{ color: "#4a4a4a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "4px", fontFamily: "DM Mono, monospace" }}>
                  MASTERY
                </p>
                <p style={{ fontFamily: "DM Serif Display, serif", fontSize: "22px", color: qualityColor }}>
                  {scoreAfter}
                </p>
              </div>
            </div>
          </div>

          {/* Honest summary */}
          <div style={{ borderLeft: "2px solid #c8a96e", paddingLeft: "16px" }}>
            <p style={{
              color: "#8a8a8a", fontSize: "12px",
              fontFamily: "DM Mono, monospace",
              lineHeight: "1.7", fontStyle: "italic"
            }}>
              &quot;{honestSummary}&quot;
            </p>
          </div>

          <p style={{
            color: "#2a2a2e", fontSize: "10px",
            fontFamily: "DM Mono, monospace",
            letterSpacing: "0.1em",
            marginTop: "24px", textAlign: "right"
          }}>
            studyly.app
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              flex: 1, background: "var(--text)", color: "var(--bg)",
              border: "none", padding: "16px",
              fontFamily: "DM Mono, monospace", fontSize: "13px",
              fontWeight: 500, letterSpacing: "0.08em",
              textTransform: "uppercase", cursor: "pointer",
              transition: "opacity 0.2s",
              opacity: sharing ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            }}
          >
            {sharing ? (
              <><Download size={14} style={{ animation: "pulse 1s infinite" }} /> GENERATING...</>
            ) : (
              <><Share2 size={14} /> SHARE</>
            )}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid var(--border)",
              color: "var(--text-3)", padding: "16px 20px",
              fontFamily: "DM Mono, monospace", fontSize: "13px",
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer", transition: "color 0.2s",
              display: "flex", alignItems: "center", gap: "6px",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            <X size={14} /> CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}
