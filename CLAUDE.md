# CLAUDE.md — Studyly
> Read this entire file before touching any code. These rules are non-negotiable.

---

## What This Project Is

Studyly is an AI-powered study companion for engineering students. The core loop: student opens app → sees what to study based on mastery gaps → hits Lock In → AI guides the session → honest summary at the end.

**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · Claude API (claude-sonnet-4-5) · Vercel  
**Editor:** Cursor  
**Pattern:** Service layer abstraction — all DB calls go through `services/`

---

## 🚨 FILE RULES — Read First

These are the most common ways agents break this project.

```
NEVER create PageClient.tsx, ComponentClient.tsx, or any wrapper/split file.
NEVER make page.tsx just an import of another file you created.
NEVER split a page into multiple files unless explicitly instructed.
If you need "use client" — add it to the TOP of the existing page.tsx.
ALWAYS edit the file that already exists. Do not create a new one for the same purpose.
If you are unsure which file to edit — ASK before creating anything.
```

---

## Architecture Rules

### Service Layer (Mandatory)
- **Components never call Supabase directly.** Ever.
- All DB reads/writes go through `services/`
- If a service function doesn't exist yet — create it in the appropriate service file, then call it from the component
- This exists so the backend can swap from Supabase to a Node.js API in Phase 2 without touching any frontend code

```
✅ component → services/session.service.ts → supabase
❌ component → supabase directly
```

### API Routes
- Claude API key is server-side only — lives in `app/api/ai/route.ts`
- Never expose ANTHROPIC_API_KEY to the client
- All AI calls go through `POST /api/ai`

### File Ownership
```
app/api/ai/route.ts         — Claude API only. Do not add other logic here.
services/session.service.ts — session DB operations only
services/mastery.service.ts — mastery score operations only
lib/supabase.ts             — Supabase client instantiation only
middleware.ts               — Route protection only. Write via PowerShell, not Cursor.
globals.css                 — Design system variables + fonts. Do not override inline.
```

---

## Reliability Rules

### Before Writing Any Code
1. State which file(s) you will edit
2. State which file(s) you will NOT touch
3. If creating a new file — state why an existing file can't handle it

### Error Handling (Required on Every Service Function)
```ts
// Every service function must follow this pattern:
export async function createSession(userId: string, topicName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('study_sessions').insert({...}).select().single()
    if (error) { console.error('[createSession]', error); return null; }
    return data.id
  } catch (err) {
    console.error('[createSession] unexpected:', err)
    return null
  }
}
```

### TypeScript Rules
- No `any` types. Ever.
- All Supabase responses must be typed — use the table type or define an interface
- All props must be typed — no implicit prop types
- If a type is complex, define it at the top of the file or in a `types/` file

### Environment Variables
- Never hardcode URLs, keys, or secrets
- Always use `process.env.NEXT_PUBLIC_*` for client-side vars
- After ANY change to `.env.local` — stop server (`ctrl+c`) and restart `npm run dev`

### Supabase Rules
- Always check for `error` in every Supabase response before using `data`
- All tables have RLS enabled — queries will silently return empty if auth is missing
- Never do a manual profile insert after signUp — the DB trigger handles it
- Use `createMiddlewareClient` from `@supabase/auth-helpers-nextjs` in middleware only

---

## Scalability Rules

### Component Structure
- Keep components under 200 lines. If a page grows beyond that, extract a named component at the BOTTOM of the same file — not a new file, unless it's reused in 2+ places.
- Co-locate state with the component that owns it. Don't lift state until you need to.
- No prop drilling beyond 2 levels — use context or pass via service layer

### Database
- Every new table needs RLS enabled immediately — no exceptions
- All foreign keys must reference `profiles(id)`, not `auth.users(id)` directly
- Index columns used in `WHERE` clauses that will grow (user_id, session_id, topic_name)
- New signal tables (`message_logs`, `attempt_events`) will get large fast — always filter by `user_id` and `session_id`, never do full table scans

### Service Layer Growth Pattern
```
Phase 1 (now):   services/session.service.ts  — direct Supabase calls
Phase 2 (later): services/session.service.ts  — swap internals to API calls
                                               — component code changes ZERO
```
This is why the service layer exists. Don't break the abstraction.

### API Route Pattern
- One concern per API route
- `app/api/ai/route.ts` — AI conversations only
- Future routes: `app/api/courses/route.ts`, `app/api/mastery/route.ts`
- Never combine unrelated logic in the same route handler

---

## Design System Rules

**Never hardcode colors. Use CSS variables.**

```css
--bg: #0a0a0b        /* page background */
--bg-2: #111113      /* card background */
--bg-3: #1a1a1e      /* elevated surface */
--border: #2a2a2e    /* all borders */
--text: #f0ede8      /* primary text */
--text-2: #8a8a8a    /* secondary text */
--text-3: #4a4a4a    /* muted/disabled */
--accent: #c8a96e    /* gold — use sparingly */
--accent-dim: #8a7248
--danger: #e05a5a
--success: #5a9e6f
```

