import { supabase } from "@/lib/supabase"

// ── Types ────────────────────────────────────────────────────────────────────
export type StruggleSummary = {
  type: string
  count: number
  percentage: number
}

export type ResponseProfile = {
  avgLatencyMs: number
  fastResponses: number    // < 10s
  slowResponses: number    // > 45s
  totalResponses: number
}

export type AttentionProfile = {
  avgFocusDurationMs: number
  tabAwayCount: number
  distractionCount: number
}

export type ConfidenceCalibration = {
  avgBefore: number | null
  avgAfter: number | null
  avgDelta: number | null
  sessionsWithFeedback: number
}

export type TopicPattern = {
  topic: string
  sessionCount: number
  avgDurationMin: number
  masteryScore: number
  struggleCount: number
}

export type SessionTimePattern = {
  hour: number
  count: number
}

export type DraftBehavior = {
  totalDeletions: number
  avgCharsDeleted: number
}

export type RawPatternData = {
  struggles: StruggleSummary[]
  responseProfile: ResponseProfile
  attentionProfile: AttentionProfile
  confidenceCalibration: ConfidenceCalibration
  topicPatterns: TopicPattern[]
  sessionTimePatterns: SessionTimePattern[]
  draftBehavior: DraftBehavior
  totalSessions: number
  totalMessages: number
  avgSessionDurationMin: number
}

