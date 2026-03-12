import { supabase } from '@/lib/supabase'

export async function saveOnboarding(
  userId: string,
  username: string,
  course?: { name: string; code?: string; examDate?: string }
): Promise<void> {
  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', userId)
    if (profileError) {
      console.error('[saveOnboarding] profiles update:', profileError)
      return
    }

    if (course?.name) {
      const { error: courseError } = await supabase.from('user_courses').insert({
        user_id: userId,
        course_name: course.name,
        course_code: course.code ?? null,
        exam_date: course.examDate ?? null
      })
      if (courseError) {
        console.error('[saveOnboarding] user_courses insert:', courseError)
      }
    }
  } catch (err) {
    console.error('[saveOnboarding] unexpected:', err)
  }
}
