import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint shifts a class to a new date and reschedules all subsequent classes

const supabaseB = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_B!
)

// Helper to get day name from date
function getDayName(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[date.getDay()]
}

// Helper to get day index (0 = Sunday, 1 = Monday, etc.)
function getDayIndex(dayName: string): number {
  const days: Record<string, number> = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  }
  return days[dayName] ?? -1
}

// Find the next occurrence of any of the given days from a start date
function findNextDay(fromDate: Date, targetDays: number[]): Date {
  const result = new Date(fromDate)
  result.setDate(result.getDate() + 1) // Start from next day
  
  // Find the next occurrence of any target day
  for (let i = 0; i < 7; i++) {
    if (targetDays.includes(result.getDay())) {
      return result
    }
    result.setDate(result.getDate() + 1)
  }
  
  return result // Should never reach here if targetDays has valid entries
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { tableName, sessionId, newDate } = body

    if (!tableName || !sessionId || !newDate) {
      return NextResponse.json({ 
        error: 'Missing required fields: tableName, sessionId, newDate' 
      }, { status: 400 })
    }

    console.log(`\n=== SHIFT CLASS STARTED ===`)
    console.log(`Table: ${tableName}, Session ID: ${sessionId}, New Date: ${newDate}`)

    // Step 1: Get all sessions from the table, ordered by week_number and session_number
    const { data: allSessions, error: fetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .order('week_number', { ascending: true })
      .order('session_number', { ascending: true })

    if (fetchError || !allSessions) {
      console.error('Error fetching sessions:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    console.log(`Found ${allSessions.length} total sessions`)

    // Step 2: Find the session to shift
    const sessionIndex = allSessions.findIndex(s => s.id === sessionId)
    if (sessionIndex === -1) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const sessionToShift = allSessions[sessionIndex]
    console.log(`Shifting session: Week ${sessionToShift.week_number}, Session ${sessionToShift.session_number}`)

    // Check if the new date is the same as current date
    if (sessionToShift.date === newDate) {
      return NextResponse.json({ 
        error: 'New date is the same as current date. No changes needed.' 
      }, { status: 400 })
    }

    // Check if the new date is in the past or today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newDateObj = new Date(newDate + 'T12:00:00')
    if (newDateObj <= today) {
      return NextResponse.json({ 
        error: 'New date must be greater than today. Cannot shift to past or current date.' 
      }, { status: 400 })
    }

    // Step 3: Determine the day pattern from existing sessions
    // Get unique days from the schedule (excluding contests which may have different pattern)
    const regularSessions = allSessions.filter(s => s.session_type !== 'contest')
    const uniqueDays = [...new Set(regularSessions.map(s => s.day))].filter(Boolean)
    const dayPattern = uniqueDays.map(d => getDayIndex(d)).filter(i => i !== -1)
    
    console.log(`Detected day pattern: ${uniqueDays.join(', ')} (indices: ${dayPattern.join(', ')})`)

    // If we couldn't detect a pattern, use a default (Mon, Wed, Fri)
    if (dayPattern.length === 0) {
      dayPattern.push(1, 3, 5) // Monday, Wednesday, Friday
      console.log('Using default pattern: Monday, Wednesday, Friday')
    }

    // Step 4: Parse the new date and calculate updates
    const shiftedDate = new Date(newDate + 'T12:00:00') // Use noon to avoid timezone issues
    const shiftedDay = getDayName(shiftedDate)
    
    console.log(`New date: ${newDate} (${shiftedDay})`)

    // Step 5: Build the updates array
    const updates: Array<{ id: number; date: string; day: string }> = []
    
    // Update the shifted session
    updates.push({
      id: sessionId,
      date: newDate,
      day: shiftedDay
    })

    // Step 6: Reschedule all subsequent sessions
    let currentDate = new Date(shiftedDate)
    
    for (let i = sessionIndex + 1; i < allSessions.length; i++) {
      const session = allSessions[i]
      
      // Skip contests - they follow their own pattern
      if (session.session_type === 'contest') {
        // For contests, just find the next available weekday after current date
        currentDate = findNextDay(currentDate, [1, 2, 3, 4, 5]) // Mon-Fri
      } else {
        // For regular sessions, find the next day in the pattern
        currentDate = findNextDay(currentDate, dayPattern)
      }
      
      const newSessionDate = currentDate.toISOString().split('T')[0]
      const newSessionDay = getDayName(currentDate)
      
      updates.push({
        id: session.id,
        date: newSessionDate,
        day: newSessionDay
      })
      
      console.log(`  Session ${session.week_number}-${session.session_number}: ${session.date} → ${newSessionDate} (${newSessionDay})`)
    }

    console.log(`\nTotal sessions to update: ${updates.length}`)

    // Step 7: Apply all updates in a transaction-like manner
    const errors: string[] = []
    const successfulUpdates: number[] = []

    for (const update of updates) {
      const { error: updateError } = await supabaseB
        .from(tableName)
        .update({ date: update.date, day: update.day })
        .eq('id', update.id)

      if (updateError) {
        console.error(`Failed to update session ${update.id}:`, updateError)
        errors.push(`Session ${update.id}: ${updateError.message}`)
      } else {
        successfulUpdates.push(update.id)
      }
    }

    // Step 8: Recalculate week_number AND session_number based on new dates
    // Get updated sessions sorted by date
    const { data: updatedSessions, error: refetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .order('date', { ascending: true })

    if (!refetchError && updatedSessions && updatedSessions.length > 0) {
      console.log('\n=== Recalculating week and session numbers ===')
      
      // Group sessions by week (7-day periods from first session)
      const firstDate = new Date(updatedSessions[0].date + 'T12:00:00')
      
      // Assign week_number and session_number based on date order
      let currentWeekNumber = 1
      let sessionInWeek = 0
      let weekStartDate = firstDate
      
      for (const session of updatedSessions) {
        const sessionDate = new Date(session.date + 'T12:00:00')
        
        // Calculate days since week start
        const daysSinceWeekStart = Math.floor(
          (sessionDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24)
        )
        
        // If more than 6 days have passed, start a new week
        if (daysSinceWeekStart >= 7) {
          currentWeekNumber++
          sessionInWeek = 0
          // Update week start to this session's date
          weekStartDate = sessionDate
        }
        
        sessionInWeek++
        
        // Update if week_number or session_number changed
        if (session.week_number !== currentWeekNumber || session.session_number !== sessionInWeek) {
          console.log(`  ID ${session.id}: W${session.week_number}-S${session.session_number} → W${currentWeekNumber}-S${sessionInWeek}`)
          
          await supabaseB
            .from(tableName)
            .update({ 
              week_number: currentWeekNumber, 
              session_number: sessionInWeek 
            })
            .eq('id', session.id)
        }
      }
      
      console.log('=== Week/Session recalculation complete ===')
    }

    console.log(`=== SHIFT CLASS COMPLETED ===\n`)

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        message: `Partially updated. ${successfulUpdates.length} succeeded, ${errors.length} failed.`,
        updatedCount: successfulUpdates.length,
        errors
      }, { status: 207 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully shifted class and rescheduled ${updates.length - 1} subsequent classes`,
      updatedCount: updates.length,
      updates: updates.map(u => ({ id: u.id, date: u.date, day: u.day }))
    })

  } catch (error: any) {
    console.error('Error in shift-class:', error)
    return NextResponse.json({ 
      error: 'Failed to shift class',
      details: error.message 
    }, { status: 500 })
  }
}

// GET endpoint to preview the shift without applying
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const tableName = searchParams.get('tableName')
    const sessionId = searchParams.get('sessionId')
    const newDate = searchParams.get('newDate')

    if (!tableName || !sessionId || !newDate) {
      return NextResponse.json({ 
        error: 'Missing required params: tableName, sessionId, newDate' 
      }, { status: 400 })
    }

    // Get all sessions
    const { data: allSessions, error: fetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .order('week_number', { ascending: true })
      .order('session_number', { ascending: true })

    if (fetchError || !allSessions) {
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    // Find the session
    const sessionIndex = allSessions.findIndex(s => s.id === parseInt(sessionId))
    if (sessionIndex === -1) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const sessionToShift = allSessions[sessionIndex]

    // Check if the new date is the same as current date
    if (sessionToShift.date === newDate) {
      return NextResponse.json({ 
        success: false,
        error: 'New date is the same as current date. Please select a different date.' 
      }, { status: 400 })
    }

    // Check if the new date is in the past or today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newDateObj = new Date(newDate + 'T12:00:00')
    if (newDateObj <= today) {
      return NextResponse.json({ 
        success: false,
        error: 'New date must be greater than today. Cannot shift to past or current date.' 
      }, { status: 400 })
    }

    // Determine day pattern
    const regularSessions = allSessions.filter(s => s.session_type !== 'contest')
    const uniqueDays = [...new Set(regularSessions.map(s => s.day))].filter(Boolean)
    const dayPattern = uniqueDays.map(d => getDayIndex(d)).filter(i => i !== -1)
    
    if (dayPattern.length === 0) {
      dayPattern.push(1, 3, 5)
    }

    // Build preview with new dates
    const shiftedDate = new Date(newDate + 'T12:00:00')
    
    // First, calculate all new dates
    const newDates: Array<{ id: number; newDate: string; newDay: string; oldData: any }> = []
    
    // Add the shifted session
    newDates.push({
      id: sessionToShift.id,
      newDate: newDate,
      newDay: getDayName(shiftedDate),
      oldData: sessionToShift
    })

    // Calculate new dates for subsequent sessions
    let currentDate = new Date(shiftedDate)
    
    for (let i = sessionIndex + 1; i < allSessions.length; i++) {
      const session = allSessions[i]
      
      if (session.session_type === 'contest') {
        currentDate = findNextDay(currentDate, [1, 2, 3, 4, 5])
      } else {
        currentDate = findNextDay(currentDate, dayPattern)
      }
      
      newDates.push({
        id: session.id,
        newDate: currentDate.toISOString().split('T')[0],
        newDay: getDayName(currentDate),
        oldData: session
      })
    }

    // Also include sessions BEFORE the shifted one (they stay unchanged)
    const allNewDates = [
      ...allSessions.slice(0, sessionIndex).map(s => ({
        id: s.id,
        newDate: s.date,
        newDay: s.day,
        oldData: s
      })),
      ...newDates
    ]

    // Sort by new date to calculate week/session numbers
    allNewDates.sort((a, b) => new Date(a.newDate).getTime() - new Date(b.newDate).getTime())

    // Calculate new week and session numbers
    const firstDate = new Date(allNewDates[0].newDate + 'T12:00:00')
    let currentWeekNumber = 1
    let sessionInWeek = 0
    let weekStartDate = firstDate

    const preview: Array<{ 
      id: number
      oldWeek: number
      oldSession: number
      newWeek: number
      newSession: number
      session_type: string
      subject_name: string
      oldDate: string
      oldDay: string
      newDate: string
      newDay: string
    }> = []

    for (const item of allNewDates) {
      const sessionDate = new Date(item.newDate + 'T12:00:00')
      
      // Calculate days since week start
      const daysSinceWeekStart = Math.floor(
        (sessionDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      
      // If more than 6 days have passed, start a new week
      if (daysSinceWeekStart >= 7) {
        currentWeekNumber++
        sessionInWeek = 0
        weekStartDate = sessionDate
      }
      
      sessionInWeek++

      // Only include in preview if this session is affected (shifted or after)
      if (item.oldData.id === sessionToShift.id || 
          allSessions.findIndex(s => s.id === item.id) > sessionIndex) {
        preview.push({
          id: item.id,
          oldWeek: item.oldData.week_number,
          oldSession: item.oldData.session_number,
          newWeek: currentWeekNumber,
          newSession: sessionInWeek,
          session_type: item.oldData.session_type,
          subject_name: item.oldData.subject_name,
          oldDate: item.oldData.date,
          oldDay: item.oldData.day,
          newDate: item.newDate,
          newDay: item.newDay
        })
      }
    }

    return NextResponse.json({
      success: true,
      shiftedSession: {
        id: sessionToShift.id,
        week_number: sessionToShift.week_number,
        session_number: sessionToShift.session_number
      },
      affectedCount: preview.length,
      dayPattern: uniqueDays,
      preview
    })

  } catch (error: any) {
    console.error('Error in shift-class preview:', error)
    return NextResponse.json({ 
      error: 'Failed to preview shift',
      details: error.message 
    }, { status: 500 })
  }
}

