"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { saveOnboarding } from "@/services/onboarding.service"

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState("")
  const [courseName, setCourseName] = useState("")
  const [courseCode, setCourseCode] = useState("")
  const [examDate, setExamDate] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUserId(user.id)
      const meta = user.user_metadata?.username as string | undefined
      setUsername(meta ?? "")
    }
    loadUser()
  }, [router])

  async function handleStep1Next() {
    if (!username.trim()) {
      setError("Username is required")
      return
    }
    setError("")
    setStep(2)
  }

  async function handleComplete() {
    if (!userId) return
    setLoading(true)
    setError("")
    await saveOnboarding(userId, username.trim(), {
      name: courseName.trim(),
      code: courseCode.trim() || undefined,
      examDate: examDate || undefined
    })
    setLoading(false)
    router.push("/dashboard")
  }

  async function handleSkip() {
    if (!userId) return
    setLoading(true)
    setError("")
    await saveOnboarding(userId, username.trim())
    setLoading(false)
    router.push("/dashboard")
  }

  const inputStyle = {
    width: "100%",
    background: "var(--bg-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    padding: "14px 18px",
    fontFamily: "DM Mono, monospace",
    fontSize: "14px",
    outline: "none",
    marginBottom: "12px"
  }

  const buttonStyle = {
    width: "100%",
    background: "var(--text)",
    color: "var(--bg)",
    border: "none",
    padding: "16px",
    fontFamily: "DM Mono, monospace",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    marginBottom: "12px"
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <p
          style={{
            color: "var(--text-3)",
            fontSize: "11px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: "8px"
          }}
        >
          {step} of 2
        </p>
        <p
          style={{
            color: "var(--accent)",
            fontSize: "11px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            marginBottom: "20px",
            fontFamily: "DM Mono, monospace"
          }}
        >
          <span style={{ color: "var(--text)" }}>stud</span>
          <span style={{ color: "var(--accent)" }}>i</span>
          <span style={{ color: "var(--text)" }}>ly</span>
        </p>

        {step === 1 && (
          <>
            <h1
              style={{
                fontFamily: "DM Serif Display, serif",
                fontSize: "32px",
                color: "var(--text)",
                marginBottom: "8px"
              }}
            >
              What should we call you?
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>
              Confirm or edit your username.
            </p>
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleStep1Next()}
              style={inputStyle}
            />
            {error && (
              <p style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "16px" }}>
                {error}
              </p>
            )}
            <button onClick={handleStep1Next} style={buttonStyle}>
              Next →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1
              style={{
                fontFamily: "DM Serif Display, serif",
                fontSize: "32px",
                color: "var(--text)",
                marginBottom: "8px"
              }}
            >
              Add your first course
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>
              Course name, code, and exam date — all optional except the name.
            </p>
            <input
              type="text"
              placeholder="course name"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="course code (optional)"
              value={courseCode}
              onChange={e => setCourseCode(e.target.value)}
              style={inputStyle}
            />
            <input
              type="date"
              placeholder="exam date (optional)"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
              style={{ ...inputStyle, marginBottom: "20px" }}
            />
            {error && (
              <p style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "16px" }}>
                {error}
              </p>
            )}
            <button
              onClick={handleComplete}
              disabled={loading || !courseName.trim()}
              style={{
                ...buttonStyle,
                background: courseName.trim() ? "var(--text)" : "var(--bg-3)",
                color: courseName.trim() ? "var(--bg)" : "var(--text-3)",
                cursor: courseName.trim() ? "pointer" : "not-allowed"
              }}
            >
              {loading ? "saving..." : "Done →"}
            </button>
            <button
              onClick={handleSkip}
              disabled={loading}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                color: "var(--text-3)",
                fontFamily: "DM Mono, monospace",
                fontSize: "12px",
                cursor: "pointer",
                padding: "8px"
              }}
            >
              Skip — add courses later
            </button>
          </>
        )}
      </div>
    </div>
  )
}
