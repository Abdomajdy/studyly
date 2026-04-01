import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Extracts the authenticated user from request cookies.
 * Uses the same cookie-based auth that @supabase/ssr sets on the client.
 * Returns the user ID if valid, null otherwise.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll() {
          // Read-only in API routes — we don't need to set cookies here
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user.id
}

/** Standard 401 response for unauthorized requests */
export function unauthorizedResponse() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 })
}
