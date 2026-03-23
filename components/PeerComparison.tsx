"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import * as Switch from "@radix-ui/react-switch"

type Props = {
  userId: string
  mastery: { topic: string; course: string; score: number }[]
}

type PeerData = {
  topic: string
  avg_score: number
  sample_size: number
  user_score: number
  percentile: number
}

export default function PeerComparison({ userId, mastery }: Props) {
  const [optedIn, setOptedIn] = useState(false)
  const [peerData, setPeerData] = useState<PeerData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: consent } = await supabase
        .from("peer_comparison_consent")
        .select("opted_in")
        .eq("user_id", userId)
        .single()
      const isOptedIn = consent?.opted_in ?? false
      setOptedIn(isOptedIn)

      if (isOptedIn && mastery.length > 0) {
        const topics = mastery.map(m => m.topic)
        const { data: peers } = await supabase
          .from("peer_mastery_aggregates")
          .select("topic, avg_score, sample_size")
          .in("topic", topics)

        if (peers) {
          const combined = mastery
            .map(m => {
              const peer = peers.find(p => p.topic === m.topic)
              if (!peer || peer.sample_size < 5) return null
              // Simple percentile estimate
              const percentile = peer.avg_score > 0
                ? Math.round((m.score / (peer.avg_score * 2)) * 100)
                : 50
              return {
                topic: m.topic,
                avg_score: Math.round(peer.avg_score),
                sample_size: peer.sample_size,
                user_score: m.score,
                percentile: Math.min(99, Math.max(1, percentile))
              }
            })
            .filter(Boolean) as PeerData[]
          setPeerData(combined)
        }
      }
      setLoading(false)
    }
    load()
  }, [userId, mastery])

  async function handleToggle(checked: boolean) {
    setOptedIn(checked)
    await supabase
      .from("peer_comparison_consent")
      .upsert({ user_id: userId, opted_in: checked })

    if (checked) {
      // Contribute this user's data to aggregates
      for (const m of mastery) {
        const { data: existing } = await supabase
          .from("peer_mastery_aggregates")
          .select("avg_score, sample_size")
          .eq("topic", m.topic)
          .single()

        if (existing) {
          const newAvg = ((existing.avg_score * existing.sample_size) + m.score) / (existing.sample_size + 1)
          await supabase.from("peer_mastery_aggregates").update({
            avg_score: newAvg,
            sample_size: existing.sample_size + 1,
            updated_at: new Date().toISOString()
          }).eq("topic", m.topic)
        } else {
          await supabase.from("peer_mastery_aggregates").insert({
            topic: m.topic,
            course: m.course,
            avg_score: m.score,
            sample_size: 1
          })
        }
      }
    }
  }

  return (
    <div style={{ marginTop: "40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "DM Mono, monospace" }}>
          PEER COMPARISON
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
            {optedIn ? "ON" : "OFF"}
          </p>
          <Switch.Root
            checked={optedIn}
            onCheckedChange={handleToggle}
            style={{
              width: "36px", height: "20px",
              background: optedIn ? "var(--accent)" : "var(--border)",
              borderRadius: "10px", border: "none",
              cursor: "pointer", position: "relative",
              transition: "background 0.2s"
            }}
          >
            <Switch.Thumb style={{
              display: "block", width: "14px", height: "14px",
              background: "var(--text)", borderRadius: "50%",
              position: "absolute", top: "3px",
              left: optedIn ? "19px" : "3px",
              transition: "left 0.2s"
            }} />
          </Switch.Root>
        </div>
      </div>

      {!optedIn && (
        <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", fontStyle: "italic", lineHeight: "1.6" }}>
          opt in to see how your scores compare to other students. all data is anonymous.
        </p>
      )}

      {optedIn && peerData.length === 0 && !loading && (
        <p style={{ color: "var(--text-3)", fontSize: "12px", fontFamily: "DM Mono, monospace", fontStyle: "italic" }}>
          not enough data yet — need at least 5 students on each topic.
        </p>
      )}

      {optedIn && peerData.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {peerData.map(p => (
            <div key={p.topic} style={{
              background: "var(--bg-2)", padding: "16px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderLeft: `2px solid ${p.percentile >= 60 ? "var(--success)" : p.percentile >= 40 ? "var(--accent)" : "var(--danger)"}`
            }}>
              <div>
                <p style={{ color: "var(--text)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>{p.topic}</p>
                <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace" }}>
                  avg: {p.avg_score} · {p.sample_size} students
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ color: "var(--text)", fontSize: "18px", fontFamily: "DM Serif Display, serif" }}>
                  top {100 - p.percentile}%
                </p>
                <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  your score: {p.user_score}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
