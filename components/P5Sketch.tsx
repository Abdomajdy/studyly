"use client"
import { useRef, useState, useEffect } from "react"

interface P5SketchProps {
  code: string
}

export default function P5Sketch({ code }: P5SketchProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!iframeRef.current) return

    try {
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body { background: #111113; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  canvas { display: block; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"><\/script>
</head>
<body>
<script>
const COLORS = {
  bg: '#111113',
  accent: '#c8a96e',
  text: '#f0ede8',
  danger: '#e05a5a',
  success: '#5a9e6f',
  blue: '#6ea8c8',
  purple: '#9b7ec8',
  border: '#2a2a2e',
};

window.addEventListener('message', function(e) {
  if (e.data === 'pause' && typeof noLoop === 'function') noLoop();
  if (e.data === 'resume' && typeof loop === 'function') loop();
});

try {
${code}
} catch(e) {
  document.body.innerHTML = '<p style="color:#4a4a4a;font-family:monospace;padding:20px;font-size:12px">sketch error: ' + e.message + '</p>';
}
<\/script>
</body>
</html>`

      const blob = new Blob([html], { type: "text/html" })
      const url = URL.createObjectURL(blob)
      iframeRef.current.src = url

      return () => URL.revokeObjectURL(url)
    } catch {
      setError(true)
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
      <div style={{
        position: "absolute", top: "8px", left: "12px", zIndex: 1,
        display: "flex", gap: "8px", alignItems: "center",
      }}>
        <span style={{
          color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
          letterSpacing: "0.12em", textTransform: "uppercase",
          background: "rgba(17,17,19,0.8)", padding: "2px 6px",
        }}>animation</span>
        <button
          onClick={() => {
            const next = !playing
            setPlaying(next)
            iframeRef.current?.contentWindow?.postMessage(
              next ? "resume" : "pause", "*"
            )
          }}
          style={{
            background: "rgba(17,17,19,0.8)", border: "1px solid var(--border)",
            color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace",
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.08em",
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        style={{
          width: "100%", height: "350px", border: "none",
          background: "#111113",
        }}
        title="p5.js animation"
      />
    </div>
  )
}
