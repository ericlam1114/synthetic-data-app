import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from '../../../../lib/cryptoUtils'; 

// Helper function to validate the Fireworks API key
async function validateFireworksKey(apiKey) {
  try {
    const response = await fetch('https://api.fireworks.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    
    // Only treat 401 Unauthorized as a definitive validation failure.
    if (response.status === 401) {
      console.warn('[API_FW_KEY_VALIDATE] Fireworks key validation failed (401 Unauthorized).');
      return false;
    }
    // Log other non-OK statuses but don't immediately fail validation for them (e.g., 412, 5xx might be temporary)
    if (!response.ok) {
         console.warn(`[API_FW_KEY_VALIDATE] Fireworks API check returned non-OK status: ${response.status}. Treating as potentially valid unless 401.`);
         // Consider adding more checks here if needed, e.g., check error message body
    }
    
    // Attempt to parse JSON to ensure the endpoint is behaving somewhat normally
    await response.json(); 
    console.log(`[API_FW_KEY_VALIDATE] Fireworks key validation successful (or non-401 error occurred).`);
    return true; // Return true as long as it wasn't 401
  } catch (error) {
    // Also consider JSON parsing errors or network errors as potential issues, but might not be key validity.
    // Let's return true here too, to allow saving, but log the error.
    console.error('[API_FW_KEY_VALIDATE] Error during Fireworks key validation check (could be network/parsing issue, treating as valid for now): ', error);
    return true; 
  }
}

// GET checks if an encrypted key exists for the user
export async function GET(request) {
  const cookieStore = await cookies(); // Added await
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const hasApiKey = !!user.user_metadata?.encrypted_fireworks_api_key;
    return NextResponse.json({ hasApiKey });
  } catch (error) {
    console.error('[API_FW_KEY_GET] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// POST validates, encrypts, and saves a new key
export async function POST(request) {
  const cookieStore = await cookies(); // Added await
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;

    const { apiKey } = await request.json();
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('fw_')) { 
      return new NextResponse('Invalid or missing Fireworks API key format.', { status: 400 });
    }
    
    console.log(`[API_FW_KEY_POST] Received request to save key for user ${userId}`);

    // 1. Validate the key with Fireworks API (now less strict)
    const isValid = await validateFireworksKey(apiKey);
    if (!isValid) {
      // This branch should now only be hit if validateFireworksKey explicitly returned false (e.g., for 401)
      console.warn(`[API_FW_KEY_POST] Validation failed (likely 401) for user ${userId}`);
      return new NextResponse('Invalid Fireworks API key (Unauthorized). Please check the key and try again.', { status: 400 });
    }
    console.log(`[API_FW_KEY_POST] Key considered valid (non-401 response or OK) for user ${userId}`);

    // 2. Encrypt the valid key
    const encryptedKey = encrypt(apiKey);
    console.log(`[API_FW_KEY_POST] Key encrypted for user ${userId}`);

    // 3. Update user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata, 
        encrypted_fireworks_api_key: encryptedKey,
      }
    });

    if (updateError) {
      console.error(`[API_FW_KEY_POST] Failed to update metadata for user ${userId}:`, updateError);
      throw new Error(`Failed to save API key: ${updateError.message}`);
    }
    
    console.log(`[API_FW_KEY_POST] Encrypted key saved successfully for user ${userId}`);
    return new NextResponse('API Key saved successfully.', { status: 200 });

  } catch (error) {
    console.error(`[API_FW_KEY_POST] Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    // Provide a more specific error message back to the client if it's the validation failure
    if (error.message.includes('Invalid Fireworks API key')) {
        return new NextResponse(error.message, { status: 400 });
    }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}

// DELETE removes the encrypted key from user metadata
export async function DELETE(request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[API_FW_KEY_DELETE] Auth error:", authError);
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    
    console.log(`[API_FW_KEY_DELETE] Received request to delete key for user ${userId}`);

    // Check if key exists before attempting removal
    if (!user.user_metadata?.encrypted_fireworks_api_key) {
        console.log(`[API_FW_KEY_DELETE] No Fireworks key found in metadata to delete for user ${userId}`);
        return new NextResponse('No Fireworks API key found to remove.', { status: 404 });
    }
    
    // Update user metadata, setting the Fireworks key field to null
    // Mirroring the working logic from the OpenAI key route
    const { error: updateError } = await supabase.auth.updateUser({
      data: { 
          ...user.user_metadata,
          encrypted_fireworks_api_key: null // Set to null to remove
      }
    });

    if (updateError) {
      console.error(`[API_FW_KEY_DELETE] Failed to update metadata for user ${userId}:`, updateError);
      throw new Error(`Failed to remove API key: ${updateError.message}`);
    }
    
    console.log(`[API_FW_KEY_DELETE] Fireworks key set to null in metadata successfully for user ${userId}`);
    return new NextResponse('API Key removed successfully.', { status: 200 });

  } catch (error) {
    console.error(`[API_FW_KEY_DELETE] Error for user ${userId}:`, error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 