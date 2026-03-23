"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Props = {
  courseName: string
  onSelect: (topic: string) => void
}

export default function TopicSuggestions({ courseName, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!courseName.trim()) return
    async function load() {
      const { data } = await supabase
        .from("topic_suggestions")
        .select("topics")
        .ilike("course_name", `%${courseName.toLowerCase()}%`)
        .single()
      if (data?.topics) setSuggestions(data.topics)
    }
    load()
  }, [courseName])

  if (!suggestions.length) return null

  return (
    <div style={{ marginBottom: "16px" }}>
      <p style={{
        color: "var(--text-3)", fontSize: "10px",
        letterSpacing: "0.15em", textTransform: "uppercase",
        marginBottom: "10px", fontFamily: "DM Mono, monospace"
      }}>
        SUGGESTED TOPICS
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {suggestions.map((topic, i) => (
          <button
            key={i}
            onClick={() => onSelect(topic)}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-3)",
              fontFamily: "DM Mono, monospace",
              fontSize: "11px",
              letterSpacing: "0.06em",
              padding: "6px 12px",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseOver={e => {
              e.currentTarget.style.borderColor = "var(--accent)"
              e.currentTarget.style.color = "var(--accent)"
            }}
            onMouseOut={e => {
              e.currentTarget.style.borderColor = "var(--border)"
              e.currentTarget.style.color = "var(--text-3)"
            }}
          >
            {topic}
          </button>
        ))}
      </div>
    </div>
  )
}
