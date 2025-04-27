import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAI from 'openai';
import { decrypt } from '@/lib/encryption'; // Ensure correct path

// Helper function to get decrypted keys (using the authenticated user object)
async function getDecryptedCredentials(user) { // Changed signature: accept user object
    if (!user?.user_metadata) { // Check if metadata exists on the passed user object
        console.error(`[API Playground] User object missing user_metadata.`);
        return { error: "Could not access user credentials info." };
    }
    
    const metadata = user.user_metadata; // Access metadata directly
    let openaiKey = null;
    let fireworksKey = null;
    let fireworksAccountId = null;
    
    try {
        if (metadata.encrypted_openai_api_key) {
            console.log(`[API Playground] Attempting to decrypt OpenAI key for user ${user.id}...`);
            openaiKey = decrypt(metadata.encrypted_openai_api_key);
            console.log(`[API Playground] OpenAI key decrypted successfully.`);
        }
        if (metadata.encrypted_fireworks_api_key) {
            console.log(`[API Playground] Attempting to decrypt Fireworks key for user ${user.id}...`);
            fireworksKey = decrypt(metadata.encrypted_fireworks_api_key);
            console.log(`[API Playground] Fireworks key decrypted successfully.`);
        }
        if (metadata.encrypted_fireworks_account_id) {
            console.log(`[API Playground] Attempting to decrypt Fireworks Account ID for user ${user.id}...`);
            fireworksAccountId = decrypt(metadata.encrypted_fireworks_account_id);
            console.log(`[API Playground] Fireworks Account ID decrypted successfully.`);
        }
    } catch (decryptError) {
        console.error(`[API Playground] Decryption failed for user ${user.id}:`, decryptError);
        return { error: "Failed to process stored credentials." };
    }
    
    return { openaiKey, fireworksKey, fireworksAccountId };
}

export async function POST(request) {
    console.log('[API Playground] Received POST request');
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let userId = 'unknown';

    try {
        // 1. Authenticate User
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.warn('[API Playground] Unauthorized attempt.');
            return new NextResponse('Unauthorized', { status: 401 });
        }
        userId = user.id;
        console.log(`[API Playground] Authenticated user: ${userId}`);

        // 2. Get Request Body
        const { modelId, provider, prompt } = await request.json();
        if (!modelId || !provider || !prompt) {
            return new NextResponse('Missing required fields: modelId, provider, prompt', { status: 400 });
        }
        console.log(`[API Playground] Request for model: ${modelId}, provider: ${provider}`);

        // 3. Get Decrypted Credentials (pass the user object)
        const { openaiKey, fireworksKey, fireworksAccountId, error: credentialError } = await getDecryptedCredentials(user);
        if (credentialError) {
            return new NextResponse(credentialError, { status: 500 });
        }

        let responseText = '';
        let apiError = null;

        // 4. Call Appropriate Provider API
        if (provider === 'openai') {
            if (!openaiKey) {
                return new NextResponse('OpenAI API key not configured for this user.', { status: 403 });
            }
            try {
                const openai = new OpenAI({ apiKey: openaiKey });
                const chatCompletion = await openai.chat.completions.create({
                    model: modelId,
                    messages: [{ role: "user", content: prompt }],
                    // Add other parameters like max_tokens if needed
                });
                responseText = chatCompletion.choices[0]?.message?.content || 'No response content.';
            } catch (err) {
                console.error(`[API Playground] OpenAI API error for user ${userId}:`, err);
                apiError = err.message || 'OpenAI API request failed';
            }
        } else if (provider === 'fireworks') {
            if (!fireworksKey || !fireworksAccountId) {
                return new NextResponse('Fireworks API key or Account ID not configured for this user.', { status: 403 });
            }
            try {
                const fireworksUrl = 'https://api.fireworks.ai/inference/v1/chat/completions';
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${fireworksKey}`
                };
                const body = JSON.stringify({
                    model: modelId,
                    messages: [{ role: "user", content: prompt }],
                    // Add other parameters like max_tokens if needed
                });
                
                console.log(`[API Playground] Calling Fireworks: ${fireworksUrl} with model ${modelId}`);
                const fwResponse = await fetch(fireworksUrl, { method: 'POST', headers, body });
                
                if (!fwResponse.ok) {
                    const errorText = await fwResponse.text(); // Read error as text
                    console.error(`[API Playground] Fireworks API error response (Status: ${fwResponse.status}): ${errorText}`);
                    throw new Error(`Fireworks API failed with status ${fwResponse.status}: ${errorText}`);
                }
                
                const fwResult = await fwResponse.json();
                console.log(`[API Playground] Fireworks API success response:`, fwResult);
                
                responseText = fwResult.choices[0]?.message?.content || 'No response content.';
            } catch (err) {
                console.error(`[API Playground] Fireworks API error for user ${userId}:`, err);
                apiError = err.message || 'Fireworks API request failed';
            }
        } else {
            return new NextResponse('Unsupported provider specified', { status: 400 });
        }

        // 5. Return Response or Error
        if (apiError) {
            return new NextResponse(JSON.stringify({ message: apiError }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        console.log(`[API Playground] Successfully received response from ${provider} for user ${userId}.`);
        return NextResponse.json({ responseText });

    } catch (error) {
        console.error(`[API Playground] General Error for user ${userId}:`, error);
        if (error instanceof SyntaxError) { return new NextResponse('Invalid JSON', { status: 400 }); }
        return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
    }
} 