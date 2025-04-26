// app/api/datasets/route.js
import { NextResponse } from 'next/server';
// Import Supabase helper for Route Handlers
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
// We no longer need the global client here: import { supabase } from '../../../lib/supabaseClient';

export async function GET(request) {
  // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const { data, error } = await supabase
      .from('datasets')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Database query error:", error);
      return new NextResponse(`Database Error: ${error.message}`, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in GET /api/datasets:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request) {
  console.log("POST /api/datasets called");
  
  // --- Add request header logging ---
  console.log("[API_DATASETS_POST] Received request headers:", JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2));
  // --- End request header logging ---

  // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';
  try {
    // --- Environment Variable Check --- 
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
    console.log("[API_DATASETS_POST] ENV CHECK:", {
        supabaseUrlExists: !!supabaseUrl,
        supabaseUrlEndsWith: supabaseUrl ? supabaseUrl.slice(-15) : 'N/A', // Log last 15 chars
        supabaseAnonKeyExists: !!supabaseAnonKey,
        supabaseJwtSecretExists: !!supabaseJwtSecret,
        jwtSecretLengthOk: supabaseJwtSecret ? (Buffer.byteLength(supabaseJwtSecret, 'utf8') > 30) : false // Basic check if secret looks plausible length-wise
    });
    // --- End Environment Variable Check --- 
    
    // --- Detailed Auth Logging --- 
    let sessionData, authErrorData;
    try {
        const { data, error } = await supabase.auth.getUser();
        sessionData = data;
        authErrorData = error;
    } catch (getUserError) {
        console.error("[API_DATASETS_POST] CRITICAL ERROR calling supabase.auth.getUser():", getUserError);
        return new NextResponse("Internal Server Error during authentication check", { status: 500 });
    }
    console.log("[API_DATASETS_POST] Auth Check Result:", { 
        hasUser: !!sessionData?.user, 
        userId: sessionData?.user?.id, 
        authError: authErrorData ? { code: authErrorData.code, message: authErrorData.message } : null 
    });
    // --- End Detailed Auth Logging ---
    
    if (authErrorData || !sessionData?.user) {
      console.error("Authentication failed:", authErrorData?.message || "No user session found");
      // Provide more detail in the 401 response if possible
      const errorDetail = authErrorData?.message || "No valid session found via cookies/token.";
      return new NextResponse(`Unauthorized: ${errorDetail}`, { status: 401 }); 
    }
    userId = sessionData.user.id;

    const body = await request.json();
    const { name, outputKey, fileKey, textKey, format } = body;

    if (!name || !outputKey || !format) {
      console.error("[API_DATASETS_POST] Validation failed. Missing fields.", { name, outputKey, format });
      return new NextResponse("Missing required fields (name, outputKey, format)", { status: 400 });
    }

    console.log(`Saving dataset for user ${userId}: Name=${name}, Format=${format}, OutputKey=${outputKey}`);

    const { data: newDataset, error: dbError } = await supabase
      .from('datasets') 
      .insert([
        {
          user_id: userId,
          name: name,
          output_key: outputKey,
          file_key: fileKey,
          text_key: textKey,
          format: format,
        }
      ])
      .select() 
      .single();

    if (dbError) {
      console.error("[API_DATASETS_POST] Supabase DB Error:", dbError);
      return new NextResponse(`Database Error: ${dbError.message}`, { status: 500 });
    }

    console.log("Dataset saved successfully via Supabase:", newDataset);
    return NextResponse.json(newDataset, { status: 201 });

  } catch (error) {
    console.error(`[API_DATASETS_POST] General Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) {
      return new NextResponse("Invalid JSON format in request body", { status: 400 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(request) {
   // Await cookies() and pass the resolved store
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return new NextResponse("Missing dataset ID", { status: 400 });
    }
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    const { data: dataset, error: fetchError } = await supabase
      .from('datasets')
      .select('id') // Only need id to check ownership
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
      
    if (fetchError || !dataset) {
      // If fetchError is specifically 'PGRST116' (row not found), it means not found or not owned
      if (fetchError && fetchError.code === 'PGRST116') { 
          return new NextResponse("Dataset not found or access denied", { status: 404 });
      }
      // Otherwise, it's a different DB error
      console.error("Error fetching dataset for delete check:", fetchError);
      return new NextResponse(`Error checking dataset: ${fetchError?.message || 'Unknown error'}`, { status: 500 });
    }
    
    const { error: deleteError } = await supabase
      .from('datasets')
      .delete()
      .eq('id', id)
      // No need for user_id check here as we already verified ownership above
      // .eq('user_id', user.id); 
      
    if (deleteError) {
      console.error("Error deleting dataset:", deleteError);
      return new NextResponse(`Error deleting dataset: ${deleteError.message}`, { status: 500 });
    }
    
    return new NextResponse("Dataset deleted successfully", { status: 200 });
  } catch (error) {
    console.error("Error in DELETE /api/datasets:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// --- Add PATCH handler for renaming ---
export async function PATCH(request) {
  console.log("PATCH /api/datasets called");
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  let userId = 'unknown';

  try {
    // --- Authentication ---
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn("[API_DATASETS_PATCH] Unauthorized attempt.", authError);
      return new NextResponse("Unauthorized", { status: 401 });
    }
    userId = user.id;

    // --- Get ID and New Name from Body ---
    const { id: datasetId, name: newName } = await request.json();

    if (!datasetId || !newName || typeof newName !== 'string' || newName.trim() === '') {
      console.error(`[API_DATASETS_PATCH] Validation failed for user ${userId}. Missing or invalid fields.`, { datasetId, newName });
      return new NextResponse("Missing or invalid fields (id, name)", { status: 400 });
    }

    console.log(`[API_DATASETS_PATCH] User ${userId} attempting to rename dataset ${datasetId} to "${newName}"`);

    // --- Update the dataset name in Supabase ---
    // We include user_id in the eq() to ensure the user owns the record they're trying to update
    const { data: updatedDataset, error: dbError } = await supabase
      .from('datasets')
      .update({ name: newName.trim() })
      .eq('id', datasetId)
      .eq('user_id', userId)
      .select()
      .single(); // Use single() to get the updated record back, or null if not found/not owned

    if (dbError) {
        // Check if the error is because the row wasn't found (or didn't match user_id)
        if (dbError.code === 'PGRST116') { // PostgREST error code for "Fetched row returned null"
            console.warn(`[API_DATASETS_PATCH] Dataset not found or not owned by user ${userId}. ID: ${datasetId}`);
            return new NextResponse("Dataset not found or access denied", { status: 404 });
        }
        // Otherwise, it's a different DB error
        console.error(`[API_DATASETS_PATCH] Supabase DB Error for user ${userId}:`, dbError);
        return new NextResponse(`Database Error: ${dbError.message}`, { status: 500 });
    }

    if (!updatedDataset) {
        // This case should theoretically be caught by dbError.code === 'PGRST116', but as a fallback:
        console.warn(`[API_DATASETS_PATCH] Dataset not found or not owned by user ${userId} after update attempt. ID: ${datasetId}`);
        return new NextResponse("Dataset not found or access denied", { status: 404 });
    }

    console.log(`[API_DATASETS_PATCH] Dataset ${datasetId} renamed successfully for user ${userId}.`, updatedDataset);
    return NextResponse.json(updatedDataset, { status: 200 });

  } catch (error) {
    console.error(`[API_DATASETS_PATCH] General Error for user ${userId}:`, error);
    if (error instanceof SyntaxError) {
      return new NextResponse("Invalid JSON format in request body", { status: 400 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
// --- End PATCH handler ---