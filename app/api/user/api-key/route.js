import { NextResponse } from 'next/server';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
// Use path alias for lib import
import { encrypt } from '@/lib/encryption';

export async function POST(request) {
  console.log("POST /api/user/api-key called");
  // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[API_KEY_SET] Auth error:", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const userId = user.id;

    // 2. Get raw API key from request body
    const { apiKey } = await request.json();
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-')) { // Basic validation
      return new NextResponse("Invalid API key provided.", { status: 400 });
    }

    // 3. Encrypt the key
    let encryptedKey;
    try {
        encryptedKey = encrypt(apiKey);
    } catch (encError) {
        console.error(`[API_KEY_SET] Encryption failed for user ${userId}:`, encError);
        return new NextResponse("Failed to secure API key.", { status: 500 });
    }

    // 4. Upsert (insert or update) the encrypted key in the database
    const { error: dbError } = await supabase
      .from('user_api_keys')
      .upsert({
        user_id: userId,
        openai_api_key_encrypted: encryptedKey,
        updated_at: new Date() // Explicitly set updated_at on upsert
      })
      .select(); // Not strictly needed for upsert but good practice

    if (dbError) {
      console.error(`[API_KEY_SET] DB upsert error for user ${userId}:`, dbError);
      return new NextResponse(`Database error saving API key: ${dbError.message}`, { status: 500 });
    }

    console.log(`[API_KEY_SET] Successfully saved/updated API key for user ${userId}`);
    return NextResponse.json({ message: "API key saved successfully." }, { status: 200 });

  } catch (error) {
    console.error("[API_KEY_SET] General Error:", error);
    if (error instanceof SyntaxError) {
      return new NextResponse("Invalid JSON format", { status: 400 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function GET(request) {
    console.log("GET /api/user/api-key called (check if key exists)");
    // Await cookies() and pass the resolved store
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            // Don't log error here, it's expected if user isn't logged in
            return new NextResponse("Unauthorized", { status: 401 });
        }
        const userId = user.id;

        // 2. Check if a key exists for the user
        const { data, error: dbError } = await supabase
            .from('user_api_keys')
            .select('user_id') // Only need to check existence
            .eq('user_id', userId)
            .maybeSingle();

        if (dbError) {
            console.error(`[API_KEY_CHECK] DB check error for user ${userId}:`, dbError);
            return new NextResponse(`Database error: ${dbError.message}`, { status: 500 });
        }

        const hasApiKey = !!data; // True if data is not null/undefined
        console.log(`[API_KEY_CHECK] User ${userId} has API key stored: ${hasApiKey}`);
        return NextResponse.json({ hasApiKey: hasApiKey });

    } catch (error) {
        console.error("[API_KEY_CHECK] General Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export async function DELETE(request) {
    console.log("DELETE /api/user/api-key called");
    // Await cookies() and pass the resolved store
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error("[API_KEY_DELETE] Auth error:", authError);
            return new NextResponse("Unauthorized", { status: 401 });
        }
        const userId = user.id;

        // 2. Delete the key record for the user
        const { error: dbError } = await supabase
            .from('user_api_keys')
            .delete()
            .eq('user_id', userId);

        // Handle potential errors (like key not found, which isn't really an error here)
        if (dbError && dbError.code !== 'PGRST116') { // PGRST116 = row not found
            console.error(`[API_KEY_DELETE] DB delete error for user ${userId}:`, dbError);
            return new NextResponse(`Database error deleting API key: ${dbError.message}`, { status: 500 });
        }

        // Check if a row was actually deleted (optional, count might be 0 if key didn't exist)
        // const { count } = await supabase... // supabase-js v2 doesn't easily return count on delete

        console.log(`[API_KEY_DELETE] Successfully processed delete request for user ${userId}`);
        return NextResponse.json({ message: "API key removed successfully." }, { status: 200 });

    } catch (error) {
        console.error("[API_KEY_DELETE] General Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
} 