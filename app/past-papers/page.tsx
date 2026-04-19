"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

type PastPaper = {
  id: string
  course: string
  filename: string
  questions_detected: number
  created_at: string
}

export default function PastPapersPage() {
  const router = useRouter()
  const [papers, setPapers] = useState<PastPaper[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [course, setCourse] = useState("")
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      const { data } = await supabase
        .from("past_papers")
        .select("id, course, filename, questions_detected, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
      if (data) setPapers(data)
      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    onDrop: async (files) => {
      const file = files[0]
      if (!file || !course.trim()) {
        toast.error("enter a course name first")
        return
      }
      setUploading(true)
      try {
        const { pdfjs } = await import("react-pdf")
        pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
        let fullText = ""
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          fullText += content.items.map((item: Record<string, unknown>) => ("str" in item ? item.str : "")).join(" ") + "\n"
        }

        // Detect questions (lines ending in ? or starting with Q/question number)
        const questionPatterns = fullText.split("\n").filter(line =>
          line.trim().endsWith("?") ||
          /^(Q\d+|question\s+\d+|\d+\s*[.)])/i.test(line.trim())
        )

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: paper } = await supabase.from("past_papers").insert({
          user_id: user.id,
          course: course.trim(),
          filename: file.name,
          extracted_text: fullText.trim(),
          questions_detected: questionPatterns.length
        }).select().single()

        if (paper) {
          setPapers(prev => [paper, ...prev])
          toast.success(`${file.name} uploaded — ${questionPatterns.length} questions detected`)
          setCourse("")
        }
      } catch (err) {
        console.error(err)
        toast.error("could not process PDF")
      } finally {
        setUploading(false)
      }
    }
  })

  async function startMockExam(paper: PastPaper) {
    router.push(`/session?topic=${encodeURIComponent(paper.course + " past paper")}&paperId=${paper.id}`)
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>loading...</p>
    </div>
  )

  return (
    <div className="ambient-bg" style={{ minHeight: "100vh", background: "var(--bg)", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "64px 24px", position: "relative", zIndex: 2 }}>

        <div style={{ marginBottom: "48px" }}>
          <p className="marginal-mark">§ 03 · PAST PAPERS</p>
          <h1 className="flourish-underline" style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "28px" }}>
            Practice on real exams.
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "14px", fontFamily: "DM Mono, monospace", lineHeight: "1.7" }}>
            upload a past paper. the AI runs you through it question by question.
          </p>
        </div>

        {/* Upload */}
        <div style={{ marginBottom: "48px" }}>
          <input
            type="text"
            placeholder="course name..."
            value={course}
            onChange={e => setCourse(e.target.value)}
            style={{
              width: "100%", background: "var(--bg-2)", color: "var(--text)",
              border: "1px solid var(--border)", padding: "14px 20px",
              fontFamily: "DM Mono, monospace", fontSize: "14px",
              outline: "none", marginBottom: "12px", transition: "border-color 0.2s"
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <div
            {...getRootProps()}
            style={{
              border: `1px dashed ${isDragActive ? "var(--accent)" : "var(--border)"}`,
              padding: "40px 24px",
              textAlign: "center",
              cursor: course.trim() ? "pointer" : "not-allowed",
              background: isDragActive ? "rgba(200,169,110,0.04)" : "var(--bg-2)",
              transition: "all 0.2s",
              opacity: course.trim() ? 1 : 0.4
            }}
          >
            <input {...getInputProps()} disabled={!course.trim()} />
            <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {uploading ? "PROCESSING..." : isDragActive ? "DROP IT" : "↑ DROP PAST PAPER PDF HERE"}
            </p>
            {!course.trim() && (
              <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginTop: "8px", opacity: 0.6 }}>
                enter course name first
              </p>
            )}
          </div>
        </div>

        {/* Papers list */}
        {papers.length > 0 && (
          <div>
            <hr className="ornament-divider" />
            <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px", fontFamily: "DM Mono, monospace" }}>
              YOUR PAPERS
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {papers.map(paper => (
                <div key={paper.id} style={{
                  background: "var(--bg-2)",
                  borderLeft: "2px solid var(--border)",
                  padding: "20px 24px",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <div>
                    <p style={{ color: "var(--text)", fontSize: "14px", fontFamily: "DM Mono, monospace", marginBottom: "4px" }}>{paper.course}</p>
                    <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                      {paper.filename} · {paper.questions_detected} questions
                    </p>
                  </div>
                  <button
                    onClick={() => startMockExam(paper)}
                    style={{
                      background: "none", border: "1px solid var(--border)",
                      color: "var(--accent)", fontFamily: "DM Mono, monospace",
                      fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase",
                      padding: "8px 16px", cursor: "pointer", transition: "all 0.2s"
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(200,169,110,0.06)" }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "none" }}
                  >
                    START MOCK →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {papers.length === 0 && !loading && (
          <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", fontStyle: "italic" }}>
            no papers yet. upload your first one above.
          </p>
        )}

        <button
          onClick={() => router.push("/dashboard")}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "48px", transition: "color 0.2s" }}
          onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
          onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
        >
          ← BACK TO DASHBOARD
        </button>
      </div>
    </div>
  )
}
