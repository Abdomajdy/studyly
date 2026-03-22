"use client"
import { useState, useRef } from "react"

interface PDFUploadProps {
  onExtract: (text: string) => void
}

export default function PDFUpload({ onExtract }: PDFUploadProps) {
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") return
    setLoading(true)
    setFileName(file.name)

    try {
      const pdfjsLib = await import("pdfjs-dist")
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const pages: string[] = []

      for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
        pages.push(text)
      }

      const fullText = pages.join("\n\n")
      if (fullText.trim()) {
        onExtract(fullText)
      }
    } catch (err) {
      console.error("[PDFUpload] extraction error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          color: fileName ? "var(--accent)" : "var(--text-3)",
          fontFamily: "DM Mono, monospace",
          fontSize: "12px",
          letterSpacing: "0.08em",
          padding: "10px 16px",
          cursor: loading ? "wait" : "pointer",
          textTransform: "uppercase",
          transition: "border-color 0.2s, color 0.2s",
          width: "100%",
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--text-3)")}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      >
        {loading ? "extracting..." : fileName ? `✓ ${fileName}` : "↑ upload pdf notes"}
      </button>
    </div>
  )
}
