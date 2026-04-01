import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authenticatedUserId = await getAuthenticatedUser(req)
  if (!authenticatedUserId) return unauthorizedResponse()

  try {
    const { userId, course, examDate, outcome } = await req.json()

    if (userId !== authenticatedUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 })
    }

    // Get sessions before exam
    const { count: sessionCount } = await supabase
      .from("study_sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .lt("started_at", examDate)
      .gte("started_at", new Date(new Date(examDate).getTime() - 30 * 86400000).toISOString())

    // Get avg mastery before exam
    const { data: masteryData } = await supabase
      .from("topic_mastery")
      .select("score")
      .eq("user_id", userId)

    const avgMastery = masteryData?.length
      ? Math.round(masteryData.reduce((s, m) => s + m.score, 0) / masteryData.length)
      : null

    await supabase.from("exam_outcomes").upsert({
      user_id: userId,
      course,
      exam_date: examDate,
      outcome,
      sessions_before_exam: sessionCount ?? 0,
      avg_mastery_before_exam: avgMastery,
      responded_at: new Date().toISOString()
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
