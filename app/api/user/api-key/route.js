import { NextResponse } from 'next/server';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
// Use path alias for lib import
import { encrypt, decrypt } from '@/lib/encryption';

// Helper function to validate OpenAI Key (Optional but Recommended)
async function validateOpenAIKey(apiKey) {
  try {
    console.log('[API_KEY_VALIDATE] Attempting to validate OpenAI key...');
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      // Log detailed error if possible
      let errorBody = 'Unknown validation error';
      try { errorBody = await response.text(); } catch(e){}
      console.warn(`[API_KEY_VALIDATE] OpenAI key validation failed: ${response.status}`, errorBody);
      return false; // Key is invalid if API call fails (e.g., 401 Unauthorized)
    }
    console.log('[API_KEY_VALIDATE] OpenAI key validation successful.');
    return true;
  } catch (error) {
    console.error('[API_KEY_VALIDATE] Error during OpenAI key validation check:', error);
    // Decide if you want to allow saving even if validation fails (e.g., network issue)
    // Returning true allows saving despite check failure, false prevents it.
    return false; // Let's be strict: if validation check fails, don't save.
  }
}

// POST saves the OpenAI key to user_metadata
export async function POST(request) {
  console.log("POST /api/user/api-key called");
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[API_KEY_SET] Auth error:", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    userId = user.id;

    // 2. Get raw API key from request body
    const { apiKey } = await request.json();
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk-')) { 
      return new NextResponse('Invalid API key provided. Must start with \'sk-\'.', { status: 400 });
    }

    // 3. Validate the key with OpenAI API (Optional but Recommended)
    const isValid = await validateOpenAIKey(apiKey);
    if (!isValid) {
        return new NextResponse('Invalid OpenAI API key. Please check the key and try again.', { status: 400 });
    }

    // 4. Encrypt the valid key
    let encryptedKey;
    try {
        encryptedKey = encrypt(apiKey);
    } catch (encError) {
        console.error(`[API_KEY_SET] Encryption failed for user ${userId}:`, encError);
        return new NextResponse("Failed to secure API key.", { status: 500 });
    }

    // 5. Save encrypted key to user_metadata
    console.log(`[API_KEY_SET] Attempting to update user_metadata for user ${userId}`);
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata, // Spread existing metadata
        encrypted_openai_api_key: encryptedKey,
      }
    });

    if (updateError) {
      console.error(`[API_KEY_SET] Failed to update metadata for user ${userId}:`, updateError);
      throw new Error(`Failed to save API key: ${updateError.message}`);
    }

    console.log(`[API_KEY_SET] Successfully saved encrypted OpenAI key in user_metadata for user ${userId}`);
    return NextResponse.json({ message: "API key saved successfully." }, { status: 200 });

  } catch (error) {
    console.error(`[API_KEY_SET] General Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) {
      return new NextResponse("Invalid JSON format", { status: 400 });
    }
    // Provide specific error if validation failed
    if (error.message.includes('Invalid OpenAI API key')) {
        return new NextResponse(error.message, { status: 400 });
    }
    return new NextResponse(error.message || "Internal Server Error", { status: 500 });
  }
}

// GET checks if the key exists in user_metadata
export async function GET(request) {
    console.log("GET /api/user/api-key called (check if key exists in metadata)");
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        const userId = user.id;

        // 2. Check user_metadata for the key
        const hasApiKey = !!user.user_metadata?.encrypted_openai_api_key;
        
        console.log(`[API_KEY_CHECK] User ${userId} has OpenAI key stored in metadata: ${hasApiKey}`);
        return NextResponse.json({ hasApiKey: hasApiKey });

    } catch (error) {
        console.error("[API_KEY_CHECK] General Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

// DELETE removes the key from user_metadata by setting it to null
export async function DELETE(request) {
    console.log("DELETE /api/user/api-key called (set metadata key to null)");
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let userId = 'unknown';
    try {
        // 1. Authenticate user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        userId = user.id;

        // 2. Check if key exists before attempting removal
        if (!user.user_metadata?.encrypted_openai_api_key) {
            console.log(`[API_KEY_DELETE] No OpenAI key found in metadata to delete for user ${userId}`);
            return new NextResponse('No OpenAI API key found to remove.', { status: 404 });
        }

        // 3. Update user metadata, setting the key to null
        const { error: updateError } = await supabase.auth.updateUser({
            data: { 
                ...user.user_metadata,
                encrypted_openai_api_key: null // Set to null to remove
            }
        });

        if (updateError) {
            console.error(`[API_KEY_DELETE] Failed to update metadata for user ${userId}:`, updateError);
            throw new Error(`Failed to remove API key: ${updateError.message}`);
        }

        console.log(`[API_KEY_DELETE] OpenAI key set to null in metadata successfully for user ${userId}`);
        return NextResponse.json({ message: "API key removed successfully." }, { status: 200 });

    } catch (error) {
        console.error(`[API_KEY_DELETE] General Error for user ${userId}:`, error);
        return new NextResponse(error.message || "Internal Server Error", { status: 500 });
    }
} 