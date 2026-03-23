"use client"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

export default function ExamOutcomePage() {
  const params = useSearchParams()
  const router = useRouter()
  const course = params.get("course") || ""
  const examDate = params.get("date") || ""
  const [submitted, setSubmitted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => { setTimeout(() => setVisible(true), 100) }, [])

  async function submit(outcome: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push("/login"); return }

    await fetch("/api/exam-followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, course, examDate, outcome })
    })
    setSubmitted(true)
    toast.success("thanks — this helps us improve")
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease"
    }}>
      <div style={{ width: "100%", maxWidth: "480px", textAlign: "center" }}>
        {!submitted ? (
          <>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px", fontFamily: "DM Mono, monospace" }}>
              {course} EXAM
            </p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "12px", letterSpacing: "-0.02em" }}>
              How did it go?
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginBottom: "48px", lineHeight: "1.7" }}>
              one tap. no judgment. this helps us understand if studyly is actually working.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { value: "better_than_expected", label: "BETTER THAN EXPECTED", color: "var(--success)" },
                { value: "as_expected", label: "ABOUT WHAT I EXPECTED", color: "var(--text-2)" },
                { value: "worse_than_expected", label: "WORSE THAN EXPECTED", color: "var(--danger)" }
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => submit(opt.value)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    color: "var(--text-2)",
                    padding: "20px",
                    fontFamily: "DM Mono, monospace",
                    fontSize: "13px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = opt.color
                    e.currentTarget.style.color = opt.color
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = "var(--border)"
                    e.currentTarget.style.color = "var(--text-2)"
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "16px" }}>
              Noted.
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginBottom: "40px", lineHeight: "1.7" }}>
              every response makes studyly more accurate. thank you.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                background: "var(--text)", color: "var(--bg)", border: "none",
                padding: "16px 48px", fontFamily: "DM Mono, monospace",
                fontSize: "13px", fontWeight: 500, letterSpacing: "0.08em",
                textTransform: "uppercase", cursor: "pointer"
              }}
            >
              BACK TO STUDYLY →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
