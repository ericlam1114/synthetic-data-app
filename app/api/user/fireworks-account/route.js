import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from '../../../../lib/cryptoUtils'; // Adjust path as needed

// GET checks if an encrypted Account ID exists for the user
export async function GET(request) {
  console.log("[API_FW_ACCOUNT] GET called");
  const cookieStore = await cookies(); 
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const hasAccountId = !!user.user_metadata?.encrypted_fireworks_account_id;
    console.log(`[API_FW_ACCOUNT] User ${user.id} has Account ID stored: ${hasAccountId}`);
    return NextResponse.json({ hasAccountId });
  } catch (error) {
    console.error('[API_FW_ACCOUNT_GET] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// POST encrypts and saves a new Account ID
export async function POST(request) {
  console.log("[API_FW_ACCOUNT] POST called");
  const cookieStore = await cookies(); 
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;

    const { accountId } = await request.json();
    // Basic validation - check if it exists and is a non-empty string
    if (!accountId || typeof accountId !== 'string' || accountId.trim().length === 0) { 
      return new NextResponse('Invalid or missing Fireworks Account ID.', { status: 400 });
    }
    
    console.log(`[API_FW_ACCOUNT_POST] Received request to save Account ID for user ${userId}`);

    // Encrypt the Account ID
    const encryptedAccountId = encrypt(accountId.trim());
    console.log(`[API_FW_ACCOUNT_POST] Account ID encrypted for user ${userId}`);

    // Update user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata, 
        encrypted_fireworks_account_id: encryptedAccountId,
      }
    });

    if (updateError) {
      console.error(`[API_FW_ACCOUNT_POST] Failed to update metadata for user ${userId}:`, updateError);
      throw new Error(`Failed to save Account ID: ${updateError.message}`);
    }
    
    console.log(`[API_FW_ACCOUNT_POST] Encrypted Account ID saved successfully for user ${userId}`);
    return new NextResponse('Account ID saved successfully.', { status: 200 });

  } catch (error) {
    console.error(`[API_FW_ACCOUNT_POST] Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}

// DELETE removes the encrypted Account ID from user metadata
export async function DELETE(request) {
  console.log("[API_FW_ACCOUNT] DELETE called");
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    userId = user.id;
    
    console.log(`[API_FW_ACCOUNT_DELETE] Received request to delete Account ID for user ${userId}`);

    // Check if Account ID exists before attempting removal
    if (!user.user_metadata?.encrypted_fireworks_account_id) {
        console.log(`[API_FW_ACCOUNT_DELETE] No Fireworks Account ID found in metadata to delete for user ${userId}`);
        return new NextResponse('No Fireworks Account ID found to remove.', { status: 404 });
    }
    
    // Update user metadata, setting the Account ID field to null
    const { error: updateError } = await supabase.auth.updateUser({
      data: { 
          ...user.user_metadata,
          encrypted_fireworks_account_id: null // Set to null to remove
      }
    });

    if (updateError) {
      console.error(`[API_FW_ACCOUNT_DELETE] Failed to update metadata for user ${userId}:`, updateError);
      throw new Error(`Failed to remove Account ID: ${updateError.message}`);
    }
    
    console.log(`[API_FW_ACCOUNT_DELETE] Fireworks Account ID set to null in metadata successfully for user ${userId}`);
    return new NextResponse('Account ID removed successfully.', { status: 200 });

  } catch (error) {
    console.error(`[API_FW_ACCOUNT_DELETE] Error for user ${userId}:`, error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
} 