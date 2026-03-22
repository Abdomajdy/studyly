"use client"
import { useState, useEffect } from "react"

interface PlotlyChartProps {
  code: string
}

export default function PlotlyChart({ code }: PlotlyChartProps) {
  const [error, setError] = useState(false)
  const [Plot, setPlot] = useState<React.ComponentType<{
    data: Plotly.Data[]
    layout: Partial<Plotly.Layout>
    config?: Partial<Plotly.Config>
    style?: React.CSSProperties
  }> | null>(null)
  const [chartData, setChartData] = useState<{ data: Plotly.Data[]; layout: Partial<Plotly.Layout> } | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const mod = await import("react-plotly.js")
        if (!alive) return
        setPlot(() => mod.default as unknown as typeof Plot extends null ? never : NonNullable<typeof Plot>)

        // Parse the JSON code block
        const parsed = JSON.parse(code)
        setChartData({
          data: parsed.data || [],
          layout: {
            paper_bgcolor: "#0a0a0b",
            plot_bgcolor: "#111113",
            font: { color: "#f0ede8", family: "DM Mono, monospace", size: 11 },
            margin: { t: 30, r: 20, b: 40, l: 50 },
            xaxis: { gridcolor: "#2a2a2e", zerolinecolor: "#2a2a2e" },
            yaxis: { gridcolor: "#2a2a2e", zerolinecolor: "#2a2a2e" },
            ...(parsed.layout || {}),
          },
        })
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => { alive = false }
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

  if (!Plot || !chartData) {
    return (
      <div style={{
        background: "#111113", border: "1px solid var(--border)",
        borderTop: "2px solid var(--accent)",
        padding: "40px", marginBottom: "16px", textAlign: "center",
        color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace",
      }}>loading chart...</div>
    )
  }

  return (
    <div style={{
      border: "1px solid var(--border)",
      borderTop: "2px solid var(--accent)",
      marginBottom: "16px", overflow: "hidden",
    }}>
      <Plot
        data={chartData.data}
        layout={chartData.layout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "350px" }}
      />
    </div>
  )
}
