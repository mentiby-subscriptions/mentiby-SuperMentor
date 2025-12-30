import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { tableName, sessionIds, updates } = await request.json()

    if (!tableName || !sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json({ error: 'tableName and sessionIds are required' }, { status: 400 })
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'At least one update field is required' }, { status: 400 })
    }

    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Update all selected sessions with the new values
    const { data, error } = await supabaseB
      .from(tableName)
      .update(updates)
      .in('id', sessionIds)
      .select()

    if (error) {
      console.error('Error bulk updating sessions:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      updatedCount: data?.length || 0,
      message: `Successfully updated ${data?.length || 0} sessions`
    })

  } catch (error: any) {
    console.error('Unexpected error in bulk update:', error)
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 })
  }
}

