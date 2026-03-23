// ── Shared types ────────────────────────────────────────────────────────────
export type MasteryRow = {
  id: string
  topic: string
  course: string
  score: number
  last_studied_at: string
}

export type RecentSession = {
  id: string
  topic: string
  started_at: string
  ended_at: string | null
}

export type UserCourse = {
  id: string
  course_name: string
  course_code: string | null
  exam_date: string | null
}

// ── Score helpers ───────────────────────────────────────────────────────────
export function getScoreColor(score: number): string {
  if (score >= 70) return "var(--success)"
  if (score >= 40) return "var(--accent)"
  return "var(--danger)"
}

export function getScoreLabel(score: number): string {
  if (score >= 70) return "strong"
  if (score >= 40) return "shaky"
  return "weak"
}

// ── Date helpers ────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "today"
  if (diffDays === 1) return "yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function formatExamDate(dateStr: string): string {
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

export function hasExamWithin48Hours(courses: UserCourse[]): boolean {
  const now = Date.now()
  return courses.some(c => {
    if (!c.exam_date) return false
    const diff = new Date(c.exam_date).getTime() - now
    return diff >= 0 && diff <= 48 * 60 * 60 * 1000
  })
}

export function getExamUrgencyColor(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 3) return "var(--danger)"
  if (diffDays <= 7) return "var(--accent)"
  return "var(--text-3)"
}
