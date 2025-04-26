import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Missing Supabase URL or Anon Key in environment variables for client.');
  // Avoid throwing an error that breaks the build, but log it prominently.
  // The application might partially work but auth features relying on this client will fail.
}

// Create and export the client-side Supabase client using the auth helper
export const supabase = createClientComponentClient(
    supabaseUrl, 
    supabaseAnonKey
); 