**Typography:**
```css
font-family: 'DM Serif Display'  /* headings, AI responses */
font-family: 'DM Mono'           /* UI text, inputs, labels, user messages */
```

**Motion — slow fade only:**
```ts
// Framer Motion
{ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, ease: 'easeOut' } }

// CSS
transition: opacity 0.6s ease;
```

**Never use:** bounce, spring, scale pop, slide from bottom, or any animation that draws attention to itself.

**Session page constraint:** Single column. Max width 600-700px. Centered. Never widen it.

---

## What NOT to Build

Studyly v1 intentionally excludes these. Do not add them, suggest them, or scaffold for them:

```
❌ Streaks or daily login rewards
❌ Leaderboards or any social comparison
❌ Content library, video embeds, PDFs
❌ Push notifications
❌ Mobile-specific layouts (desktop first)
❌ Onboarding with more than 2 steps
❌ Any feature that requires a student to do extra work
```

---

## Service Functions (Already Built — Do Not Rewrite)

### `services/session.service.ts`
```ts
createSession(userId: string, topicName: string): Promise<string | null>
// Inserts into study_sessions. Returns new session ID.

endSession(sessionId: string, summary: string): Promise<void>
// Sets ended_at. Writes summary to session_outcomes.
```

### `services/mastery.service.ts`
```ts
updateMastery(userId: string, topicName: string, delta: number): Promise<void>
// Applies delta to topic_mastery score. Enforces 0–100 bounds.

getMasteryForUser(userId: string): Promise<TopicMastery[]>
// Returns all mastery rows for dashboard display.
```

---

## Current Task Queue (Session 5)

Work in this order. Do not skip ahead.

### 1. Wire session save
**Edit:** `app/session/page.tsx`
- On first message submit → call `createSession(userId, topicName)` → store `sessionId` in state
- On End Session click → call `endSession(sessionId, summary)` where summary = final Claude response

### 2. Update mastery after session
**Edit:** `app/session/page.tsx`
- After `endSession()` resolves → call `updateMastery(userId, topicName, +3)`
- +3 = clean session bonus (v1 formula)

### 3. Onboarding flow
**Create:** `app/onboarding/page.tsx` (new file — this one is allowed)
**Create:** `services/onboarding.service.ts`
- After register → redirect to `/onboarding` not `/dashboard`
- Step 1: confirm/edit username
- Step 2: add first course (name, code, exam date)
- On complete → insert to `user_courses` via service → redirect to `/dashboard`

### 4. Add course from dashboard
**Edit:** `app/dashboard/page.tsx`
- "+ Add Course" button → inline form or modal
- Calls `addCourse()` from `services/onboarding.service.ts`

### 5. Landing page review
**Edit:** `app/page.tsx`
- Single CTA. No feature lists. No bullet benefits. Emotion first.
- Check against tagline: "You got this. Lock in. Here's what you need to do."

---

## Known Bugs (Never Debug These Again)

| Bug | Cause | Fix |
|---|---|---|
| `Module not found` after Cursor edit | Cursor split page into wrapper + client file | Write `page.tsx` directly via PowerShell |
| `middleware.ts` changes not persisting | Cursor file handling unreliable for this file | Use PowerShell `Set-Content` always |
| `Invalid supabaseUrl` in middleware | Wrong Supabase client (`@supabase/ssr`) | Use `createMiddlewareClient` from `@supabase/auth-helpers-nextjs` |
| RLS blocks profile insert on register | `auth.uid()` not available immediately after signUp | DB trigger handles it — remove manual insert |
| Env vars not updating | Next.js reads `.env.local` on startup only | `ctrl+c` + `npm run dev` after every env change |
| `400 credit balance too low` | Anthropic credits exhausted | Top up at console.anthropic.com |
| Supabase returns empty silently | RLS enabled, user not authenticated | Check session before any DB call |

---

## Middleware (Working — Do Not Edit Via Cursor)

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

## Project File Tree

```
studyly/
├── app/
│   ├── api/ai/route.ts          ← Claude API. Server only.
│   ├── dashboard/page.tsx       ← Main dashboard
│   ├── session/page.tsx         ← Study session
│   ├── onboarding/page.tsx      ← ⏳ Not built yet
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── globals.css              ← Design system. Do not override.
│   ├── layout.tsx
│   └── page.tsx                 ← Landing page
├── components/                  ← Empty. No splits yet.
├── lib/supabase.ts              ← Client only. Do not add logic here.
├── services/
│   ├── mastery.service.ts       ← Mastery DB ops
│   ├── session.service.ts       ← Session DB ops
│   └── onboarding.service.ts   ← ⏳ Not built yet
├── middleware.ts                ← Route protection. Edit via PowerShell only.
└── .env.local
```
