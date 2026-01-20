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

    // Fields that should trigger the session update handler
    const handlerTriggerFields = ['date', 'time', 'mentor_id', 'swapped_mentor_id', 'subject_name', 'session_type', 'subject_topic']
    const shouldFetchOldSession = handlerTriggerFields.includes(field) && triggerUpdateHandler

    // If updating a field that triggers the handler, first fetch the old values
    let oldSession: any = null
    if (shouldFetchOldSession) {
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

    // If a handler-triggerable field changed, call the session update handler
    if (oldSession && triggerUpdateHandler && handlerTriggerFields.includes(field)) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        
        // Build handler payload based on what changed
        const handlerPayload: any = {
          tableName,
          sessionId: id,
          changedField: field,
          oldValue: oldSession[field],
          newValue: value,
          oldDate: oldSession.date,
          oldTime: oldSession.time,
          newDate: field === 'date' ? value : oldSession.date,
          newTime: field === 'time' ? value : oldSession.time
        }

        // For mentor changes, include mentor IDs
        if (field === 'mentor_id' || field === 'swapped_mentor_id') {
          handlerPayload.oldMentorId = oldSession[field]
          handlerPayload.newMentorId = value
        }

        // For session type changes, include session types
        if (field === 'session_type') {
          handlerPayload.oldSessionType = oldSession.session_type
          handlerPayload.newSessionType = value
        }
        
        // Call the session update handler asynchronously
        fetch(`${baseUrl}/api/cohort/session-update-handler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(handlerPayload)
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

