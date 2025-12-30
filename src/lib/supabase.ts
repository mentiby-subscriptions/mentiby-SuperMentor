import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabaseUrlB = process.env.NEXT_PUBLIC_SUPABASE_URL_B!
const supabaseKeyB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_B!

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables')
}

if (!supabaseUrlB || !supabaseKeyB) {
  throw new Error('Missing Supabase B environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey) 
export const supabaseB = createClient(supabaseUrlB, supabaseKeyB) 