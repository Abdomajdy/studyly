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
      .update({ ended_at: new Date().toISOString(), duration_minutes: 0 })
      .eq('id', sessionId)
    if (error) { console.error('[endSession]', error) }
  } catch (err) {
    console.error('[endSession] unexpected:', err)
  }
}
