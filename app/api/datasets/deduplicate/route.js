import { NextResponse } from 'next/server';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// --- Deduplication Logic ---

// Helper to get the key content based on mode (user/assistant/both)
function getDeduplicationKey(data, mode) {
    if (!data || !Array.isArray(data.messages)) return JSON.stringify(data); // Use full object as key if structure invalid

    const userMessage = data.messages.find(m => m?.role === 'user');
    const assistantMessage = data.messages.find(m => m?.role === 'assistant');

    if (mode === 'user' && userMessage?.content) {
        return userMessage.content;
    } else if (mode === 'assistant' && assistantMessage?.content) {
        return assistantMessage.content;
    } else if (mode === 'both' && userMessage?.content && assistantMessage?.content) {
        return userMessage.content + "<SEP>" + assistantMessage.content;
    }
    // Default: use the full object stringified if mode doesn't match or content missing
    return JSON.stringify(data); 
}

// Processes an array of JSON objects for deduplication
function deduplicateJsonArray(dataArray, mode) {
    const seenContent = new Set();
    const results = [];
    let removedCount = 0;

    dataArray.forEach(item => {
        if (typeof item !== 'object' || item === null) return; // Skip non-objects
        const keyContent = getDeduplicationKey(item, mode);
        if (!seenContent.has(keyContent)) {
            seenContent.add(keyContent);
            results.push(item);
        } else {
            removedCount++;
        }
    });

    return { results, removedCount };
}

// Processes a JSONL string for deduplication
function deduplicateJsonlString(content, mode) {
    const lines = content.trim().split('\n');
    const seenContent = new Set();
    const resultLines = [];
    let removedCount = 0;

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        try {
            const data = JSON.parse(line);
            const keyContent = getDeduplicationKey(data, mode);
            if (!seenContent.has(keyContent)) {
                seenContent.add(keyContent);
                resultLines.push(line); // Keep the original line string
            } else {
                removedCount++;
            }
        } catch (e) {
            console.warn(`[API_DEDUPE] Skipping invalid JSON line during JSONL parse: ${line.substring(0, 100)}...`);
            // Optionally keep invalid lines: resultLines.push(line);
        }
    });

    return {
        results: resultLines.join('\n') + (resultLines.length > 0 ? '\n' : ''), // Keep as string, add trailing newline if needed
        removedCount
    };
}

// --- End Deduplication Logic ---

export async function POST(request) {
    console.log("POST /api/datasets/deduplicate called");
    // Create request-specific Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    let userId = 'anonymous'; // Default if auth fails or is skipped
    try {
         // 1. Authentication (Optional)
         try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) userId = user.id;
         } catch (authErr) {
             console.warn("[API_DEDUPE] Auth check failed, proceeding anonymously:", authErr.message);
         }

        // 2. Get content and mode from request body
        const { content, mode } = await request.json(); 
        if (typeof content !== 'string' || !['user', 'assistant', 'both'].includes(mode)) {
            return new NextResponse("Invalid request body: 'content' (string) and 'mode' required.", { status: 400 });
        }

        let results;
        let originalCount = 0;
        let isJsonFormat = false;

        // Try parsing as full JSON first
        try {
            const jsonData = JSON.parse(content);
            if (Array.isArray(jsonData)) {
                console.log(`[API_DEDUPE] Detected JSON array input for user ${userId}.`);
                isJsonFormat = true;
                originalCount = jsonData.length;
                const { results: deduplicatedArray, removedCount } = deduplicateJsonArray(jsonData, mode);
                results = {
                    deduplicatedContent: JSON.stringify(deduplicatedArray, null, 2), // Re-stringify pretty JSON
                    removedCount,
                    originalCount,
                    deduplicatedCount: deduplicatedArray.length
                };
            } else {
                 // It's valid JSON, but not an array - treat as single-line JSONL for simplicity?
                 // Or throw error? For now, fall through to JSONL.
                 console.warn(`[API_DEDUPE] Input is valid JSON but not an array for user ${userId}. Attempting JSONL parse.`);
            }
        } catch (e) {
             // Failed to parse as JSON, assume JSONL
             console.log(`[API_DEDUPE] Failed to parse as JSON, assuming JSONL input for user ${userId}.`);
        }

        // If not processed as JSON, process as JSONL
        if (!isJsonFormat) {
            const lines = content.trim().split('\n').filter(l => l.trim() !== '');
            originalCount = lines.length;
            const { results: deduplicatedString, removedCount } = deduplicateJsonlString(content, mode);
            const deduplicatedCount = deduplicatedString.trim().split('\n').filter(l => l.trim() !== '').length;
            results = {
                 deduplicatedContent: deduplicatedString,
                 removedCount,
                 originalCount,
                 deduplicatedCount
            };
        }
        
        console.log(`[API_DEDUPE] Deduplication (${mode}) for user ${userId} complete. Input: ${originalCount}, Kept: ${results.deduplicatedCount}, Removed: ${results.removedCount}`);

        return NextResponse.json(results);

    } catch (error) {
        console.error(`[API_DEDUPE] General Error for user ${userId}:`, error);
        if (error instanceof SyntaxError && !isJsonFormat) { // Only return 400 if JSONL parse failed
            return new NextResponse("Invalid JSON detected in content lines.", { status: 400 }); 
        }
        return new NextResponse("Internal Server Error during deduplication.", { status: 500 });
    }
} 