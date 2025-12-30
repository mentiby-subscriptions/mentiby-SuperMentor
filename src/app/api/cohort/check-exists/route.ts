import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tableName = searchParams.get('tableName')

    if (!tableName) {
      return NextResponse.json(
        { error: 'Table name is required' },
        { status: 400 }
      )
    }

    // Create supabase client for Database B
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Try to query the table - if it exists, we'll get data or empty array
    // If it doesn't exist, we'll get an error
    const { data, error } = await supabaseB
      .from(tableName)
      .select('id')
      .limit(1)

    if (error) {
      // Table doesn't exist (PGRST205 = table not in schema cache, 42P01 = relation does not exist)
      // This is expected behavior when checking for non-existent tables
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message.includes('does not exist')) {
        return NextResponse.json({ exists: false })
      }
      // Only log unexpected errors
      console.error('Unexpected error checking table:', error)
      return NextResponse.json({ exists: false })
    }

    // Table exists (even if empty)
    return NextResponse.json({ exists: true })

  } catch (error: any) {
    console.error('Error checking cohort existence:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

