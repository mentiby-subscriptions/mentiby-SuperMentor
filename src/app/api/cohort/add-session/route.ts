import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      tableName,
      week_number,
      session_number,
      date,
      time,
      day,
      session_type,
      subject_type,
      subject_name,
      subject_topic,
      initial_session_material,
      session_material,
      session_recording,
      mentor_id,
      teams_meeting_link
    } = body

    if (!tableName || !week_number) {
      return NextResponse.json({ error: 'tableName and week_number are required' }, { status: 400 })
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

    // Get the max ID and session number to determine new values
    const { data: existingData, error: fetchError } = await supabaseB
      .from(tableName)
      .select('id, session_number, week_number')
      .order('id', { ascending: false })
      .limit(1)

    if (fetchError) {
      console.error('Error fetching existing sessions:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Calculate new ID (max ID + 1)
    const newId = existingData && existingData.length > 0 
      ? (existingData[0].id || 0) + 1 
      : 1

    // Get max session number for this specific week
    const { data: weekSessions } = await supabaseB
      .from(tableName)
      .select('session_number')
      .eq('week_number', week_number)
      .order('session_number', { ascending: false })
      .limit(1)

    // Calculate new session number
    const newSessionNumber = session_number || (weekSessions && weekSessions.length > 0 
      ? (weekSessions[0].session_number || 0) + 1 
      : 1)

    // Insert the new session
    const { data: insertedData, error: insertError } = await supabaseB
      .from(tableName)
      .insert({
        id: newId,
        week_number,
        session_number: newSessionNumber,
        date: date || null,
        time: time || null,
        day: day || null,
        session_type: session_type || null,
        subject_type: subject_type || null,
        subject_name: subject_name || null,
        subject_topic: subject_topic || null,
        initial_session_material: initial_session_material || null,
        session_material: session_material || null,
        session_recording: session_recording || null,
        mentor_id: mentor_id || null,
        teams_meeting_link: teams_meeting_link || null,
        notification_sent: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting session:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      session: insertedData,
      message: `Session ${newSessionNumber} added to Week ${week_number}` 
    })

  } catch (error: any) {
    console.error('Unexpected error adding session:', error)
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 })
  }
}

