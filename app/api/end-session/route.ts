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
    const { userId, sessionId, topic, course, messages, masteryContext, elapsed } = await req.json()

    if (!userId || !topic || !messages?.length) {
      return NextResponse.json({ error: "missing required fields" }, { status: 400 })
    }

    if (userId !== authenticatedUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 })
    }

    const supabase = getSupabase()

    // 1. Get AI evaluation
    const transcript = messages
      .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n")

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: `You are an expert educational assessor. You evaluate student understanding from study session transcripts. You are precise, honest, and never generous with scores.`,
      messages: [{
        role: "user",
        content: `Evaluate this student's understanding of "${topic}" based on this session transcript.\n\nTRANSCRIPT:\n${transcript}\n\nReturn ONLY a JSON object with this exact structure — no other text:\n{\n  "mastery_delta": <integer between -15 and +15>,\n  "understanding_level": <"none" | "surface" | "partial" | "solid" | "deep">,\n  "can_apply": <boolean>,\n  "can_explain": <boolean>,\n  "specific_gaps": [<string array>],\n  "specific_strengths": [<string array>],\n  "confidence_accuracy": <"overconfident" | "calibrated" | "underconfident">,\n  "recommended_next_topics": [<string array of 2-3 topics>],\n  "session_quality": <"wasted" | "minimal" | "productive" | "excellent">,\n  "honest_summary": <one sentence brutally honest assessment>\n}`
      }]
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const evaluation = JSON.parse(text.replace(/```json|```/g, "").trim())

    // 2. Apply mastery delta (upsert topic_mastery)
    const courseName = course || "General"
    const { data: existing } = await supabase
      .from("topic_mastery")
      .select("score")
      .eq("user_id", userId)
      .eq("topic", topic)
      .eq("course", courseName)
      .single()

    const currentScore = existing?.score ?? 50
    const newScore = Math.min(100, Math.max(0, currentScore + (evaluation.mastery_delta ?? 0)))

    await supabase.from("topic_mastery").upsert({
      user_id: userId,
      topic,
      course: courseName,
      score: newScore,
      last_studied_at: new Date().toISOString()
    }, { onConflict: "user_id,course,topic" })

    // 3. Store evaluation
    await supabase.from("mastery_evaluations").insert({
      user_id: userId,
      session_id: sessionId,
      topic,
      mastery_delta: evaluation.mastery_delta,
      understanding_level: evaluation.understanding_level,
      can_apply: evaluation.can_apply,
      can_explain: evaluation.can_explain,
      specific_gaps: evaluation.specific_gaps,
      specific_strengths: evaluation.specific_strengths,
      confidence_accuracy: evaluation.confidence_accuracy,
      recommended_next_topics: evaluation.recommended_next_topics,
      session_quality: evaluation.session_quality,
      honest_summary: evaluation.honest_summary
    })

    // 4. End session
    const durationMinutes = Math.floor((elapsed ?? 0) / 60)
    if (sessionId) {
      await supabase.from("study_sessions").update({
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes
      }).eq("id", sessionId)
    }

    // 5. Save recap
    const scoreBeforeMatch = (masteryContext || "").match(
      new RegExp(`${topic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\((\\d+)\\)`)
    )
    const scoreBefore = scoreBeforeMatch ? parseInt(scoreBeforeMatch[1]) : currentScore

    if (sessionId) {
      await supabase.from("session_recaps").insert({
        session_id: sessionId,
        user_id: userId,
        topic,
        duration_minutes: durationMinutes,
        score_before: scoreBefore,
        score_after: newScore,
        score_delta: evaluation.mastery_delta ?? 0,
        session_quality: evaluation.session_quality ?? "productive",
        honest_summary: evaluation.honest_summary ?? ""
      })
    }

    // 6. AI-powered note extraction — expert note-taker pass
    let sessionNotes: { type: string; title: string; body: string }[] = []
    try {
      const notesResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1500,
        system: `You are an expert note-taker reviewing a study session transcript. Extract ONLY the most valuable notes — things a student would want to review before an exam. Be extremely selective. Quality over quantity.`,
        messages: [{
          role: "user",
          content: `Review this study session on "${topic}" and extract notes.\n\nTRANSCRIPT:\n${transcript}\n\nExtract notes in these categories ONLY when genuinely present:\n- "struggle": Where the student got confused or made a mistake. Include what they got wrong AND the correct answer/explanation.\n- "key_concept": A core definition or concept the AI explained that the student needs to know.\n- "formula": An important equation or formula discussed.\n- "insight": A non-obvious insight or trick that would help on an exam.\n\nRules:\n- Maximum 6 notes total. Fewer is better.\n- Skip anything trivial or obvious.\n- Each note must be specific and self-contained (readable without the transcript).\n- "struggle" notes MUST include both the mistake and the correction.\n\nReturn ONLY a JSON array — no other text:\n[\n  { "type": "struggle", "title": "<short label>", "body": "<what went wrong + correct answer>" },\n  { "type": "key_concept", "title": "<term>", "body": "<clear definition>" },\n  ...\n]`
        }]
      })
      const notesText = notesResponse.content[0].type === "text" ? notesResponse.content[0].text : "[]"
      sessionNotes = JSON.parse(notesText.replace(/```json|```/g, "").trim())
    } catch (notesErr) {
      console.error("[end-session] notes extraction failed:", notesErr)
    }

    // 7. Save notes to database
    if (sessionNotes.length > 0 && sessionId) {
      const noteRows = sessionNotes.map(n => ({
        session_id: sessionId,
        user_id: userId,
        topic,
        course: courseName,
        type: n.type,
        title: n.title,
        body: n.body,
      }))
      const { error: notesInsertErr } = await supabase.from("session_notes").insert(noteRows)
      if (notesInsertErr) console.error("[end-session] notes insert failed:", notesInsertErr)
    }

    return NextResponse.json({
      ...evaluation,
      newScore,
      scoreBefore,
      durationMinutes,
      sessionNotes
    })
  } catch (err) {
    console.error("[end-session] error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
