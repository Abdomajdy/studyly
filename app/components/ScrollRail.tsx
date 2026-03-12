"use client"
import { useEffect, useState } from "react"

const ease = "cubic-bezier(0.0, 0.0, 0.2, 1)"

interface Section { label: string; id: string }

export default function ScrollRail({ sections }: { sections: Section[] }) {
  const [progress, setProgress] = useState(0)
  const [positions, setPositions] = useState<number[]>(sections.map(() => 0))

  useEffect(() => {
    const calc = () => {
      const docH = document.documentElement.scrollHeight
      if (!docH) return
      setPositions(sections.map(s => {
        const el = document.getElementById(s.id)
        return el ? el.offsetTop / docH : 0
      }))
    }
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? window.scrollY / max : 0)
    }
    const t = setTimeout(calc, 200)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", calc)
    return () => {
      clearTimeout(t)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", calc)
    }
  }, [sections])

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })

  return (
    <div
      className="scroll-rail"
      style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "44px", zIndex: 50, display: "flex", justifyContent: "center" }}
    >
      {/* Background line */}
      <div style={{ position: "absolute", left: "21px", top: "8%", bottom: "8%", width: "1px", background: "var(--border)", opacity: 0.6 }} />

      {/* Progress fill */}
      <div style={{
        position: "absolute", left: "21px", top: "8%", width: "1px",
        height: `${Math.min(progress * 84, 84)}%`,
        background: "var(--accent)", opacity: 0.55,
        boxShadow: "0 0 6px rgba(200,169,110,0.45)",
        transition: "height 0.12s linear"
      }} />

      {/* Section dots */}
      {sections.map((s, i) => {
        const isPast = progress >= positions[i] - 0.01
        const topPct = 8 + positions[i] * 84
        return (
          <div
            key={s.id}
            onClick={() => scrollTo(s.id)}
            title={s.label}
            style={{
              position: "absolute",
              top: `${topPct}%`,
              left: "18px",
              transform: "translate(-50%, -50%)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div style={{
              width: "5px", height: "5px", borderRadius: "50%", flexShrink: 0,
              background: isPast ? "var(--accent)" : "transparent",
              border: `1px solid ${isPast ? "var(--accent)" : "var(--border)"}`,
              transition: `all 0.4s ${ease}`,
              boxShadow: isPast ? "0 0 4px rgba(200,169,110,0.5)" : "none"
            }} />
            <p style={{
              color: "var(--text-3)", fontSize: "8px", fontFamily: "DM Mono, monospace",
              letterSpacing: "0.14em", textTransform: "uppercase",
              writingMode: "vertical-rl", transform: "rotate(180deg)",
              whiteSpace: "nowrap", opacity: 0.35, userSelect: "none",
              transition: `opacity 0.3s ${ease}`
            }}>
              {s.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}
