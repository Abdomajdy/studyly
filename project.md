# Studyly — Master Context Document
*Last updated: March 2026 — End of Session 6*

> **RULE — ENFORCED FROM SESSION 4 ONWARDS:**
> Every update to this doc must include the full, complete, paste-ready code for every file that was touched or created. No summaries. No "same as before". If a file exists in the project, its full contents live here. This doc is the single source of truth. A new session should be able to start from this doc alone.

---

## The Product

**What it is:** An AI-powered study companion for engineering students. Not a tool, not a platform — a companion. The core metaphor is the brilliant friend who sat next to you, knew the material, and always knew exactly what to say.

**The core feature:** Lock In. Student opens the app, sees what to study today based on their mastery gaps, hits one button, and the AI guides the session. At the end: an honest summary of what moved and what didn't.

**The tagline:** "You got this. Lock in. Here's what you need to do."

**The three pains being solved:**
1. Bad sources — hours wasted on resources that explain nothing
2. Time blindness — no ability to estimate how long anything takes
3. Anxiety — "am I studying the right thing?" running on repeat

**The emotional core:** Reducing anxiety is not a feature. It is the foundation everything is built on.

**The user:** Engineering students, first and second year primarily. Actively struggling. Price-sensitive but not price-immune.

---

## Product Ideology — Core Beliefs

1. The problem is emotional as much as academic
2. Students deserve honesty, not encouragement
3. Decisions are the enemy
4. Technology should serve the student, not the other way around
5. Credibility is earned through results, not features

---

## What Is Intentionally NOT Built (v1)
- Streak mechanics / daily guilt
- Leaderboards / social comparison
- Content library / video courses
- Long onboarding
- Mobile app (desktop first, mobile v2)

---

## Architecture

**Frontend:** Next.js 14 App Router + TypeScript + Tailwind CSS
**Backend:** Supabase (PostgreSQL + Auth) + Claude API (claude-sonnet-4-6)
**Pattern:** Service layer abstraction — components never call Supabase directly

> ⚠️ Model: `claude-sonnet-4-6`

**Key rule:** All backend calls go through `services/`. This allows backend to be swapped from Supabase to Node.js API later without changing any frontend code.

**3-phase build:**
- Phase 1 (now): Supabase + Claude API + Service Layer + MVP
- Phase 2 (6-12mo): Node.js API + YouTube/PDF APIs + Chrome Extension
- Phase 3 (12-24mo): ML pipeline + Mobile app + University partnerships

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS variables design system |
| Database + Auth | Supabase |
| AI | Claude API (claude-sonnet-4-6) via Next.js API route |
| Deployment | Vercel |
| Editor | Cursor + Claude Code |

---

## Rendering Stack ✅ LIVE

| Package | Purpose | Status |
|---|---|---|
| react-markdown | Parses Claude markdown into proper HTML | ✅ Installed + wired |
| remark-gfm | Tables, strikethrough, task lists | ✅ Installed + wired |
| rehype-highlight | Code block syntax highlighting | ✅ Installed + wired |
| highlight.js | Required by rehype-highlight | ✅ Installed |
| remark-math | Parses $...$ and $$...$$ math syntax | ✅ Installed + wired |
| rehype-katex | Renders math as typeset equations | ✅ Installed + wired |
| katex | Required by rehype-katex | ✅ Installed |
| mermaid | Diagram rendering | ✅ Installed, wiring pending ⚠️ |

**Sprint 2 additions (not yet installed):**
- `streamdown` + plugins — replaces react-markdown once streaming is added
- `ai` (Vercel AI SDK) — handles streaming connection

---

## Brand & Logo

