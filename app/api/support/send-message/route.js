import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createClient } from 'redis'; // Import Redis client

// --- Rate Limiting Configuration ---
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;  // Max 5 messages per user per minute
const MAX_MESSAGE_LENGTH = 2000;    // Max 2000 characters per message
// -----------------------------------

// --- Initialize Redis Client --- 
// Ensure REDIS_URL is set in your environment variables (e.g., redis://localhost:6379)
let redisClient;
async function getRedisClient() {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.error("[API Send Message] REDIS_URL environment variable not set. Rate limiting disabled.");
            return null; // Return null if Redis is not configured
        }
        redisClient = createClient({ url: redisUrl });
        redisClient.on('error', (err) => console.error('[API Send Message] Redis Client Error', err));
        try {
            await redisClient.connect();
            console.log("[API Send Message] Connected to Redis.");
        } catch (err) {
            console.error("[API Send Message] Failed to connect to Redis:", err);
            redisClient = null; // Set back to null on connection failure
            return null;
        }
    }
    return redisClient;
}
// -----------------------------

export async function POST(request) {
    console.log('[API Send Message] Received POST request');
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    let userId = 'unknown';
    let userEmail = 'unknown';
    const connectedRedisClient = await getRedisClient(); // Get connected client instance

    try {
        // 1. Authenticate User
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.warn('[API Send Message] Unauthorized attempt.');
            return new NextResponse('Unauthorized', { status: 401 });
        }
        userId = user.id;
        userEmail = user.email;
        console.log(`[API Send Message] Authenticated user: ${userId} (${userEmail})`);

        // --- Rate Limiting Check ---
        if (connectedRedisClient) {
            const rateLimitKey = `rate-limit:support-msg:${userId}`;
            try {
                const currentCount = await connectedRedisClient.incr(rateLimitKey);

                if (currentCount === 1) {
                    // First request in window, set expiry
                    await connectedRedisClient.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
                }

                if (currentCount > MAX_REQUESTS_PER_WINDOW) {
                    console.warn(`[API Send Message] Rate limit exceeded for user ${userId}`);
                    return new NextResponse('Too many requests. Please try again later.', { status: 429 });
                }
            } catch (redisError) {
                 console.error(`[API Send Message] Redis rate limiting error for user ${userId}:`, redisError);
                 // Optional: Decide whether to proceed or fail if Redis fails. 
                 // For now, we'll log the error and proceed without rate limiting if Redis errors.
            }
        }
        // ---------------------------

        // 2. Get and Validate Message from Body
        const { message } = await request.json();
        const trimmedMessage = message?.trim(); // Use optional chaining and trim

        if (!trimmedMessage) {
            return new NextResponse('Missing or empty message in request body', { status: 400 });
        }

        if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
             return new NextResponse(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.`, { status: 413 }); // 413 Payload Too Large
        }
        
        // Basic check for suspicious characters (optional, adjust as needed)
        // This is NOT a replacement for proper XSS protection if rendering output
        // const suspiciousChars = /[<>\[\]{}()]/; 
        // if (suspiciousChars.test(trimmedMessage)) {
        //     console.warn(`[API Send Message] Potential suspicious characters in message from user ${userId}`);
             // Decide action: reject, log, or sanitize further
        // }
        
        const recipientEmail = "ericlam1114@gmail.com";

        // 3. Simulate Sending Email (Log details)
        console.log(`-----
SIMULATED EMAIL SEND:
To: ${recipientEmail}
From: ${userEmail} (User ID: ${userId})
Subject: Support Request/Feedback from App
---
Message:
${trimmedMessage}
-----`);

        // In a real implementation, you would integrate with an email service here:
        // e.g., using Resend, SendGrid, AWS SES, or a Supabase Edge Function.
        // await sendEmail({ to: recipientEmail, from: 'support@yourapp.com', subject: '...', text: message });

        // 4. Return Success
        return NextResponse.json({ message: "Message received successfully." });

    } catch (error) {
        console.error(`[API Send Message] General Error for user ${userId}:`, error);
        if (error instanceof SyntaxError) { 
            return new NextResponse(JSON.stringify({ message: 'Invalid request format.' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); 
        }
        // Return a generic error message
        return new NextResponse(JSON.stringify({ message: 'An internal server error occurred.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
} 