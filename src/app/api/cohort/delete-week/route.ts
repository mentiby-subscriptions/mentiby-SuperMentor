import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tableName, weekNumber } = body

    if (!tableName || weekNumber === undefined) {
      return NextResponse.json(
        { error: 'tableName and weekNumber are required' },
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

    // 1. Get all sessions from the table, ordered
    const { data: allSessions, error: fetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .order('week_number', { ascending: true })
      .order('session_number', { ascending: true })

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Find the sessions for the week being deleted
    const deletedWeekSessions = allSessions?.filter(s => s.week_number === weekNumber) || []
    
    if (deletedWeekSessions.length === 0) {
      return NextResponse.json({ error: 'Week not found' }, { status: 404 })
    }

    // 2. Determine the class pattern (days of week) from existing data
    // Look at the first week to determine the pattern
    const week1Sessions = allSessions?.filter(s => s.week_number === 1) || []
    let classDays: string[] = []
    if (week1Sessions.length >= 2) {
      classDays = week1Sessions.map(s => s.day).filter(Boolean) as string[]
    }

    // 3. Delete the week
    const { error: deleteError } = await supabaseB
      .from(tableName)
      .delete()
      .eq('week_number', weekNumber)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 4. Get sessions after the deleted week
    const sessionsAfter = allSessions?.filter(s => s.week_number > weekNumber) || []

    if (sessionsAfter.length === 0) {
      // No sessions after, just refresh
      return NextResponse.json({ 
        success: true, 
        message: `Week ${weekNumber} deleted. No subsequent weeks to update.`,
        deletedCount: deletedWeekSessions.length
      })
    }

    // 5. Calculate the date shift
    // Find the last session before the deleted week
    const sessionsBefore = allSessions?.filter(s => s.week_number < weekNumber) || []
    let lastSessionBeforeDeleted = sessionsBefore.length > 0 
      ? sessionsBefore.sort((a, b) => {
          const weekDiff = b.week_number - a.week_number
          if (weekDiff !== 0) return weekDiff
          return b.session_number - a.session_number
        })[0]
      : null

    // Find the first session of the deleted week
    const firstDeletedSession = deletedWeekSessions.sort((a, b) => 
      a.session_number - b.session_number
    )[0]

    // Calculate how many days worth of gap the deleted week created
    let daysToShift = 7 // Default: shift by 1 week (7 days)
    if (firstDeletedSession?.date && deletedWeekSessions.length >= 2) {
      // Calculate days between S1 and S2 of the deleted week, then multiply by number of sessions
      const s1Date = new Date(firstDeletedSession.date)
      const lastDeleted = deletedWeekSessions.sort((a, b) => b.session_number - a.session_number)[0]
      if (lastDeleted?.date) {
        const s2Date = new Date(lastDeleted.date)
        daysToShift = Math.ceil((s2Date.getTime() - s1Date.getTime()) / (1000 * 60 * 60 * 24)) + 
          (7 - (Math.ceil((s2Date.getTime() - s1Date.getTime()) / (1000 * 60 * 60 * 24))))
      }
    }

    // 6. Update each session after the deleted week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    for (const session of sessionsAfter) {
      const newWeekNumber = session.week_number - 1
      
      // Calculate new date (shift back by daysToShift)
      let newDate = null
      let newDay = session.day
      
      if (session.date) {
        const oldDate = new Date(session.date)
        oldDate.setDate(oldDate.getDate() - daysToShift)
        newDate = oldDate.toISOString().split('T')[0]
        newDay = dayNames[oldDate.getDay()]
      }

      // Update the session
      const { error: updateError } = await supabaseB
        .from(tableName)
        .update({
          week_number: newWeekNumber,
          date: newDate,
          day: newDay
        })
        .eq('id', session.id)

      if (updateError) {
        console.error(`Error updating session ${session.id}:`, updateError)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Week ${weekNumber} deleted. ${sessionsAfter.length} sessions in subsequent weeks updated.`,
      deletedCount: deletedWeekSessions.length,
      updatedCount: sessionsAfter.length,
      daysShifted: daysToShift
    })

  } catch (error: any) {
    console.error('Error deleting week:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

