"use client"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function RegisterPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [visible,  setVisible]  = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Existing logic (untouched) ───────────────────────────────────────────────
  async function handleRegister() {
    setLoading(true)
    setError("")
    const { error: signUpError } = await supabase.auth.signUp({
      email, password, options: { data: { username } }
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    router.push("/onboarding")
  }

  // ── Form fade-in ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  // ── Particle canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    canvas.width  = w
    canvas.height = h

    const COUNT   = 60
    const CONNECT = 140
    const REPEL   = 130

    interface P { x: number; y: number; vx: number; vy: number }
    const make = (): P[] => Array.from({ length: COUNT }, () => ({
      x:  Math.random() * w,
      y:  Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
    }))
    let particles = make()

    const mouse = { x: -999, y: -999 }
    const onMove  = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    const onLeave = () => { mouse.x = -999; mouse.y = -999 }
    window.addEventListener("mousemove", onMove)
    document.addEventListener("mouseleave", onLeave)

    const onResize = () => {
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w; canvas.height = h
      particles = make()
    }
    window.addEventListener("resize", onResize)

    let raf: number
    const tick = () => {
      ctx.clearRect(0, 0, w, h)

      for (const p of particles) {
        // Mouse repel
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d  = Math.hypot(dx, dy)
        if (d < REPEL && d > 0) {
          const f = ((REPEL - d) / REPEL) * 0.055
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        // Dampen
        p.vx *= 0.97
        p.vy *= 0.97
        // Move + edge wrap
        p.x = ((p.x + p.vx) + w) % w
        p.y = ((p.y + p.vy) + h) % h
      }

      // Connection lines
      for (let i = 0; i < particles.length - 1; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d  = Math.hypot(dx, dy)
          if (d < CONNECT) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(200,169,110,${(1 - d / CONNECT) * 0.18})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      // Dots
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(200,169,110,0.25)"
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseleave", onLeave)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  // ── Styles ───────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    padding: "14px 18px",
    fontFamily: "DM Mono, monospace",
    fontSize: "14px",
    outline: "none",
    marginBottom: "12px",
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
      position: "relative",
    }}>

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed", top: 0, left: 0,
          width: "100vw", height: "100vh",
          pointerEvents: "none", zIndex: 0,
        }}
      />

      {/* Form — fades in over 0.6s, slides up 10px */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: "400px",
        opacity:   visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}>

        {/* Logo */}
        <p style={{
          color: "var(--accent)", fontSize: "13px",
          fontFamily: "DM Mono, monospace",
          letterSpacing: "0.08em", marginBottom: "28px",
          textAlign: "center",
        }}>
          stud<span style={{ color: "var(--accent)" }}>i</span>ly
        </p>

        <h1 style={{
          fontFamily: "DM Serif Display, serif", fontSize: "32px",
          color: "var(--text)", marginBottom: "8px",
        }}>
          Create account
        </h1>
        <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>
          Let&rsquo;s get you locked in.
        </p>

        <input
          type="text" placeholder="username" value={username}
          onChange={e => setUsername(e.target.value)}
          style={inputStyle}
        />
        <input
          type="email" placeholder="email" value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" placeholder="password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleRegister()}
          style={{ ...inputStyle, marginBottom: "20px" }}
        />

        {error && (
          <p style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "16px" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleRegister}
          disabled={loading}
          style={{
            width: "100%", background: "var(--text)", color: "var(--bg)",
            border: "none", padding: "16px",
            fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500,
            cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: "20px", opacity: loading ? 0.6 : 1,
            transition: "opacity 0.2s ease",
          }}
        >
          {loading ? "creating account..." : "Create account →"}
        </button>

        <p style={{ color: "var(--text-3)", fontSize: "12px", textAlign: "center" }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--text-2)", textDecoration: "none" }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}
