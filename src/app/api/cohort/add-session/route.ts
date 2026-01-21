import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      tableName,
      week_number,
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

    if (!tableName || !week_number || !date) {
      return NextResponse.json({ error: 'tableName, week_number, and date are required' }, { status: 400 })
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

    // Get the max ID to determine new ID
    const { data: existingData, error: fetchError } = await supabaseB
      .from(tableName)
      .select('id')
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

    // Insert the new session with temporary week/session numbers (will be recalculated)
    const { data: insertedData, error: insertError } = await supabaseB
      .from(tableName)
      .insert({
        id: newId,
        week_number: 999, // Temporary, will be recalculated
        session_number: 999, // Temporary, will be recalculated
        date: date,
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
        email_sent: false,
        whatsapp_sent: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting session:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // ============================================
    // RECALCULATE ALL WEEK AND SESSION NUMBERS
    // ============================================
    
    // Fetch ALL sessions and sort by date
    const { data: allSessions, error: allFetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .order('date', { ascending: true })

    if (allFetchError) {
      console.error('Error fetching all sessions for reordering:', allFetchError)
      return NextResponse.json({ error: allFetchError.message }, { status: 500 })
    }

    if (!allSessions || allSessions.length === 0) {
      return NextResponse.json({ 
        success: true, 
        session: insertedData,
        message: `Session added to Week ${week_number}` 
      })
    }

    // Helper function to get ISO week number
    const getISOWeekNumber = (dateStr: string): number => {
      const date = new Date(dateStr + 'T12:00:00')
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    }

    // Get the first session's date to determine week 1
    const firstSessionDate = allSessions[0].date
    const firstWeekISO = getISOWeekNumber(firstSessionDate)
    const firstYear = new Date(firstSessionDate + 'T12:00:00').getFullYear()

    // Calculate new week and session numbers for all sessions
    const updates: { id: number; week_number: number; session_number: number }[] = []
    const weekSessionCounters: { [key: number]: number } = {}

    for (const session of allSessions) {
      if (!session.date) continue

      const sessionYear = new Date(session.date + 'T12:00:00').getFullYear()
      const sessionWeekISO = getISOWeekNumber(session.date)
      
      // Calculate relative week number (week 1 = first session's week)
      let relativeWeek: number
      if (sessionYear === firstYear) {
        relativeWeek = sessionWeekISO - firstWeekISO + 1
      } else {
        // Handle year boundary
        const weeksInFirstYear = 52
        relativeWeek = (weeksInFirstYear - firstWeekISO + 1) + sessionWeekISO + (sessionYear - firstYear - 1) * 52
      }

      // Ensure positive week number
      if (relativeWeek < 1) relativeWeek = 1

      // Calculate session number within this week
      if (!weekSessionCounters[relativeWeek]) {
        weekSessionCounters[relativeWeek] = 0
      }
      weekSessionCounters[relativeWeek]++

      updates.push({
        id: session.id,
        week_number: relativeWeek,
        session_number: weekSessionCounters[relativeWeek]
      })
    }

    // Apply updates to database
    let updateCount = 0
    for (const update of updates) {
      const { error: updateError } = await supabaseB
        .from(tableName)
        .update({
          week_number: update.week_number,
          session_number: update.session_number
        })
        .eq('id', update.id)

      if (updateError) {
        console.error(`Error updating session ${update.id}:`, updateError)
      } else {
        updateCount++
      }
    }

    // Find the final week/session number for the inserted session
    const finalSession = updates.find(u => u.id === newId)

    console.log(`Add session complete: Reordered ${updateCount} sessions. New session at Week ${finalSession?.week_number}, Session ${finalSession?.session_number}`)

    // ============================================
    // TRIGGER SESSION UPDATE HANDLER
    // ============================================
    // This will create Teams meeting link (if live session) and send notifications
    
    let handlerResult = null
    try {
      // Only trigger if session_type is 'live session' (not contest)
      if (session_type === 'live session') {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        
        const handlerResponse = await fetch(`${baseUrl}/api/cohort/session-update-handler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName,
            sessionId: newId,
            isNewSession: true,
            // Pass dates for potential notifications
            newDate: date,
            newTime: time
          })
        })

        if (handlerResponse.ok) {
          handlerResult = await handlerResponse.json()
          console.log('Session update handler triggered successfully:', handlerResult)
        } else {
          const errorText = await handlerResponse.text()
          console.error('Session update handler failed:', errorText)
        }
      } else {
        console.log('Skipping session update handler - session type is not live session:', session_type)
      }
    } catch (handlerError) {
      console.error('Error triggering session update handler:', handlerError)
      // Don't fail the main operation if handler fails
    }

    return NextResponse.json({ 
      success: true, 
      session: {
        ...insertedData,
        week_number: finalSession?.week_number,
        session_number: finalSession?.session_number
      },
      reorderedCount: updateCount,
      handlerResult,
      message: `Session added at Week ${finalSession?.week_number}, Session ${finalSession?.session_number}` 
    })

  } catch (error: any) {
    console.error('Unexpected error adding session:', error)
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 })
  }
}