// ── Fetch all raw pattern data for a user ────────────────────────────────────
export async function fetchPatternData(userId: string): Promise<RawPatternData> {
  // Run all queries in parallel
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
  ] = await Promise.all([
    supabase
      .from("struggle_events")
      .select("struggle_type")
      .eq("user_id", userId),
    supabase
      .from("response_latency_events")
      .select("latency_ms")
      .eq("user_id", userId),
    supabase
      .from("attention_events")
      .select("event_type, duration_ms")
      .eq("user_id", userId),
    supabase
      .from("session_feedback")
      .select("confidence_before, confidence_after, helped")
      .eq("user_id", userId),
    supabase
      .from("study_sessions")
      .select("id, topic, started_at, ended_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false }),
    supabase
      .from("topic_mastery")
      .select("topic, score")
      .eq("user_id", userId),
    supabase
      .from("session_metadata")
      .select("hour_of_day")
      .eq("user_id", userId),
    supabase
      .from("draft_events")
      .select("chars_deleted")
      .eq("user_id", userId),
    supabase
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ])

  // ── Struggle summary ──────────────────────────────────────────────────
  const struggles: StruggleSummary[] = []
  if (struggleRes.data && struggleRes.data.length > 0) {
    const counts: Record<string, number> = {}
    struggleRes.data.forEach(s => { counts[s.struggle_type] = (counts[s.struggle_type] || 0) + 1 })
    const total = struggleRes.data.length
    for (const [type, count] of Object.entries(counts)) {
      struggles.push({ type, count, percentage: Math.round((count / total) * 100) })
    }
    struggles.sort((a, b) => b.count - a.count)
  }

  // ── Response profile ──────────────────────────────────────────────────
  const latencies = latencyRes.data?.map(r => r.latency_ms) || []
  const responseProfile: ResponseProfile = {
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length) : 0,
    fastResponses: latencies.filter(l => l < 10000).length,
    slowResponses: latencies.filter(l => l > 45000).length,
    totalResponses: latencies.length,
  }

  // ── Attention profile ─────────────────────────────────────────────────
  const attentionEvents = attentionRes.data || []
  const tabAways = attentionEvents.filter(e => e.event_type === "tab_away")
  const distractions = attentionEvents.filter(e => e.event_type === "distraction")
  const attentionProfile: AttentionProfile = {
    avgFocusDurationMs: tabAways.length > 0
      ? Math.round(tabAways.reduce((s, e) => s + (e.duration_ms || 0), 0) / tabAways.length)
      : 0,
    tabAwayCount: tabAways.length,
    distractionCount: distractions.length,
  }

  // ── Confidence calibration ────────────────────────────────────────────
  const feedbacks = feedbackRes.data || []
  const withBefore = feedbacks.filter(f => f.confidence_before != null)
  const withAfter = feedbacks.filter(f => f.confidence_after != null)
  const confidenceCalibration: ConfidenceCalibration = {
    avgBefore: withBefore.length > 0 ? Math.round((withBefore.reduce((s, f) => s + f.confidence_before, 0) / withBefore.length) * 10) / 10 : null,
    avgAfter: withAfter.length > 0 ? Math.round((withAfter.reduce((s, f) => s + f.confidence_after, 0) / withAfter.length) * 10) / 10 : null,
    avgDelta: (withBefore.length > 0 && withAfter.length > 0)
      ? Math.round(((withAfter.reduce((s, f) => s + f.confidence_after, 0) / withAfter.length) - (withBefore.reduce((s, f) => s + f.confidence_before, 0) / withBefore.length)) * 10) / 10
      : null,
    sessionsWithFeedback: feedbacks.length,
  }

  // ── Topic patterns ────────────────────────────────────────────────────
  const sessions = sessionsRes.data || []
  const masteryMap: Record<string, number> = {}
  ;(masteryRes.data || []).forEach(m => { masteryMap[m.topic] = m.score })

  const struggleByTopic: Record<string, number> = {}
  ;(struggleRes.data || []).forEach(() => {
    // struggle_events don't have topic in our select, we'll count total per topic from sessions
  })

  const topicGroups: Record<string, typeof sessions> = {}
  sessions.forEach(s => {
    if (!topicGroups[s.topic]) topicGroups[s.topic] = []
    topicGroups[s.topic].push(s)
  })

  const topicPatterns: TopicPattern[] = Object.entries(topicGroups).map(([topic, topicSessions]) => {
    const durations = topicSessions
      .filter(s => s.ended_at)
      .map(s => Math.round((new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000))
    return {
      topic,
      sessionCount: topicSessions.length,
      avgDurationMin: durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0,
      masteryScore: masteryMap[topic] ?? 50,
      struggleCount: struggleByTopic[topic] ?? 0,
    }
  }).sort((a, b) => b.sessionCount - a.sessionCount)

  // ── Session time patterns ─────────────────────────────────────────────
  const hourCounts: Record<number, number> = {}
  ;(metadataRes.data || []).forEach(m => {
    hourCounts[m.hour_of_day] = (hourCounts[m.hour_of_day] || 0) + 1
  })
  const sessionTimePatterns: SessionTimePattern[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourCounts[h] || 0,
  }))

  // ── Draft behavior ────────────────────────────────────────────────────
  const drafts = draftRes.data || []
  const draftBehavior: DraftBehavior = {
    totalDeletions: drafts.length,
    avgCharsDeleted: drafts.length > 0
      ? Math.round(drafts.reduce((s, d) => s + (d.chars_deleted || 0), 0) / drafts.length)
      : 0,
  }

  // ── Session duration average ──────────────────────────────────────────
  const completedSessions = sessions.filter(s => s.ended_at)
  const durations = completedSessions.map(s =>
    Math.round((new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000)
  )
  const avgSessionDurationMin = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0

  return {
    struggles,
    responseProfile,
    attentionProfile,
    confidenceCalibration,
    topicPatterns,
    sessionTimePatterns,
    draftBehavior,
    totalSessions: sessions.length,
    totalMessages: messageCountRes.count ?? 0,
    avgSessionDurationMin,
  }
}

// ── Store computed pattern analysis ──────────────────────────────────────────
export async function savePatternAnalysis(
  userId: string,
  analysis: string,
  traits: string[]
): Promise<void> {
  try {
    const { error } = await supabase
      .from("thinking_patterns")
      .upsert({
        user_id: userId,
        analysis,
        traits,
        computed_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
    if (error) console.error("[savePatternAnalysis]", error)
  } catch (err) {
    console.error("[savePatternAnalysis] unexpected:", err)
  }
}

// ── Load cached pattern analysis ─────────────────────────────────────────────
export async function loadPatternAnalysis(userId: string): Promise<{
  analysis: string
  traits: string[]
  computed_at: string
} | null> {
  try {
    const { data, error } = await supabase
      .from("thinking_patterns")
      .select("analysis, traits, computed_at")
      .eq("user_id", userId)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}
