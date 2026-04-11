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
  const userId = await getAuthenticatedUser(req)
  if (!userId) return unauthorizedResponse()

  try {
    const { text, courseName, courseId } = await req.json()

    if (!text || !courseName || !courseId) {
      return NextResponse.json({ error: "missing required fields" }, { status: 400 })
    }

    // Ask Claude to extract topics and exam dates from syllabus text
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `Extract the course topics/chapters and any exam/assignment dates from this course syllabus or outline.

SYLLABUS TEXT:
${text.slice(0, 8000)}

Return ONLY valid JSON — no markdown, no code fences:
{
  "topics": ["topic 1", "topic 2", ...],
  "events": [
    {"title": "Midterm Exam", "date": "YYYY-MM-DD", "type": "exam"},
    {"title": "Assignment 1 Due", "date": "YYYY-MM-DD", "type": "assignment"}
  ]
}

Rules:
- Topics should be specific study topics, not administrative items (not "office hours" or "grading policy")
- Keep topic names concise but descriptive (e.g. "Kirchhoff's Laws" not "Week 3: Introduction to Kirchhoff's Laws and Applications")
- For dates, only include ones with specific dates. If a date says "Week 5" with no calendar date, skip it.
- Type must be one of: exam, assignment, paper, other
- If no dates are found, return empty events array
- Order topics by the sequence they appear in the syllabus`
      }]
    })

    const aiText = response.content[0].type === "text" ? response.content[0].text : ""
    let parsed: { topics: string[]; events: { title: string; date: string; type: string }[] }

    try {
      parsed = JSON.parse(aiText.replace(/```json|```/g, "").trim())
    } catch {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        return NextResponse.json({ error: "Failed to parse syllabus" }, { status: 500 })
      }
    }

    const supabase = getSupabase()

    // Insert topics as topic_mastery rows at score 0
    if (parsed.topics?.length > 0) {
      const masteryRows = parsed.topics.map(topic => ({
        user_id: userId,
        topic,
        course: courseName,
        score: 0,
        last_studied_at: null,
      }))

      // Upsert to avoid duplicates
      await supabase.from("topic_mastery").upsert(masteryRows, {
        onConflict: "user_id,course,topic",
        ignoreDuplicates: true,
      })
    }

    // Insert exam/assignment dates as calendar events
    if (parsed.events?.length > 0) {
      const calendarRows = parsed.events
        .filter(e => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
        .map(e => ({
          user_id: userId,
          title: e.title,
          date: e.date,
          type: e.type || "exam",
        }))

      if (calendarRows.length > 0) {
        await supabase.from("calendar_events").insert(calendarRows)
      }
    }

    // Also update the course exam_date if we found a final exam
    const finalExam = parsed.events?.find(e =>
      e.type === "exam" && /final/i.test(e.title) && e.date
    )
    if (finalExam) {
      await supabase.from("user_courses").update({ exam_date: finalExam.date }).eq("id", courseId).eq("user_id", userId)
    }

    return NextResponse.json({
      topics: parsed.topics || [],
      events: parsed.events || [],
      topicsInserted: parsed.topics?.length || 0,
      eventsInserted: parsed.events?.filter(e => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).length || 0,
    })
  } catch (err) {
    console.error("[parse-syllabus]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
