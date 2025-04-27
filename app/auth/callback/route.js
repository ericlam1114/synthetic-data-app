import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  console.log(`[Auth Callback] Received code: ${code ? 'present' : 'missing'}`);

  if (code) {
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    try {
        console.log("[Auth Callback] Exchanging code for session...");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            console.error("[Auth Callback] Error exchanging code:", error);
            // Redirect to an error page or login page with an error message
            return NextResponse.redirect(`${requestUrl.origin}/?error=Could not authenticate user`);
        }
        console.log("[Auth Callback] Code exchange successful. Redirecting to dashboard.");
    } catch (err) {
        console.error("[Auth Callback] Unexpected error during code exchange:", err);
        return NextResponse.redirect(`${requestUrl.origin}/?error=Could not authenticate user`);
    }
  } else {
     console.warn("[Auth Callback] No code found in callback URL.");
     // Redirect to an error page or login page if no code is present
     return NextResponse.redirect(`${requestUrl.origin}/?error=Authentication failed`);
  }

  // Redirect user to Dashboard after successful authentication
  return NextResponse.redirect(`${requestUrl.origin}/dashboard`)
} 