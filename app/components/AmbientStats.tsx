"use client"
import { useEffect, useState } from "react"

const ease = "cubic-bezier(0.0, 0.0, 0.2, 1)"

export default function AmbientStats() {
  const [sessionCount, setSessionCount] = useState(4891)
  const [topicsCount, setTopicsCount] = useState(847)
  const [avgGap, setAvgGap] = useState(2.3)
  const [currentTime, setCurrentTime] = useState("")
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    setCurrentTime(fmt())

    const t = setTimeout(() => setVisible(true), 2000)
    const i1 = setInterval(() => setSessionCount(n => n + 1), 8000)
    const i2 = setInterval(() => setTopicsCount(n => n + 1), 12000)
    const i3 = setInterval(() => {
      setAvgGap(n => Math.round((n + (Math.random() * 0.2 - 0.1)) * 10) / 10)
    }, 5000)
    const i4 = setInterval(() => setCurrentTime(fmt()), 60000)

    return () => {
      clearTimeout(t)
      clearInterval(i1); clearInterval(i2); clearInterval(i3); clearInterval(i4)
    }
  }, [])

  const stats = [
    `session ${sessionCount.toLocaleString()}`,
    `topics closed: ${topicsCount}`,
    `avg gap: ${avgGap} topics`,
    currentTime,
  ]

  return (
    <div
      className="ambient-stats"
      style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: "36px", zIndex: 50,
        display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", gap: "52px",
        opacity: visible ? 0.45 : 0,
        transition: `opacity 1.8s ${ease}`,
        pointerEvents: "none",
      }}
    >
      {stats.map((s, i) => (
        <p key={i} style={{
          color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
          letterSpacing: "0.15em", writingMode: "vertical-rl",
          whiteSpace: "nowrap", userSelect: "none",
        }}>
          {s}
        </p>
      ))}
    </div>
  )
}
