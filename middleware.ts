import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Start with a response that forwards the incoming request headers
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Use your Supabase project URL and publishable key directly
  const url = 'https://rmbjflipducgwydgzvrt.supabase.co';
  const key = 'sb_publishable_SJtZqNdLTnefTXh5SQw8Rw_RERIJFk9';

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith('/dashboard') || path.startsWith('/session') || path.startsWith('/patterns') || path.startsWith('/analytics');

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/dashboard/:path*', '/session/:path*', '/patterns/:path*', '/analytics/:path*'],
};