"use client"
import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError("")
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) { setError(signInError.message); setLoading(false); return }
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>studyly</p>
        <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "32px", color: "var(--text)", marginBottom: "8px" }}>Welcome back</h1>
        <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>Let's get back to work.</p>

        <input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        <input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ ...inputStyle, marginBottom: "20px" }} />

        {error && <p style={{ color: "var(--danger)", fontSize: "12px", marginBottom: "16px" }}>{error}</p>}

        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", background: "var(--text)", color: "var(--bg)", border: "none",
          padding: "16px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500,
          cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "20px"
        }}>
          {loading ? "logging in..." : "Log in →"}
        </button>

        <p style={{ color: "var(--text-3)", fontSize: "12px", textAlign: "center" }}>
          Don't have an account?{" "}
          <a href="/register" style={{ color: "var(--text-2)", textDecoration: "none" }}>Sign up</a>
        </p>
      </div>
    </div>
  )
}
