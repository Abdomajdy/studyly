"use client"
import { useEffect, useRef } from "react"

interface Particle { x: number; y: number; vx: number; vy: number }

export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Hide on mobile
    if (window.matchMedia("(max-width: 768px)").matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const COUNT   = 110
    const CONNECT = 160
    const REPEL   = 180

    let w = window.innerWidth
    let h = window.innerHeight
    canvas.width  = w
    canvas.height = h

    const make = (): Particle[] =>
      Array.from({ length: COUNT }, () => ({
        x:  Math.random() * w,
        y:  Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }))

    let particles = make()
    const mouse = { x: -999, y: -999 }
    let frame = 0

    const onMove  = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY }
    const onLeave = () => { mouse.x = -999; mouse.y = -999 }
    window.addEventListener("mousemove", onMove)
    document.addEventListener("mouseleave", onLeave)

    const onResize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width  = w
      canvas.height = h
      particles = make()
    }
    window.addEventListener("resize", onResize)

    // Static draw for prefers-reduced-motion — particles only, no movement
    if (reduced) {
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(200,169,110,0.35)"
        ctx.fill()
      }
      return () => {
        window.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseleave", onLeave)
        window.removeEventListener("resize", onResize)
      }
    }

    let raf: number
    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      frame++

      // Update particles
      for (const p of particles) {
        // Mouse repel
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d  = Math.hypot(dx, dy)
        if (d < REPEL && d > 0) {
          const force = ((REPEL - d) / REPEL) * 0.06
          p.vx += (dx / d) * force
          p.vy += (dy / d) * force
        }

        // Damping (gentle return-to-drift after repel)
        p.vx *= 0.96
        p.vy *= 0.96

        // Random nudge every 120 frames so particles never fully stall
        if (frame % 120 === 0) {
          p.vx += (Math.random() - 0.5) * 0.04
          p.vy += (Math.random() - 0.5) * 0.04
        }

        // Speed cap
        const spd = Math.hypot(p.vx, p.vy)
        if (spd > 0.8) { p.vx *= 0.8 / spd; p.vy *= 0.8 / spd }

        // Wrap edges
        p.x = ((p.x + p.vx) + w) % w
        p.y = ((p.y + p.vy) + h) % h
      }

      // Draw connection lines
      for (let i = 0; i < particles.length - 1; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d  = Math.hypot(dx, dy)
          if (d < CONNECT) {
            const alpha = 0.25 + (1 - d / CONNECT) * 0.30   // 0.25 → 0.55
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(200,169,110,${alpha})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      // Draw dots
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(200,169,110,0.35)"
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

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="particle-canvas"
      style={{
        position: "fixed", top: 0, left: 0,
        width: "100vw", height: "100vh",
        pointerEvents: "none", zIndex: 0,
      }}
    />
  )
}
