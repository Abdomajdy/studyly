"use client"
import { useEffect, useRef } from "react"

export default function CustomCursor() {
  const posRef    = useRef<HTMLDivElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const dotRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let isHovering = false

    const setHover = (on: boolean) => {
      if (isHovering === on || !circleRef.current || !dotRef.current) return
      isHovering = on
      if (on) {
        circleRef.current.style.width        = "44px"
        circleRef.current.style.height       = "44px"
        circleRef.current.style.borderColor  = "rgba(200,169,110,1)"
        circleRef.current.style.background   = "rgba(200,169,110,0.1)"
        dotRef.current.style.opacity         = "0"
      } else {
        circleRef.current.style.width        = "22px"
        circleRef.current.style.height       = "22px"
        circleRef.current.style.borderColor  = "rgba(200,169,110,0.85)"
        circleRef.current.style.background   = "rgba(200,169,110,0.06)"
        dotRef.current.style.opacity         = "1"
      }
    }

    const onMove = (e: MouseEvent) => {
      if (posRef.current) {
        // Direct tracking — no lerp, pixel-perfect
        posRef.current.style.opacity   = "1"
        posRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      }
      const el = e.target as Element | null
      setHover(!!(el?.closest('button, a, input, textarea, [role="button"], [data-cursor]')))
    }

    const onDown = () => {
      if (circleRef.current)
        circleRef.current.style.transform = "translate(-50%, -50%) scale(0.65)"
    }

    const onUp = () => {
      if (circleRef.current)
        circleRef.current.style.transform = "translate(-50%, -50%) scale(1)"
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onDown)
    window.addEventListener("mouseup",   onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("mouseup",   onUp)
    }
  }, [])

  return (
    // Outer div: position only, no transition
    <div
      ref={posRef}
      aria-hidden="true"
      style={{
        position: "fixed", top: 0, left: 0, zIndex: 9999,
        pointerEvents: "none", opacity: 0,
        willChange: "transform",
      }}
    >
      {/* Inner div: visual state — size/color/scale use CSS transitions */}
      <div
        ref={circleRef}
        className="custom-cursor"
        style={{
          width: "22px", height: "22px",
          borderRadius: "50%",
          border: "1.5px solid rgba(200,169,110,0.85)",
          background: "rgba(200,169,110,0.06)",
          transform: "translate(-50%, -50%) scale(1)",
          transition: "width 0.15s ease, height 0.15s ease, background 0.15s ease, border-color 0.15s ease, transform 0.1s ease",
          position: "relative",
        }}
      >
        {/* Center dot — disappears on hover */}
        <div
          ref={dotRef}
          style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "4px", height: "4px",
            borderRadius: "50%",
            background: "rgba(200,169,110,0.9)",
            transition: "opacity 0.15s ease",
          }}
        />
      </div>
    </div>
  )
}
