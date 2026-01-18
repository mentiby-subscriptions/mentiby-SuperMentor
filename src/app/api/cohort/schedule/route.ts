import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET - Fetch schedule data
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

    const { data, error } = await supabaseB
      .from(tableName)
      .select('*')
      .order('week_number', { ascending: true })
      .order('session_number', { ascending: true })

    if (error) {
      console.error('Error fetching schedule:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ schedule: data })

  } catch (error: any) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

// PATCH - Update a single cell
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { tableName, id, field, value, oldValue, triggerUpdateHandler = false } = body

    if (!tableName || !id || !field) {
      return NextResponse.json(
        { error: 'tableName, id, and field are required' },
        { status: 400 }
      )
    }

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

    // If updating date or time, first fetch the old values
    let oldSession: any = null
    if ((field === 'date' || field === 'time') && triggerUpdateHandler) {
      const { data: sessionData } = await supabaseB
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single()
      oldSession = sessionData
    }

    const { data, error } = await supabaseB
      .from(tableName)
      .update({ [field]: value })
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating schedule:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // If date or time changed and handler should be triggered, call the session update handler
    if (oldSession && triggerUpdateHandler && (field === 'date' || field === 'time')) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        // Call the session update handler asynchronously
        fetch(`${baseUrl}/api/cohort/session-update-handler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName,
            sessionId: id,
            oldDate: oldSession.date,
            oldTime: oldSession.time,
            newDate: field === 'date' ? value : oldSession.date,
            newTime: field === 'time' ? value : oldSession.time
          })
        }).then(async (res) => {
          if (res.ok) {
            const result = await res.json()
            console.log('Session update handler result:', result)
          }
        }).catch(err => {
          console.error('Failed to call session update handler:', err)
        })
      } catch (handlerError) {
        console.error('Error triggering session update handler:', handlerError)
      }
    }

    return NextResponse.json({ success: true, data })

  } catch (error: any) {
    console.error('Error updating schedule:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

