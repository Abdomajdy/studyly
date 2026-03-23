"use client"
import { useRef, useState } from "react"

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

  const deltaColor = scoreDelta > 0 ? "var(--success)" : scoreDelta < 0 ? "var(--danger)" : "var(--text-3)"

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
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div
          ref={cardRef}
          style={{
            background: "#0a0a0b",
            border: "1px solid #2a2a2e",
            padding: "40px",
            marginBottom: "16px",
            position: "relative"
          }}
        >
          <div style={{
            position: "absolute", top: "-40px", right: "-40px",
            width: "200px", height: "200px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,169,110,0.08) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />

          <p style={{
            color: "#c8a96e", fontSize: "10px",
            letterSpacing: "0.2em", textTransform: "uppercase",
            marginBottom: "24px", fontFamily: "DM Mono, monospace"
          }}>
            STUDYLY SESSION
          </p>

          <p style={{
            fontFamily: "DM Serif Display, serif",
            fontSize: "24px", color: "#f0ede8",
            letterSpacing: "-0.02em", marginBottom: "32px",
            lineHeight: 1.2
          }}>
            {topic}
          </p>

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: "1px", background: "#2a2a2e", marginBottom: "28px"
          }}>
            {[
              { label: "DURATION", value: `${durationMinutes}m` },
              { label: "MASTERY", value: scoreAfter.toString() },
              { label: "DELTA", value: `${scoreDelta > 0 ? "+" : ""}${scoreDelta}` }
            ].map((stat, i) => (
              <div key={i} style={{ background: "#0a0a0b", padding: "16px 14px" }}>
                <p style={{ color: "#4a4a4a", fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "6px", fontFamily: "DM Mono, monospace" }}>
                  {stat.label}
                </p>
                <p style={{
                  fontFamily: "DM Serif Display, serif",
                  fontSize: "28px",
                  color: stat.label === "DELTA" ? deltaColor : "#f0ede8"
                }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

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
              opacity: sharing ? 0.6 : 1
            }}
          >
            {sharing ? "GENERATING..." : "SHARE →"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid var(--border)",
              color: "var(--text-3)", padding: "16px 20px",
              fontFamily: "DM Mono, monospace", fontSize: "13px",
              letterSpacing: "0.08em", textTransform: "uppercase",
              cursor: "pointer", transition: "color 0.2s"
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}
