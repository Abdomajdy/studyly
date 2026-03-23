import { supabase } from '@/lib/supabase'

export async function createSession(userId: string, topicName: string): Promise<string | null> {
  try {
    console.log('[createSession] attempting insert:', { userId, topicName })
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({ user_id: userId, topic: topicName })
      .select()
      .single()
    if (error) {
      console.log('[createSession] error detail:', JSON.stringify(error))
      console.error('[createSession]', error)
      return null
    }
    return data.id
  } catch (err) {
    console.error('[createSession] unexpected:', err)
    return null
  }
}

export async function endSession(sessionId: string, summary: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('study_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) { console.error('[endSession]', error) }
  } catch (err) {
    console.error('[endSession] unexpected:', err)
  }
}

export async function logMessage(
  sessionId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('message_logs')
      .insert({ session_id: sessionId, user_id: userId, role, content })
    if (error) console.error('[logMessage]', error)
  } catch (err) {
    console.error('[logMessage] unexpected:', err)
  }
}

export async function loadSessionMessages(sessionId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const { data, error } = await supabase
      .from("message_logs")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
    if (error) { console.error("[loadSessionMessages]", error); return [] }
    return (data ?? []) as { role: "user" | "assistant"; content: string }[]
  } catch (err) {
    console.error("[loadSessionMessages] unexpected:", err)
    return []
  }
}
