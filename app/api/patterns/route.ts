import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const authenticatedUserId = await getAuthenticatedUser(req)
  if (!authenticatedUserId) return unauthorizedResponse()

  try {
    const { userId } = await req.json()
    if (!userId || userId !== authenticatedUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 })
    }

    const supabase = getSupabase()

    // ── Fetch all raw signal data in parallel ────────────────────────────
    const [
      struggleRes,
      latencyRes,
      attentionRes,
      feedbackRes,
      sessionsRes,
      masteryRes,
      metadataRes,
      draftRes,
      messageCountRes,
      outcomeRes,
    ] = await Promise.all([
      supabase.from("struggle_events").select("struggle_type, topic").eq("user_id", userId),
      supabase.from("response_latency_events").select("latency_ms, topic").eq("user_id", userId),
      supabase.from("attention_events").select("event_type, duration_ms").eq("user_id", userId),
      supabase.from("session_feedback").select("confidence_before, confidence_after, helped").eq("user_id", userId),
      supabase.from("study_sessions").select("id, topic, started_at, ended_at").eq("user_id", userId).order("started_at", { ascending: false }),
      supabase.from("topic_mastery").select("topic, score").eq("user_id", userId),
      supabase.from("session_metadata").select("hour_of_day, day_of_week").eq("user_id", userId),
      supabase.from("draft_events").select("chars_deleted, event_type").eq("user_id", userId),
      supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("session_outcomes").select("summary, session_id").eq("user_id", userId).limit(10),
    ])

    // ── Compute aggregates ───────────────────────────────────────────────
    const struggles = struggleRes.data || []
    const latencies = (latencyRes.data || []).map(r => r.latency_ms)
    const attentionEvents = attentionRes.data || []
    const feedbacks = feedbackRes.data || []
    const sessions = sessionsRes.data || []
    const masteryRows = masteryRes.data || []
    const metadata = metadataRes.data || []
    const drafts = draftRes.data || []

    // Struggle breakdown
    const struggleCounts: Record<string, number> = {}
    struggles.forEach(s => { struggleCounts[s.struggle_type] = (struggleCounts[s.struggle_type] || 0) + 1 })

    // Response speed
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
    const fastCount = latencies.filter(l => l < 10000).length
    const slowCount = latencies.filter(l => l > 45000).length

    // Attention
    const tabAways = attentionEvents.filter(e => e.event_type === "tab_away")
    const distractions = attentionEvents.filter(e => e.event_type === "distraction")
    const avgTabAwayMs = tabAways.length > 0
      ? Math.round(tabAways.reduce((s, e) => s + (e.duration_ms || 0), 0) / tabAways.length)
      : 0

    // Confidence
    const withBefore = feedbacks.filter(f => f.confidence_before != null)
    const withAfter = feedbacks.filter(f => f.confidence_after != null)
    const avgConfBefore = withBefore.length > 0
      ? (withBefore.reduce((s, f) => s + f.confidence_before, 0) / withBefore.length).toFixed(1)
      : "n/a"
    const avgConfAfter = withAfter.length > 0
      ? (withAfter.reduce((s, f) => s + f.confidence_after, 0) / withAfter.length).toFixed(1)
      : "n/a"
    const helpedCount = feedbacks.filter(f => f.helped).length
    const notHelpedCount = feedbacks.filter(f => f.helped === false).length

    // Sessions
    const completedSessions = sessions.filter(s => s.ended_at)
    const durations = completedSessions.map(s =>
      Math.round((new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000)
    )
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0

    // Topic distribution
    const topicCounts: Record<string, number> = {}
    sessions.forEach(s => { topicCounts[s.topic] = (topicCounts[s.topic] || 0) + 1 })

    // Time of day preference
    const hourCounts: Record<number, number> = {}
    metadata.forEach(m => { hourCounts[m.hour_of_day] = (hourCounts[m.hour_of_day] || 0) + 1 })
    const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]

    // Day of week preference
    const dayCounts: Record<number, number> = {}
    metadata.forEach(m => { dayCounts[m.day_of_week] = (dayCounts[m.day_of_week] || 0) + 1 })
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    // Draft behavior
    const avgCharsDeleted = drafts.length > 0
      ? Math.round(drafts.reduce((s, d) => s + (d.chars_deleted || 0), 0) / drafts.length)
      : 0

    // ── Build the data summary for Claude ────────────────────────────────
    const dataSummary = `
STUDENT LEARNING DATA:

Sessions: ${sessions.length} total, ${completedSessions.length} completed
Average session duration: ${avgDuration} minutes
Total messages exchanged: ${messageCountRes.count ?? 0}

STRUGGLE PROFILE:
${Object.entries(struggleCounts).map(([type, count]) => `- ${type}: ${count} times`).join("\n") || "- No struggle events recorded"}
Total struggle events: ${struggles.length}

RESPONSE SPEED:
- Average response latency: ${avgLatency}ms (${(avgLatency / 1000).toFixed(1)}s)
- Fast responses (<10s): ${fastCount}
- Slow responses (>45s): ${slowCount}
- Total measured responses: ${latencies.length}

ATTENTION:
- Tab-away events: ${tabAways.length}
- Average tab-away duration: ${(avgTabAwayMs / 1000).toFixed(0)}s
- Distraction events (>3min away): ${distractions.length}

CONFIDENCE CALIBRATION:
- Average confidence before session: ${avgConfBefore}/5
- Average confidence after session: ${avgConfAfter}/5
- Sessions where student said "it helped": ${helpedCount}
- Sessions where student said "not really": ${notHelpedCount}
- Total feedback given: ${feedbacks.length}

MASTERY SCORES:
${masteryRows.map(m => `- ${m.topic}: ${m.score}/100`).join("\n") || "- No mastery data yet"}

TOPIC DISTRIBUTION:
${Object.entries(topicCounts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([topic, count]) => `- ${topic}: ${count} sessions`).join("\n") || "- No sessions yet"}

TIME PATTERNS:
- Peak study hour: ${peakHour ? `${peakHour[0]}:00 (${peakHour[1]} sessions)` : "n/a"}
- Day of week distribution: ${Object.entries(dayCounts).sort(([, a], [, b]) => b - a).map(([d, c]) => `${dayNames[parseInt(d)]}(${c})`).join(", ") || "n/a"}

DRAFT BEHAVIOR:
- Large text deletions (rewrites): ${drafts.length}
- Average characters deleted per rewrite: ${avgCharsDeleted}

RECENT SESSION SUMMARIES:
${(outcomeRes.data || []).slice(0, 5).map(o => `- ${o.summary?.slice(0, 150) || "no summary"}`).join("\n") || "- No session outcomes yet"}
`

    // ── Ask Claude to analyze ────────────────────────────────────────────
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{ role: "user", content: dataSummary }],
      system: `You are a learning psychologist analyzing a student's study behavior data. Your job is to identify how this student thinks, learns, and processes information.

Respond in EXACTLY this JSON format (no markdown, no code fences, just raw JSON):
{
  "thinking_style": "one of: analytical | intuitive | methodical | exploratory | mixed",
  "thinking_style_description": "2-3 sentences explaining their primary thinking approach based on the data",
  "learning_velocity": "one of: fast | moderate | slow | inconsistent",
  "learning_velocity_description": "2-3 sentences about how quickly they absorb and retain concepts",
  "struggle_pattern": "one of: gives_up_early | pushes_through | seeks_hints | avoids_difficulty | balanced",
  "struggle_pattern_description": "2-3 sentences about how they handle difficulty, based on struggle events",
  "focus_profile": "one of: deep_focus | moderate_focus | easily_distracted | variable",
  "focus_profile_description": "2-3 sentences about their attention patterns",
  "confidence_alignment": "one of: overconfident | underconfident | well_calibrated | insufficient_data",
  "confidence_alignment_description": "2-3 sentences about how their self-assessment compares to actual performance",
  "peak_performance": "description of when and how they study best (time, duration, conditions)",
  "response_style": "one of: quick_and_impulsive | thoughtful_and_measured | hesitant | variable",
  "response_style_description": "2-3 sentences about how they compose responses based on latency and draft data",
  "strengths": ["list of 3-4 specific learning strengths observed in the data"],
  "growth_areas": ["list of 3-4 specific areas where they could improve their study approach"],
  "recommendations": ["list of 3-5 actionable, specific study recommendations based on patterns"],
  "learner_archetype": "a creative 2-3 word archetype name that captures their overall learning personality",
  "archetype_description": "1-2 sentences explaining the archetype",
  "numeric_scores": {
    "focus_score": 0-100,
    "persistence_score": 0-100,
    "speed_score": 0-100,
    "calibration_score": 0-100,
    "consistency_score": 0-100
  }
}

Rules:
- Base every claim on the actual data. Do not invent patterns not supported by the numbers.
- If data is insufficient for a category, say so honestly rather than guessing.
- Be specific — reference actual numbers from the data.
- Be honest but constructive. Name weaknesses clearly but frame them as growth opportunities.
- The archetype should be memorable and feel personal, not generic.`
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""

    let analysis
    try {
      analysis = JSON.parse(text)
    } catch {
      // Try to extract JSON from the response if wrapped
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        return NextResponse.json({ error: "Failed to parse analysis" }, { status: 500 })
      }
    }

    // ── Cache the result in Supabase ─────────────────────────────────────
    await supabase.from("thinking_patterns").upsert({
      user_id: userId,
      analysis: JSON.stringify(analysis),
      traits: [
        analysis.thinking_style,
        analysis.learning_velocity,
        analysis.struggle_pattern,
        analysis.focus_profile,
        analysis.response_style,
      ],
      computed_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).then(() => {})

    return NextResponse.json({
      analysis,
      raw: {
        totalSessions: sessions.length,
        totalMessages: messageCountRes.count ?? 0,
        avgDuration,
        struggleCounts,
        avgLatency,
        tabAways: tabAways.length,
        distractions: distractions.length,
        mastery: masteryRows,
        topicCounts,
        hourCounts,
        dayCounts,
        feedbacks: { helped: helpedCount, notHelped: notHelpedCount, total: feedbacks.length },
        drafts: { count: drafts.length, avgCharsDeleted },
      }
    })

  } catch (err) {
    console.error("[patterns route]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
