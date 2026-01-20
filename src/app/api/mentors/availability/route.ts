import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Check which mentors are available (free) at a given date/time
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { date, time, excludeSessionId, excludeTableName } = body

    if (!date || !time) {
      return NextResponse.json(
        { error: 'date and time are required' },
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

    // Get all mentors
    const { data: allMentors, error: mentorsError } = await supabaseB
      .from('Mentor Details')
      .select('mentor_id')

    if (mentorsError) {
      console.error('Error fetching mentors:', mentorsError)
      return NextResponse.json(
        { error: 'Failed to fetch mentors' },
        { status: 500 }
      )
    }

    const allMentorIds = allMentors?.map(m => m.mentor_id) || []
    const busyMentorIds = new Set<number>()

    // Get all schedule tables
    const { data: tables, error: tablesError } = await supabaseB.rpc('get_schedule_tables')
    
    if (tablesError) {
      console.error('Error fetching schedule tables:', tablesError)
      // If we can't get tables, return all mentors as available
      return NextResponse.json({ freeMentorIds: allMentorIds })
    }

    // Normalize the date for comparison
    const dateStr = typeof date === 'string' ? date.split('T')[0] : date

    // Check each schedule table for conflicts
    for (const table of tables || []) {
      const tableName = table.table_name
      
      try {
        // Query for sessions at the same date and time
        let query = supabaseB
          .from(tableName)
          .select('id, mentor_id, swapped_mentor_id, date, time')
          .eq('time', time)
        
        // Exclude the current session being edited
        if (excludeSessionId && excludeTableName === tableName) {
          query = query.neq('id', excludeSessionId)
        }

        const { data: sessions, error: sessionsError } = await query

        if (sessionsError) {
          console.error(`Error querying ${tableName}:`, sessionsError.message)
          continue
        }

        // Check each session for date match and mentor conflicts
        for (const session of sessions || []) {
          // Normalize session date for comparison
          let sessionDate = session.date
          if (typeof sessionDate === 'string' && sessionDate.includes('T')) {
            sessionDate = sessionDate.split('T')[0]
          }

          // Check if dates match
          if (sessionDate === dateStr) {
            // The mentor taking the class is either swapped_mentor_id (if set) or mentor_id
            const activeMentorId = session.swapped_mentor_id ?? session.mentor_id
            if (activeMentorId) {
              busyMentorIds.add(activeMentorId)
            }
            // The original mentor is also considered busy (they might be expected to be present)
            if (session.mentor_id) {
              busyMentorIds.add(session.mentor_id)
            }
          }
        }
      } catch (err) {
        console.error(`Error checking table ${tableName}:`, err)
      }
    }

    // Filter to get free mentors
    const freeMentorIds = allMentorIds.filter(id => !busyMentorIds.has(id))

    console.log(`Availability check for ${dateStr} ${time}:`)
    console.log(`  Total mentors: ${allMentorIds.length}`)
    console.log(`  Busy mentors: ${busyMentorIds.size}`)
    console.log(`  Free mentors: ${freeMentorIds.length}`)

    return NextResponse.json({ 
      freeMentorIds,
      busyMentorIds: Array.from(busyMentorIds),
      totalMentors: allMentorIds.length
    })

  } catch (error) {
    console.error('Error checking mentor availability:', error)
    return NextResponse.json(
      { error: 'Failed to check mentor availability' },
      { status: 500 }
    )
  }
}
