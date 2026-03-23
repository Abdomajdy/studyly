import { supabase } from '@/lib/supabase'

export async function getMastery(userId: string) {
  const { data, error } = await supabase
    .from('topic_mastery')
    .select('*')
    .eq('user_id', userId)
    .order('score', { ascending: true })

  if (error) throw error
  return data
}

export async function updateMastery(
  userId: string,
  topic: string,
  course: string,
  score: number
) {
  const { error } = await supabase
    .from('topic_mastery')
    .upsert({ user_id: userId, topic, course, score, last_studied_at: new Date() })

  if (error) throw error
}

export async function getTopicMastery(userId: string, topic: string, course: string) {
  const { data, error } = await supabase
    .from("topic_mastery")
    .select("*")
    .eq("user_id", userId)
    .eq("topic", topic)
    .eq("course", course)
    .single()
  if (error && error.code !== "PGRST116") throw error
  return data
}

export async function applyMasteryDelta(
  userId: string,
  topic: string,
  course: string,
  delta: number
) {
  const existing = await getTopicMastery(userId, topic, course)
  const currentScore = existing?.score ?? 50
  const newScore = Math.min(100, Math.max(0, currentScore + delta))

  const { error } = await supabase
    .from("topic_mastery")
    .upsert({
      user_id: userId,
      topic,
      course,
      score: newScore,
      last_studied_at: new Date().toISOString()
    }, {
      onConflict: "user_id,course,topic"
    })
  if (error) throw error
  return newScore
}

export async function evaluateAndUpdateMastery(
  userId: string,
  topic: string,
  course: string,
  messages: { role: string; content: string }[]
) {
  try {
    const userMessages = messages.filter(m => m.role === "user")

    const strugglePatterns = [
      /i don't (know|get|understand)/i,
      /i'm confused/i,
      /what does .* mean/i,
      /can you (re)?explain/i,
      /i give up/i,
      /i'm lost/i,
      /that doesn't make sense/i
    ]

    const confidencePatterns = [
      /i (see|get it|understand)/i,
      /that makes sense/i,
      /oh (ok|okay|i see|right|that's)/i,
      /got it/i,
      /so basically/i,
      /that clicked/i
    ]

    let struggleCount = 0
    let confidenceCount = 0

    userMessages.forEach(m => {
      strugglePatterns.forEach(p => { if (p.test(m.content)) struggleCount++ })
      confidencePatterns.forEach(p => { if (p.test(m.content)) confidenceCount++ })
    })

    const rawDelta = 3 + (confidenceCount * 2) - (struggleCount * 3)
    const delta = Math.min(10, Math.max(-10, rawDelta))

    if (struggleCount > 0) {
      console.log(`[mastery] ${struggleCount} struggle signals detected for ${topic}`)
    }

    const newScore = await applyMasteryDelta(userId, topic, course, delta)
    console.log(`[mastery] ${topic}: delta ${delta > 0 ? "+" : ""}${delta} → score ${newScore}`)
    return { delta, newScore, struggleCount, confidenceCount }
  } catch (err) {
    console.error("[evaluateAndUpdateMastery]", err)
    return null
  }
}
