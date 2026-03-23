import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    // Get all users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")

    if (!profiles) return NextResponse.json({ sent: 0 })

    let sent = 0
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    for (const profile of profiles) {
      // Get user email
      const { data: { user } } = await supabase.auth.admin.getUserById(profile.id)
      if (!user?.email) continue

      // Get sessions this week
      const { data: sessions } = await supabase
        .from("study_sessions")
        .select("topic, started_at")
        .eq("user_id", profile.id)
        .gte("started_at", oneWeekAgo)

      // Get weakest topic
      const { data: mastery } = await supabase
        .from("topic_mastery")
        .select("topic, score")
        .eq("user_id", profile.id)
        .order("score", { ascending: true })
        .limit(1)

      const sessionCount = sessions?.length ?? 0
      const topicsCovered = [...new Set(sessions?.map(s => s.topic) ?? [])]
      const weakestTopic = mastery?.[0]?.topic ?? null

      // Only send if they had activity this week
      if (sessionCount === 0) continue

      const emailHtml = `
        <div style="background:#0a0a0b;color:#f0ede8;font-family:monospace;padding:48px;max-width:560px;margin:0 auto;">
          <p style="color:#c8a96e;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px;">STUDYLY WEEKLY</p>
          <h1 style="font-size:28px;margin-bottom:32px;font-weight:400;">Here's what you did this week, ${profile.username}.</h1>

          <div style="border-left:2px solid #c8a96e;padding-left:20px;margin-bottom:32px;">
            <p style="color:#8a8a8a;font-size:13px;margin-bottom:8px;">SESSIONS THIS WEEK</p>
            <p style="font-size:40px;margin:0;">${sessionCount}</p>
          </div>

          ${topicsCovered.length > 0 ? `
          <div style="margin-bottom:32px;">
            <p style="color:#8a8a8a;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">TOPICS COVERED</p>
            ${topicsCovered.map(t => `<p style="color:#f0ede8;font-size:13px;margin:4px 0;">· ${t}</p>`).join("")}
          </div>
          ` : ""}

          ${weakestTopic ? `
          <div style="background:#111113;border:1px solid #2a2a2e;padding:20px;margin-bottom:32px;">
            <p style="color:#8a8a8a;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">WEAKEST TOPIC RIGHT NOW</p>
            <p style="color:#f0ede8;font-size:16px;margin:0;">${weakestTopic}</p>
            <p style="color:#c8a96e;font-size:11px;margin-top:8px;">this is what to lock in on next week.</p>
          </div>
          ` : ""}

          <a href="https://studyly.app/session" style="display:inline-block;background:#f0ede8;color:#0a0a0b;padding:16px 32px;text-decoration:none;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:500;">
            LOCK IN →
          </a>

          <p style="color:#4a4a4a;font-size:11px;margin-top:48px;">
            studyly · <a href="https://studyly.app/settings" style="color:#4a4a4a;">unsubscribe</a>
          </p>
        </div>
      `

      await resend.emails.send({
        from: "Studyly <hello@studyly.app>",
        to: user.email,
        subject: `${sessionCount} session${sessionCount !== 1 ? "s" : ""} this week — here's what moved`,
        html: emailHtml
      })

      // Log the digest
      await supabase.from("digest_logs").insert({
        user_id: profile.id,
        topics_covered: topicsCovered,
        weakest_topic: weakestTopic,
        sessions_this_week: sessionCount
      })

      sent++
    }

    return NextResponse.json({ sent })
  } catch (err) {
    console.error("[digest]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