**Name:** studily (NOT studyly — name changed this session)
**Logo format:** `stud` + `i` in `var(--accent)` (#c8a96e) + `ly`
**Font:** DM Mono, monospace
**Applied to:** sidebar, landing page nav, onboarding, session header

> ⚠️ Double-check every page has the correct logo spelling and the accent i. Easy to miss on pages not touched this session.

---

## Design System

**Aesthetic:** Refined dark. Premium notebook feel. Calm, focused, serious. Not techy, not corporate.

**Typography:**
- `DM Serif Display` — headings, AI responses (warm, editorial, literary)
- `DM Mono` — UI text, inputs, labels (precise, clean)

**Color palette:**
```css
--bg: #0a0a0b
--bg-2: #111113
--bg-3: #1a1a1e
--border: #2a2a2e
--text: #f0ede8
--text-2: #8a8a8a
--text-3: #4a4a4a
--accent: #c8a96e
--accent-dim: #8a7248
--danger: #e05a5a
--success: #5a9e6f
```

**Motion:** Slow fade-ins on load (0.6s ease). Text arrives gently. Nothing bouncy.

---

## Project Structure

```
studily/
├── app/
│   ├── api/ai/route.ts            ← Claude API. v2 system prompt live ✅
│   ├── dashboard/page.tsx         ← Sidebar layout live ✅
│   ├── session/page.tsx           ← react-markdown wired, full width ✅
│   ├── onboarding/page.tsx        ← ✅ Built session 5
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx      ← redirects to /onboarding ✅
│   ├── globals.css                ← cursor: none on pointer:fine devices ✅
│   ├── layout.tsx                 ← CustomCursor mounted here globally ✅
│   └── page.tsx                   ← Landing page — major overhaul session 6 ✅
├── components/
│   └── CustomCursor.tsx           ← ✅ Built session 6 — global custom cursor
├── lib/
│   └── supabase.ts
├── services/
│   ├── mastery.service.ts         ← ⚠️ delta pattern fix applied but duplicates still showing
│   ├── session.service.ts         ← ✅ WORKING
│   └── onboarding.service.ts      ← ✅ Built session 5
├── CLAUDE.md
├── middleware.ts
└── .env.local
```

---

## .env.local — Required Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://rmbjflipducgwydgzvrt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3...
ANTHROPIC_API_KEY=sk-ant-...
```

⚠️ Use legacy anon key (`eyJhbG...`) — never `sb_publishable_...`
After any `.env.local` change: `ctrl+c` → `npm run dev`

---

## Database Schema (Live in Supabase)

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  university text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  UNIQUE (name, code)
);

CREATE TABLE IF NOT EXISTS public.user_courses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  course_name text,
  course_code text,
  exam_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (course_id IS NOT NULL OR (course_name IS NOT NULL AND course_name <> ''))
);

CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic text NOT NULL,
  course_id uuid REFERENCES public.courses(id),
  course text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
    ELSE NULL END
  ) STORED
);

-- ⚠️ duration_minutes is GENERATED — never insert or update it directly

CREATE TABLE IF NOT EXISTS public.topic_mastery (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id),
  course text NOT NULL,
  topic text NOT NULL,
  score integer NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  last_studied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course, topic)
);

CREATE TABLE IF NOT EXISTS public.struggle_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  topic text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Profile auto-creation trigger ✅ LIVE
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, SPLIT_PART(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Auth accounts
- `abdomajdy67@gmail.com` — primary ✅
- `abdomajdy76@gmail.com` — test, ignore

---

## What Has Been Built

### ✅ Completed (Sessions 1–5)
1. Next.js 14 project — TypeScript, Tailwind, App Router
2. Supabase connected — all tables live, RLS enabled
3. Auth — login, register, route protection via middleware
4. Profile auto-creation via DB trigger
5. Service layer — session.service.ts working
6. Claude API route — server-side, history-aware, v2 system prompt
7. Dashboard — sidebar layout, mastery display, Lock In button, sign out
8. Session page — full AI conversation, react-markdown wired, full width layout
9. Session saves to DB — createSession() + endSession() wired
10. Design system — DM Serif + DM Mono, dark palette, CSS variables
11. All pages styled — landing, dashboard, session, login, register, onboarding
12. CLAUDE.md in project root
13. Rendering stack — react-markdown, KaTeX, syntax highlighting ✅
14. System prompt v2 — gen Z voice, output types, 5 few-shot examples ✅
15. ASCII diagram rule enforced in prompt ✅
16. Dashboard sidebar — courses, recent sessions, stats, sign out ✅
17. Onboarding flow — username + first course + exam date ✅
18. Brand rename — studily, accent i in logo ✅
19. Session chat full width (maxWidth 1100px, centered) ✅
20. Session message font enlarged (19px, 2.0 line height) ✅
21. Custom markdown components — tables, lists, code, blockquotes all styled ✅

### ✅ Completed Session 6 — Landing Page Overhaul
22. Custom cursor — global, persists across all pages, lives in `components/CustomCursor.tsx` + mounted in `layout.tsx` ✅
23. Cursor: direct tracking (no lerp), 22px circle, accent border 1.5px, center dot 4px, hover expands to 44px, click scale pulse ✅
24. Full-page particle constellation canvas — fixed background, 110 particles, connection lines, mouse repel, edge wrap ✅
25. Landing page hero — new headline ("It's 11pm. Exam tomorrow."), ambient stat line, CTA pulse on load ✅
26. Session preview — "watch" / "try it" toggle, live /api/ai call, 2-response limit then signup overlay ✅
27. Compounding section — 4th testimonial card ("the night before finals · i wasn't panicking. that was new.") ✅
28. Mastery rows — hover tooltip showing point delta, breathing bar animation after fill ✅
29. Scroll progress bar — 2px accent line fixed at top of viewport ✅
30. Left margin scroll rail — thin line, glowing fill on scroll, section dots with labels, click to scroll ✅
31. Right margin ambient stats — live counters, vertical text, fades in after 2s ✅
32. Logo fixed everywhere — `stud` + accent `i` + `ly` in nav and footer ✅
33. globals.css — `*, *::before, *::after { cursor: none !important }` on `pointer: fine` devices ✅
34. Ambient sound toggle — Web Audio API, 40hz drone, bottom-left fixed, off by default ✅

### ⏳ Next Session — Start Here (Priority Order)
1. **Fix mastery duplicate rows** — KVL showing twice with score 3, investigate upsert conflict key
2. **Session history page** — `/sessions` route, list all past sessions, click to view
3. **Exam countdown on main dashboard** — prominent display when exam < 7 days
4. **Session summary page** — after end session, show what moved / what's shaky before redirecting
5. **Notes upload** — paste box in session start screen
6. **Topic suggestions** — Lock In suggests weakest topics from mastery data
7. **Streaming (Sprint 2)** — Vercel AI SDK + streamdown

---

## Flags — Active Issues

### 🔴 FLAG: Mastery duplicate rows + wrong scores
**Symptom:** KVL showing twice with score 3 in dashboard. Confirmed in screenshot.
**Cause:** upsert conflict key is `user_id,course,topic` but `course` field is being set to empty string `''`. If two rows exist with same topic but different course values, upsert creates a new row instead of updating.
**Fix next session:** In `updateMastery`, query the existing row first to get its course value, then upsert with the correct course. Or clean up duplicate rows directly in Supabase SQL editor:
```sql
DELETE FROM topic_mastery a USING topic_mastery b
WHERE a.id > b.id AND a.user_id = b.user_id AND a.topic = b.topic;
```

### ✅ RESOLVED: Logo spelling on non-dashboard pages
Fixed this session. All instances now render `stud` + accent `i` + `ly`.

### ⚠️ FLAG: CustomCursor — paste full final file contents next session
The cursor was iterated several times this session (lerp removed, size increased, center dot added). Make sure `components/CustomCursor.tsx` final version is pasted into this doc next session.

### ⚠️ FLAG: app/page.tsx — paste full final file contents next session
Major overhaul this session. The full file contents section below reflects the version at session 5 start. Needs to be updated with session 6 final version.

### ⚠️ FLAG: PowerShell buffer limit
**Problem:** Commands longer than ~150 lines crash PowerShell with `ArgumentOutOfRangeException: top value was -170`.
**Fix:** Always write long files by opening directly in Cursor (Ctrl+A, paste). PowerShell fine for short commands only.
**Files affected:** `app/api/ai/route.ts`, `app/page.tsx` (both too long for PowerShell)

### ⚠️ FLAG: System prompt needs ongoing calibration
**Status:** v2 live and tested. Better but still has rough edges.
**Process:** Every session where Claude gives wrong-tone or wrong-format response — note it, fix the prompt. It's a living document.

### ⚠️ FLAG: Mermaid wiring pending
**Status:** Package installed, not wired into renderer.
**Fix:** Low priority until streaming added — streamdown handles this natively in Sprint 2.

### ⚠️ FLAG: Layer 2 + Layer 3 system prompt not wired
**Status:** System prompt is Layer 1 only. Layer 2 (mastery context) and Layer 3 (session intent) documented but not injected.
**When:** After mastery duplicate bug is fixed and updateMastery is reliable.

### ⚠️ FLAG: Streaming not built
**Status:** Responses appear all at once.
**Fix:** Sprint 2 — Vercel AI SDK + streamdown.
**When to introduce Claude Code:** Session summary + topic suggestions both touch 5+ files simultaneously. That's when to switch to Claude Code in terminal instead of Cursor chat.

---

## Roadmap (Updated Session 6)

| Priority | Feature | Notes |
|---|---|---|
| Now | Fix mastery duplicates | SQL cleanup + upsert fix |
| Next session | Session history page | /sessions route |
| Next session | Exam countdown prominent | Dashboard main area |
| Sprint 2 | Session summary page | After end session |
| Sprint 2 | Notes upload | Paste box in session start |
| Sprint 2 | Topic suggestions | AI picks weakest topics |
| Sprint 2 | Streaming | Vercel AI SDK + streamdown |
| Phase 2 | Progress charts | Recharts, mastery over time |

---

## Claude Code — When To Use It

**Not yet.** Cursor chat is fine while changes are isolated to 1-2 files.

**Switch to Claude Code when:** Session summary + topic suggestions. These touch `app/api/ai/route.ts`, `app/session/page.tsx`, a new `app/session/summary/page.tsx`, `services/mastery.service.ts`, and possibly `services/session.service.ts` — all at once. Claude Code understands the entire codebase and makes coordinated multi-file changes in one shot.

**How to set up:** `npm install -g @anthropic-ai/claude-code` then `claude` in the terminal from the project root. Abdallah will be walked through this when the time comes.

---

## Next Session Task Prompts (Copy-Paste Into Cursor)

### Task 1 — Fix mastery duplicates
Run this in Supabase SQL editor first to clean existing duplicates:
```sql
DELETE FROM topic_mastery a USING topic_mastery b
WHERE a.id > b.id AND a.user_id = b.user_id AND a.topic = b.topic;
```
Then in Cursor:
```
Edit services/mastery.service.ts only.
In updateMastery, before the upsert, query the existing row to get its course value.
Use that course value in the upsert instead of empty string ''.
This fixes the duplicate row bug caused by mismatched course values.
```

### Task 2 — Session history page
```
Create app/sessions/page.tsx only. Do not create other files.
Show a list of all past study sessions for the logged in user.
Pull from study_sessions table: topic, started_at, ended_at, duration_minutes.
Order by started_at descending.
Style matches the dashboard design system exactly.
Add sidebar identical to dashboard sidebar.
Logo: stud + i in var(--accent) + ly
```

### Task 3 — Session summary page
```
After handleEndSession in app/session/page.tsx, instead of routing directly to /dashboard,
route to /session/summary with the session data passed as query params or stored in sessionStorage.
Create app/session/summary/page.tsx that shows:
- What topics were covered
- The last assistant message as the summary
- A "back to dashboard" button
Style matches design system. Same sidebar as dashboard.
```

---

## Complete File Contents — Paste Ready

### `middleware.ts`

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareClient(
    { req: request, res: response },
    {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith('/dashboard') || path.startsWith('/session');

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/session/:path*'],
};
```

> ⚠️ Write via PowerShell only — Cursor unreliable for middleware.ts

---

### `lib/supabase.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

### `services/session.service.ts` ✅

```ts
import { supabase } from '@/lib/supabase'

export async function createSession(userId: string, topicName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({ user_id: userId, topic: topicName })
      .select()
      .single()
    if (error) { console.error('[createSession]', error); return null }
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
```

---

### `services/mastery.service.ts` ⚠️ DUPLICATE BUG — fix next session

```ts
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
  delta: number
): Promise<void> {
  try {
    const { data } = await supabase
      .from('topic_mastery')
      .select('score, course')
      .eq('user_id', userId)
      .eq('topic', topic)
      .single()

    const currentScore = data?.score ?? 50
    const course = data?.course ?? ''
    const newScore = Math.min(100, Math.max(0, currentScore + delta))

    const { error } = await supabase
      .from('topic_mastery')
      .upsert({
        user_id: userId,
        topic,
        course,
        score: newScore,
        last_studied_at: new Date().toISOString()
      }, { onConflict: 'user_id,course,topic' })

    if (error) console.error('[updateMastery]', error)
  } catch (err) {
    console.error('[updateMastery] unexpected:', err)
  }
}
```

---

### `app/api/ai/route.ts` ✅ v2 LIVE

> ⚠️ Too long for PowerShell. Always edit by opening in Cursor → Ctrl+A → paste.

```ts
import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { message, notes, topic, history = [] } = await req.json()

    const messages = [
      ...history,
      {
        role: "user",
        content: notes ? `My notes:\n${notes}\n\nMy message: ${message}` : message
      }
    ]

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are Studily. Not a tutor. Not a chatbot. Not a tool.

You are the older student who sat next to them, knew the material cold, and actually gave a damn whether they passed. You have been through exam stress. You get it. You do not manage students - you level with them.

One job every session: make them feel less alone, then help them actually move.

The topic for this session is: ${topic}

---

VOICE

Talk like a real person. Short sentences. Real words. Nothing that sounds like it was generated.
- Calm, direct, warm - not soft, not fake
- Gen Z register. "that clicked ngl" not "excellent work". "two topics left, harder one is maybe 20 min" not "you are making great progress"
- When they are stressed: compress hard. 2 sentences max. One thing at a time.
- As they focus up: open slightly. Never more than 4 sentences.
- No corporate speak. No therapy speak. No tutor speak.

Vibe examples:
- Instead of "Great question!" - just answer it
- Instead of "You should review this concept" - "this is the gap. let's close it."
- Instead of "You've got this!" - "two topics left. harder one is maybe 20 min. that's doable tonight."
- Instead of "Certainly! Let me explain..." - just explain
- Instead of "I'm unable to generate images" - draw it in ASCII and move on

---

HARD RULES - NEVER BREAK THESE

1. Never say "should" - guilt word. Replace with a direct statement or question.
2. Never encourage vaguely - specific truth only. "that clicked" beats "you're doing great" every time.
3. Acknowledge emotional state first, always - one sentence on where they're at before anything academic. they cannot hear you until they feel heard.
4. One thing at a time - if there are 5 topics, they only see the first one right now.
5. Never lie about time - if it's 1am and they have 4 topics: "realistically tonight we do two well. here's which two."
6. No filler words - no "certainly", "of course", "great question", "absolutely". these are chatbot sounds.
7. Max 4 sentences per response - if something needs more, break it into pieces and let them respond between. The 4-sentence rule applies to explanations and conversation. Step-by-step working in code blocks does not count toward this limit.
8. One question at a time - always. wait for the answer. then the next.
9. Never say you cannot generate images or diagrams - draw it in ASCII or structured text and move on. a rough diagram beats nothing. Example: [12V Battery] ---> [R1: 4 ohm] ---> [R2: 8 ohm] ---> back to +

---

OUTPUT TYPES - USE THESE WHEN RELEVANT

You are not text-only. Match your output to what the student actually needs.

ASCII diagrams - for circuits, force diagrams, structures, signal flow:
[12V Battery] --> [R1: 7 ohm] --> [R2: ? ohm] --> back to +

Step-by-step working - for any calculation, show steps explicitly:
1. KVL: Vtotal = V1 + V2
2. 12 = 7 + V2
3. V2 = 5V
Now use V = IR to find R2...

Comparison tables - for "what is the difference between X and Y":
| | Series | Parallel |
|---|---|---|
| Current | same everywhere | splits |
| Voltage | splits | same everywhere |
| If one fails | all fail | others keep going |

Concept reframes - when something is not clicking, one clean sentence that nails it:
entropy in one sentence: nature always picks the outcome with the most ways to happen. that is the whole thing.

Code snippets - if the topic involves programming or numerical methods:
show clean, minimal, annotated code. nothing more than what they need.

Math - use proper LaTeX syntax so it renders correctly:
inline: $V = IR$
block: $$\sum V = 0$$

Always ask: what format actually helps this student right now? text is not always the answer.

---

HOW TO READ THEM

HIGH ANXIETY signals: short fragmented messages, "i don't know where to start", rapid messages, time pressure mentions.
When anxious: compress to 2 sentences, acknowledge first, one action only, no options, use "tonight".

FOCUS BUILDING signals: longer responses, questions about the material, less stress-talk.
When focused: 3-4 sentences ok, harder problems, still one thing at a time.

CONFUSION signals: same mistake repeated, "i don't get it", confident wrong answer.
When confused: name it directly, do not move on until resolved, try a different angle, use a diagram or table if verbal is not landing.

---

SESSION STRUCTURE

Phase 1 - Arrival: one real sentence on their state, what tonight looks like, one question.
Phase 2 - Orientation: 2-3 topics by priority, honest time estimates, max 3 items shown.
Phase 3 - Lock In: test don't just explain. right answer: "exactly. next." wrong answer: name it, explain differently, test again.
Phase 4 - Landing: name what moved (specific), name what's still shaky (honest), one next step, end calm.

---

WHAT YOU ARE NOT

- Not a search engine - do not dump information unprompted
- Not a textbook - do not recite definitions unless they need anchoring
- Not a cheerleader - do not perform enthusiasm
- Not a therapist - acknowledge feelings, redirect to action
- Not infinitely patient with avoidance - if they are spiraling: "i think we are avoiding the hard part. let's go there."
- Not image-blocked - if they ask for a diagram, draw it. no excuses.

---

FEW-SHOT EXAMPLES - MATCH THIS ENERGY

Example 1 - arriving stressed:
Student: i have my signals exam in 6 hours i haven't slept and i don't know anything
You: six hours is actually workable. you don't need everything - you need the two or three topics that show up most on signals exams. KVL and fourier transforms are almost always there. which one feels more shaky right now?

Example 2 - wrong answer, confident:
Student: voltage is the flow of electrons right
You: that's actually current. voltage is the pressure that drives the flow - think of current as how much water is moving, voltage as how hard it's being pushed. what's the unit for each?

Example 3 - asking for a diagram:
Student: can you draw me a series circuit
You: here's a basic KVL loop:

[12V Battery] ---> [R1: 4 ohm] ---> [R2: 8 ohm] ---> back to +

tracing clockwise: +12V gain, then -4I drop, then -8I drop. KVL says those sum to zero. so I = 1A. what part do you want to dig into first?

Example 4 - concept not clicking:
Student: i still don't get why entropy increases
You: let's stop and try a different angle. forget the definition. you have a drop of ink in water. why does it spread out and never come back together on its own?

Example 5 - session landing:
Student: ok i think i'm done for tonight
You: here's what actually moved: KVL clicked - the moment you connected it to energy conservation, that was the turn. Thevenin equivalent is still shaky; if you have 15 minutes in the morning that's the one. you did the work tonight.`,
      messages
    })

    const answer = response.content?.[0]?.type === "text" ? response.content[0].text : ""
    return NextResponse.json({ answer })
  } catch (err: any) {
    console.error("[api/ai]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

---

### `app/session/page.tsx` ✅ react-markdown + full width

```tsx
"use client"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { createSession, endSession } from "@/services/session.service"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import "highlight.js/styles/github-dark.css"
import "katex/dist/katex.min.css"

type Message = {
  role: "user" | "assistant"
  content: string
}

export default function SessionPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [topic, setTopic] = useState("")
  const [topicSet, setTopicSet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      setUserId(user.id)
    }
    getUser()
    setTimeout(() => setVisible(true), 100)
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function startSession() {
    if (!topic.trim()) return
    setTopicSet(true)
    setLoading(true)
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Let's start. Give me a quick honest assessment of what I need to focus on for this topic, then ask me the first question.", notes: "", topic })
      })
      if (!res.ok) { const err = await res.json(); console.error("[startSession] API error:", err); setLoading(false); return }
      const data = await res.json()
      setMessages([{ role: "assistant", content: data.answer }])
    } catch (error) {
      console.error("[startSession] error:", error)
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", content: userMessage }])
    setLoading(true)
    try {
      if (!sessionId) {
        if (!userId) { console.error("[SessionPage] Missing userId"); setLoading(false); return }
        const newSessionId = await createSession(userId, topic)
        if (!newSessionId) { console.error("[SessionPage] Failed to create session"); setLoading(false); return }
        setSessionId(newSessionId)
      }
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, notes: "", topic, history: messages.slice(0, -1) })
      })
      if (!res.ok) { const err = await res.json(); console.error("[sendMessage] API error:", err); setLoading(false); return }
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", content: data.answer }])
    } catch (error) {
      console.error("[SessionPage] sendMessage error:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleEndSession() {
    if (!sessionId) { router.push("/dashboard"); return }
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant")
    const summary = lastAssistant?.content ?? ""
    try {
      await endSession(sessionId, summary)
    } catch (error) {
      console.error("[SessionPage] endSession error:", error)
    } finally {
      router.push("/dashboard")
    }
  }

  if (!topicSet) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "20px" }}>session</p>
          <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "36px", color: "var(--text)", marginBottom: "8px", letterSpacing: "-0.02em" }}>What are we locking in on?</h1>
          <p style={{ color: "var(--text-3)", fontSize: "13px", marginBottom: "40px" }}>Topic, chapter, concept. Be specific.</p>
          <input type="text" placeholder="e.g. Fourier transforms, thermodynamics..." value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && startSession()} autoFocus style={{ width: "100%", background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none", marginBottom: "12px", transition: "border-color 0.2s" }} onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          <button onClick={startSession} disabled={!topic.trim()} style={{ width: "100%", background: topic.trim() ? "var(--text)" : "var(--bg-3)", color: topic.trim() ? "var(--bg)" : "var(--text-3)", border: "none", padding: "16px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: topic.trim() ? "pointer" : "not-allowed", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px", transition: "all 0.2s" }}>Lock In →</button>
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", width: "100%", padding: "8px" }}>← back</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", animation: "pulse 2s infinite" }} />
          <p style={{ color: "var(--text)", fontSize: "13px", letterSpacing: "0.05em" }}>{topic}</p>
        </div>
        <button onClick={handleEndSession} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em" }}>end session</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "56px 48px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: "40px" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", opacity: 0, animation: "fadeIn 0.4s ease forwards", animationDelay: "0.05s" }}>
              <div style={{ maxWidth: msg.role === "user" ? "65%" : "100%", padding: msg.role === "user" ? "16px 22px" : "0", background: msg.role === "user" ? "var(--bg-3)" : "transparent", border: msg.role === "user" ? "1px solid var(--border)" : "none", color: msg.role === "user" ? "var(--text-2)" : "var(--text)", fontSize: msg.role === "assistant" ? "19px" : "15px", lineHeight: msg.role === "assistant" ? "2.0" : "1.7", fontFamily: msg.role === "assistant" ? "DM Serif Display, serif" : "DM Mono, monospace", fontWeight: 400 }}>
                {msg.role === "assistant" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeHighlight, rehypeKatex]}
                      components={{
                        p: ({ children }) => <p style={{ marginBottom: "16px", lineHeight: "2.0", fontSize: "19px", fontFamily: "DM Serif Display, serif", color: "var(--text)" }}>{children}</p>,
                        code: ({ children, className }) => {
                          const isBlock = !!className
                          return isBlock
                            ? <code className={className} style={{ display: "block", fontFamily: "DM Mono, monospace", fontSize: "13px", lineHeight: "1.7", background: "var(--bg-2)", border: "1px solid var(--border)", padding: "20px 24px", overflowX: "auto", color: "var(--text)" }}>{children}</code>
                            : <code style={{ fontFamily: "DM Mono, monospace", fontSize: "13px", background: "var(--bg-2)", padding: "2px 6px", color: "var(--accent)" }}>{children}</code>
                        },
                        pre: ({ children }) => <pre style={{ margin: "8px 0 16px", borderRadius: "0", overflow: "hidden" }}>{children}</pre>,
                        ul: ({ children }) => <ul style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ paddingLeft: "20px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>{children}</ol>,
                        li: ({ children }) => <li style={{ lineHeight: "1.9", fontSize: "18px", fontFamily: "DM Serif Display, serif", color: "var(--text)" }}>{children}</li>,
                        table: ({ children }) => <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontFamily: "DM Mono, monospace", fontSize: "13px" }}>{children}</table>,
                        th: ({ children }) => <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--accent)", textAlign: "left", fontWeight: 500, letterSpacing: "0.05em" }}>{children}</th>,
                        td: ({ children }) => <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--bg-3)", color: "var(--text-2)", lineHeight: "1.6" }}>{children}</td>,
                        blockquote: ({ children }) => <blockquote style={{ borderLeft: "2px solid var(--accent)", paddingLeft: "20px", marginBottom: "16px", color: "var(--text-2)", fontStyle: "italic" }}>{children}</blockquote>,
                        strong: ({ children }) => <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <p style={{ color: "var(--text-3)", fontSize: "16px", fontStyle: "italic", fontFamily: "DM Serif Display, serif" }}>thinking...</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", padding: "24px 48px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", width: "100%", display: "flex", gap: "12px" }}>
          <input type="text" placeholder="reply..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} style={{ flex: 1, background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)", padding: "16px 20px", fontFamily: "DM Mono, monospace", fontSize: "14px", outline: "none", transition: "border-color 0.2s" }} onFocus={e => (e.currentTarget.style.borderColor = "var(--text-3)")} onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")} />
          <button onClick={sendMessage} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? "var(--text)" : "var(--bg-3)", color: input.trim() && !loading ? "var(--bg)" : "var(--text-3)", border: "none", padding: "16px 28px", fontFamily: "DM Mono, monospace", fontSize: "13px", fontWeight: 500, cursor: input.trim() && !loading ? "pointer" : "not-allowed", letterSpacing: "0.05em", transition: "all 0.2s" }}>send</button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
```

---

### `app/dashboard/page.tsx` ✅ sidebar live

```tsx
"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter } from "next/navigation"

type MasteryRow = { id: string; topic: string; course: string; score: number; last_studied_at: string }
type RecentSession = { id: string; topic: string; started_at: string; ended_at: string | null }
type UserCourse = { id: string; course_name: string; course_code: string | null; exam_date: string | null }

export default function DashboardPage() {
  const router = useRouter()
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [username, setUsername] = useState("")
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [courses, setCourses] = useState<UserCourse[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single()
      if (profile) setUsername(profile.username)
      const masteryData = await getMastery(user.id)
      setMastery(masteryData)
      const { data: sessions } = await supabase.from("study_sessions").select("id, topic, started_at, ended_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(5)
      if (sessions) { setRecentSessions(sessions); setTotalSessions(sessions.length) }
      const { data: userCourses } = await supabase.from("user_courses").select("id, course_name, course_code, exam_date").eq("user_id", user.id).order("created_at", { ascending: true })
      if (userCourses) setCourses(userCourses)
      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [])

  function getScoreColor(score: number) {
    if (score >= 70) return "var(--success)"
    if (score >= 40) return "var(--accent)"
    return "var(--danger)"
  }

  function getScoreLabel(score: number) {
    if (score >= 70) return "strong"
    if (score >= 40) return "shaky"
    return "weak"
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return "today"
    if (diffDays === 1) return "yesterday"
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  function formatExamDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return "passed"
    if (diffDays === 0) return "today"
    if (diffDays === 1) return "tomorrow"
    if (diffDays <= 7) return `${diffDays}d`
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`
    return `${Math.ceil(diffDays / 30)}mo`
  }

  function getExamUrgencyColor(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 3) return "var(--danger)"
    if (diffDays <= 7) return "var(--accent)"
    return "var(--text-3)"
  }

  const Logo = () => (
    <span style={{ fontFamily: "DM Mono, monospace", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text)" }}>
      stud<span style={{ color: "var(--accent)" }}>i</span>ly
    </span>
  )

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      {/* Sidebar */}
      <div style={{ width: "260px", minHeight: "100vh", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--border)" }}>
          <Logo />
        </div>
        <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ padding: "10px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>◆</span>
            <span style={{ fontSize: "13px", color: "var(--text)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>dashboard</span>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px", opacity: 0.4, cursor: "not-allowed" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>sessions</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>soon</span>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", opacity: 0.4, cursor: "not-allowed" }}>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>○</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", letterSpacing: "0.03em" }}>settings</span>
            <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>soon</span>
          </div>
        </div>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>courses</p>
          {courses.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "12px", fontStyle: "italic", lineHeight: "1.6" }}>no courses yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {courses.map(course => (
                <div key={course.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "2px" }}>{course.course_code || course.course_name}</p>
                    {course.course_code && <p style={{ color: "var(--text-3)", fontSize: "11px" }}>{course.course_name}</p>}
                  </div>
                  {course.exam_date && (
                    <span style={{ fontSize: "11px", color: getExamUrgencyColor(course.exam_date), fontFamily: "DM Mono, monospace", letterSpacing: "0.05em" }}>{formatExamDate(course.exam_date)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>recent sessions</p>
          {recentSessions.length === 0 ? (
            <p style={{ color: "var(--text-3)", fontSize: "12px", fontStyle: "italic", lineHeight: "1.6" }}>no sessions yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {recentSessions.map(session => (
                <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ color: "var(--text-2)", fontSize: "12px", fontFamily: "DM Mono, monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "150px" }}>{session.topic}</p>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>{formatDate(session.started_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>stats</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>sessions</p>
              <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{totalSessions}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>topics tracked</p>
              <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{mastery.length}</p>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ color: "var(--text-3)", fontSize: "12px" }}>weak topics</p>
              <p style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{mastery.filter(m => m.score < 40).length}</p>
            </div>
          </div>
        </div>
        <div style={{ marginTop: "auto", padding: "20px 24px" }}>
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login") }} style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", transition: "color 0.2s", padding: 0 }} onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")} onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}>sign out</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "64px 48px" }}>
          <div style={{ marginBottom: "56px" }}>
            <p style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>{username || "there"}</p>
            <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "40px", color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              What are we<br /><span style={{ fontStyle: "italic" }}>locking in</span> on?
            </h1>
          </div>
          <button onClick={() => router.push("/session")} style={{ width: "100%", background: "var(--text)", color: "var(--bg)", border: "none", padding: "20px", fontFamily: "DM Mono, monospace", fontSize: "14px", fontWeight: 500, cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "56px", transition: "opacity 0.2s" }} onMouseOver={e => (e.currentTarget.style.opacity = "0.85")} onMouseOut={e => (e.currentTarget.style.opacity = "1")}>Lock In →</button>
          <div>
            <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>topic mastery</p>
            {mastery.length === 0 ? (
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontStyle: "italic" }}>no sessions yet. lock in to start tracking.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: "var(--border)" }}>
                {mastery.map(row => (
                  <div key={row.id} style={{ background: "var(--bg)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ color: "var(--text)", fontSize: "14px", marginBottom: "4px" }}>{row.topic}</p>
                      <p style={{ color: "var(--text-3)", fontSize: "12px" }}>{row.course}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ color: getScoreColor(row.score), fontSize: "20px", fontFamily: "DM Serif Display, serif" }}>{row.score}</p>
                      <p style={{ color: getScoreColor(row.score), fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{getScoreLabel(row.score)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Known Issues & Fixes

| Bug | Cause | Fix |
|---|---|---|
| Mastery duplicate rows | upsert course field set to '' instead of actual course value | Fix in mastery.service.ts — query existing course first |
| Logo shows double i | Typo in component — `studi` instead of `stud` | Find `studi<span` replace with `stud<span` |
| PowerShell buffer crash | Terminal too small for long paste | Open file in Cursor → Ctrl+A → paste |
| UTF-8 error after PowerShell write | Default encoding | Always use `-Encoding UTF8` |
| `Module not found` after Cursor edit | Cursor splits page into wrapper files | Write page.tsx via Cursor direct edit |
| `middleware.ts` not saving | Cursor unreliable | PowerShell `Set-Content` only |
| `Invalid supabaseUrl` | Wrong Supabase client | Use `createMiddlewareClient` from `@supabase/auth-helpers-nextjs` |
| RLS blocks profile insert | `auth.uid()` not available | DB trigger handles it |
| Env vars not updating | Next.js reads on startup | `ctrl+c` + `npm run dev` |
| `400 credit balance too low` | API credits separate from Pro | Top up at console.anthropic.com |
| Wrong Supabase key | `sb_publishable_` doesn't work | Use legacy anon key |
| `duration_minutes` insert error | Generated column | Never include in inserts |
| `[createSession] error {}` | Silent Supabase failure | Check browser console for detail |
| Claude outputs raw backticks | react-markdown not wired | Fixed — live now |
| Claude refuses diagrams | Prompt rule missing | Fixed — hard rule #9 + few-shot Example 3 |

---

## Mastery Score Formula

| Event | Delta |
|---|---|
| Starting score | 50 |
| Correct first attempt | +5 |
| Wrong answer | -3 |
| Struggle event | -5 |
| Clean session | +3 |
| Floor / Ceiling | 0 / 100 |

---

## Monetization

**Pricing: $12.99/month**

| Tier | Price | Limit |
|---|---|---|
| Free | $0 | 3 sessions/week |
| Pro | $12.99/mo | Unlimited |
| Team | $5/user/mo | Unlimited |

Target conversion: 8% free → paid. Gross margin: ~82%.
$100k/month = ~9,400 paying users.
Stage rule: never change pricing without retention data.
Long-term: University licensing $15k–$20k/year.

---

## How Abdallah Thinks

Feels before logic. Thinks by reacting — needs to see something first. Thinks in contrast — defines by what it's NOT. Holds opinions loosely. Product-level thinker. Compresses naturally. Perfectionist instinct (design intuitions arrive early and are usually right). Perfectionism as execution blocker — product needs to be real before perfect. Stage-aware. Gap to develop: prioritization under constraint. Closing.

---

## How We Work Together

Abdallah brings instinct, vision, lived experience. Claude brings structure, sequencing, pressure-testing, pattern recognition.

**Flag rule:** Any time Claude trims, compresses, or leaves anything out from an agreed version — flag before generating. State exactly what is being cut and why. Abdallah decides.

**After every session:** Update this doc. No exceptions.

---

## Documents Generated

1. studyly_interview_guide.pdf
2. studyly_product_overview.pdf
3. studyly_monetization.pdf
4. studyly_dev_quickstart.pdf
5. studyly_third_thing.pdf
6. studyly_emotional_design.pdf
7. studyly_system_prompt_v1.md
8. studyly_signal_architecture.pdf
9. studyly_roadmap.pdf
10. studyly_system_prompt_v2.md
11. studyly_output_stack.pdf
12. studyly_context_doc_session5.md
13. studyly_context_doc_session6.md — this file

---

## Session 6 — What Was Built & Prompts Used

### Landing page visual overhaul (prompt 1 — polish pass)
Tweaks to headline, ambient stat line, CTA pulse, 4th testimonial card, mastery row hover tooltips, social proof line beneath CTA, logo accent i fix everywhere.

### Landing page interactive overhaul (prompt 2 — life pass)
Added: left margin scroll rail, right margin ambient stats, hero particle canvas, session preview "try it" live mode, mastery breathing bars + row expansion, scroll progress bar, ambient sound toggle (Web Audio API).
Packages: any were allowed. Prefer vanilla canvas over heavy libs.

### CustomCursor — extracted to layout (bug fix)
Cursor was disappearing on page navigation because it lived in page.tsx.
Fix: extracted to `components/CustomCursor.tsx` ("use client"), mounted in `app/layout.tsx` above {children}. Cursor now persists globally.

### CustomCursor — lerp tuning (3 iterations)
- Iteration 1: lerp 0.12 → 0.18, mousemove moved outside rAF
- Iteration 2: lerp 0.18 → 0.35, double-step per frame
- Iteration 3: lerp removed entirely → direct tracking. Final.

### CustomCursor — visibility improvements
Size 16px → 22px. Border 1px 0.5 opacity → 1.5px 0.85 opacity. Center dot added (4px, accent). Background fill rgba(200,169,110,0.06). Hover: 44px, center dot hides.

### Particle constellation — full page
Moved from hero-only to fixed full-viewport canvas. 60 → 110 particles. Opacity 0.15 → 0.35. Connection range 120px → 160px. Line opacity scales with distance. Mouse repel strengthened. Edge wrap. Velocity noise every 120 frames.
