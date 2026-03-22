"use client"
import { useEffect, useRef, useState } from "react"

interface DesmosEmbedProps {
  code: string
}

export default function DesmosEmbed({ code }: DesmosEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  const calcRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let alive = true

    // Load Desmos API script dynamically
    const existing = document.getElementById("desmos-api-script")
    const load = () => {
      try {
        const Desmos = (window as unknown as Record<string, unknown>).Desmos as {
          GraphingCalculator: (
            el: HTMLElement,
            opts: Record<string, unknown>
          ) => {
            setExpression: (expr: Record<string, string>) => void
            destroy: () => void
          }
        }
        if (!Desmos || !containerRef.current || !alive) return

        const calc = Desmos.GraphingCalculator(containerRef.current, {
          expressions: false,
          settingsMenu: false,
          zoomButtons: true,
          border: false,
          lockViewport: false,
          backgroundColor: "#111113",
          // Dark theme colors
          colors: {
            RED: "#e05a5a",
            BLUE: "#6ea8c8",
            GREEN: "#5a9e6f",
            ORANGE: "#c8a96e",
            PURPLE: "#9b7ec8",
            BLACK: "#f0ede8",
          } as unknown as string,
        })
        calcRef.current = calc

        // Parse the code as JSON array of expressions, or line-by-line latex
        try {
          const parsed = JSON.parse(code)
          if (Array.isArray(parsed)) {
            parsed.forEach((expr: Record<string, string> | string, i: number) => {
              if (typeof expr === "string") {
                calc.setExpression({ id: `expr-${i}`, latex: expr })
              } else {
                calc.setExpression({ id: `expr-${i}`, ...expr })
              }
            })
          }
        } catch {
          // Not JSON — treat each line as a latex expression
          const lines = code.split("\n").filter(l => l.trim())
          lines.forEach((line, i) => {
            calc.setExpression({ id: `expr-${i}`, latex: line.trim() })
          })
        }
      } catch {
        if (alive) setError(true)
      }
    }

    if (existing) {
      load()
    } else {
      const script = document.createElement("script")
      script.id = "desmos-api-script"
      script.src = "https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6"
      script.onload = load
      script.onerror = () => { if (alive) setError(true) }
      document.head.appendChild(script)
    }

    return () => {
      alive = false
      if (calcRef.current) {
        (calcRef.current as { destroy: () => void }).destroy()
        calcRef.current = null
      }
    }
  }, [code])

  if (error) {
    return (
      <pre style={{
        fontFamily: "DM Mono, monospace", fontSize: "12px", lineHeight: "1.6",
        background: "#1e1e1e", border: "1px solid var(--border)",
        padding: "20px 24px", overflowX: "auto", marginBottom: "16px",
        color: "var(--text-3)",
      }}>{code}</pre>
    )
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderTop: "2px solid var(--accent)",
      marginBottom: "16px",
      position: "relative",
    }}>
      <span style={{
        position: "absolute", top: "8px", left: "12px", zIndex: 1,
        color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
        letterSpacing: "0.12em", textTransform: "uppercase",
        background: "rgba(17,17,19,0.8)", padding: "2px 6px",
      }}>desmos</span>
      <div ref={containerRef} style={{ width: "100%", height: "350px" }} />
    </div>
  )
}
