import { NextResponse } from 'next/server';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// --- Validation Logic ---

// Specific JSONL Validation (OpenAI format focused)
function validateJsonlContent(content) {
    const errors = [];
    const lines = content.trim().split('\n');
    
    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        line = line.trim();
        if (!line) return; // Skip empty lines

        // 1. Check valid JSON
        let data;
        try {
            data = JSON.parse(line);
        } catch (e) {
            errors.push(`Line ${lineNumber}: Invalid JSON - ${e.message}`);
            return; // Skip further checks for this line
        }

        // 2. Check 'messages' key (Common for OpenAI format)
        if (data.messages && !Array.isArray(data.messages)) {
            errors.push(`Line ${lineNumber}: 'messages' must be a list`);
            return;
        } else if (data.messages) {
            // Optional: Add more specific message structure checks if needed
             data.messages.forEach((message, msgIndex) => {
                if (typeof message !== 'object' || message === null) {
                    errors.push(`Line ${lineNumber}: Message ${msgIndex + 1} is not a valid object`);
                    return;
                }
                if (!message.hasOwnProperty('role') || typeof message.role !== 'string') {
                    errors.push(`Line ${lineNumber}: Message ${msgIndex + 1} missing or invalid 'role' key`);
                }
                if (!message.hasOwnProperty('content') || typeof message.content !== 'string') {
                    errors.push(`Line ${lineNumber}: Message ${msgIndex + 1} missing or invalid 'content' key`);
                }
            });
        } else {
            // Allow other top-level structures but maybe warn or add specific checks later
            // errors.push(`Line ${lineNumber}: Missing 'messages' key (standard for OpenAI format)`);
        }
    });

    return errors;
}

// General JSON Validation
function validateJsonContent(content) {
    const errors = [];
    try {
        const data = JSON.parse(content);
        // Add more specific JSON structure checks here if needed
        // For example, check if it's an array of objects:
        if (!Array.isArray(data)) {
            errors.push("Root level should be a JSON array.");
        } else if (data.length > 0 && typeof data[0] !== 'object') {
            errors.push("Array elements should be JSON objects.");
        }
        // Add other checks relevant to your expected JSON structure
    } catch (e) {
        errors.push(`Invalid JSON structure: ${e.message}`);
    }
    return errors;
}

// Basic CSV Validation
function validateCsvContent(content) {
    const errors = [];
    const lines = content.trim().split('\n');
    if (lines.length < 2) {
        errors.push("CSV requires at least a header row and one data row.");
        return errors;
    }
    const headerCount = lines[0].split(',').length;
    if (headerCount === 0) {
         errors.push("CSV header row is empty or invalid.");
         return errors;
    }
    lines.forEach((line, index) => {
        if (index === 0) return; // Skip header
        const lineNumber = index + 1;
        const columnCount = line.split(',').length;
        if (columnCount !== headerCount) {
            errors.push(`Line ${lineNumber}: Expected ${headerCount} columns, but found ${columnCount}.`);
        }
    });
    return errors;
}

// --- End Validation Logic ---

export async function POST(request) {
    console.log("POST /api/datasets/validate called");
    // --- Corrected Auth Setup ---
    const cookieStore = await cookies(); // Added await
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore }); 
    // ---------------------------
    let userId = 'anonymous';
    let format = 'unknown'; // Initialize format here
    try {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) userId = user.id;
        } catch (authErr) {
            console.warn("[API_VALIDATE] Auth check failed, proceeding anonymously:", authErr.message);
        }
        
        // 2. Get content AND format from request body
        const body = await request.json(); 
        const content = body.content;
        format = body.format || 'unknown'; // Assign format from body
        
        if (typeof content !== 'string') {
            return new NextResponse("Invalid request body: 'content' must be a string.", { status: 400 });
        }

        console.log(`[API_VALIDATE] Validating for user ${userId} with format: ${format}`);

        // 3. Perform validation based on format
        let validationErrors = [];
        switch (format.toLowerCase()) {
            case 'jsonl':
            case 'openai-jsonl': // Treat both as JSONL for validation
                validationErrors = validateJsonlContent(content);
                break;
            case 'json':
                validationErrors = validateJsonContent(content);
                break;
            case 'csv':
                validationErrors = validateCsvContent(content);
                break;
            case 'unknown':
                 validationErrors.push("Could not determine file format for validation.");
                 break;
            default:
                console.warn(`[API_VALIDATE] Unsupported format provided: ${format}`);
                validationErrors.push(`Validation for format '${format}' is not supported yet.`);
                break;
        }

        // 4. Return results
        if (validationErrors.length > 0) {
            console.warn(`[API_VALIDATE] Validation failed with ${validationErrors.length} errors for user ${userId} (format: ${format})`);
            return NextResponse.json({ isValid: false, errors: validationErrors }, { status: 200 }); 
        } else {
            console.log(`[API_VALIDATE] Validation successful for user ${userId} (format: ${format}).`);
            return NextResponse.json({ isValid: true, errors: [] });
        }

    } catch (error) {
        // Include format in error logging if available
        console.error(`[API_VALIDATE] General Error for user ${userId} (format: ${format}):`, error);
        if (error instanceof SyntaxError) {
            return new NextResponse("Invalid JSON format in request body", { status: 400 });
        }
        return new NextResponse("Internal Server Error during validation.", { status: 500 });
    }
} 