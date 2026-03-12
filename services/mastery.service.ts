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