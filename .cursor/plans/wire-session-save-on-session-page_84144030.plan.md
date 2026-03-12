---
name: wire-session-save-on-session-page
overview: Wire study session persistence into the existing Session page by calling the session service on first message submit and on End Session, without touching any other files.
todos:
  - id: wire-first-message-session
    content: Add session/user state in `SessionPage` and call `createSession(userId, topic)` on the first message submit, storing the returned `sessionId` in state.
    status: completed
  - id: wire-end-session-summary
    content: Update the End Session button in `SessionPage` to compute the last assistant message as `summary`, call `endSession(sessionId, summary)`, and then navigate to `/dashboard`.
    status: completed
isProject: false
---

# Wire session save in `app/session/page.tsx`

## Scope and files

- **Will edit**: `[app/session/page.tsx](app/session/page.tsx)`
- **Will NOT touch**: `services/session.service.ts`, `services/mastery.service.ts`, `app/api/ai/route.ts`, `lib/supabase.ts`, `middleware.ts`, any other pages/components.
- **Assumption**: `services/session.service.ts` exposes `createSession(userId: string, topicName: string): Promise<string | null>` and `endSession(sessionId: string, summary: string): Promise<void>` as documented in `CLAUDE.md`, and will be aligned to that spec outside this change.

## High-level behavior

- **On first message submit**: when the user sends their first reply in the session (the first call to `sendMessage` after topic is locked in), call `createSession(userId, topic)` to create a `study_sessions` row and store the returned `sessionId` in component state.
- **On End Session click**: when the user clicks the `end session` button in the header, call `endSession(sessionId, summary)` where `summary` is the content of the last assistant message in `messages`, then navigate back to `/dashboard`.

## Detailed steps

- **Add session/user state**
  - Import the session service functions at the top of `app/session/page.tsx`:
    - `import { createSession, endSession } from "@/services/session.service"`
  - Add new React state in `SessionPage`:
    - `const [sessionId, setSessionId] = useState<string | null>(null)`
    - `const [userId, setUserId] = useState<string | null>(null)`
  - In the existing `getUser` effect, after a successful `supabase.auth.getUser()` call, store `user.id` in `userId` using `setUserId(user.id)`.
- **Wire `createSession` into first `sendMessage`**
  - Update `sendMessage` to be responsible for creating the session on the very first user message:
    - Keep the current early returns for empty input / `loading` to prevent duplicate submits.
    - After capturing `userMessage` and before calling `/api/ai`, ensure a session exists:
      - If `!userId`, optionally log an error and return early (guard against unexpected missing auth despite middleware).
      - If `sessionId` is `null`, call `await createSession(userId, topic)`:
        - If the result is `null` (or falsy), stop, reset `loading` to `false`, and avoid sending the AI request.
        - Otherwise, call `setSessionId(newSessionId)` and use that value as the active `sessionId` for the rest of the function.
    - Leave the existing `/api/ai` call and `messages` updates intact; this change only augments the handler with session creation logic that runs once.
- **Wire `endSession` into End Session button**
  - Replace the inline `onClick={() => router.push("/dashboard")}` on the `end session` header button with a named async handler, e.g. `handleEndSession`.
  - Implement `handleEndSession` inside `SessionPage`:
    - If `!sessionId`, simply route back to `/dashboard` (session was never started) to avoid throwing.
    - Derive `summary` from the last assistant message in `messages`:
      - Something like `const lastAssistant = [...messages].reverse().find(m => m.role === "assistant")` and `const summary = lastAssistant?.content ?? ""`.
    - Call `await endSession(sessionId, summary)` in a try/catch block:
      - On success, navigate to `/dashboard` using `router.push("/dashboard")`.
      - On error, `console.error` the failure and still route back or optionally keep the user on the page, depending on desired UX (default: still route back to avoid trapping the user).
- **Behavioral guarantees**
  - `createSession` is called **exactly once** per page load, on the first successful `sendMessage` call, guarded by `sessionId === null`.
  - `endSession` is only called when a valid `sessionId` exists; otherwise the button behaves as a simple navigation back to the dashboard.
  - The UI remains a single centered column of max ~600px width for the main content, and no visual design changes beyond wiring the existing controls.

## Todos

- **wire-first-message-session**: Add `sessionId` and `userId` state and call `createSession(userId, topic)` on the first `sendMessage`.
- **wire-end-session-summary**: Add `handleEndSession` that computes the last assistant message as `summary`, calls `endSession(sessionId, summary)`, then routes to `/dashboard`.

