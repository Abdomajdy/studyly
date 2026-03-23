import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { topic, messages } = await req.json()
    const transcript = messages
      .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n")
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: `You are an expert educational assessor. You evaluate student understanding from study session transcripts. You are precise, honest, and never generous with scores.`,
      messages: [{
        role: "user",
        content: `Evaluate this student's understanding of "${topic}" based on this session transcript.\n\nTRANSCRIPT:\n${transcript}\n\nReturn ONLY a JSON object with this exact structure — no other text:\n{\n  "mastery_delta": <integer between -15 and +15>,\n  "understanding_level": <"none" | "surface" | "partial" | "solid" | "deep">,\n  "can_apply": <boolean>,\n  "can_explain": <boolean>,\n  "specific_gaps": [<string array>],\n  "specific_strengths": [<string array>],\n  "confidence_accuracy": <"overconfident" | "calibrated" | "underconfident">,\n  "recommended_next_topics": [<string array of 2-3 topics>],\n  "session_quality": <"wasted" | "minimal" | "productive" | "excellent">,\n  "honest_summary": <one sentence brutally honest assessment>\n}`
      }]
    })
    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const evaluation = JSON.parse(text.replace(/```json|```/g, "").trim())
    return NextResponse.json(evaluation)
  } catch (err) {
    console.error("Evaluate route error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
