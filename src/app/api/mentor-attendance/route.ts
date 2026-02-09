import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint calculates attendance for all mentors based on completed classes

export async function POST() {
  try {
    // No auth required - this is called from authenticated frontend

    // Initialize Supabase clients
    const supabaseMain = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    console.log('=== MENTOR ATTENDANCE CALCULATION STARTED ===')

    // Step 1: Get all mentors from Mentor Details table
    const { data: mentors, error: mentorsError } = await supabaseB
      .from('Mentor Details')
      .select('mentor_id, Name, "Email address"')
    
    if (mentorsError || !mentors || mentors.length === 0) {
      console.error('Error fetching mentors:', mentorsError)
      return NextResponse.json({ 
        error: 'Failed to fetch mentors',
        details: mentorsError?.message 
      }, { status: 500 })
    }

    console.log(`Found ${mentors.length} mentors to process`)

    // Step 2: Get all cohort schedule tables dynamically
    const { data: tables, error: tablesError } = await supabaseB.rpc('get_schedule_tables')
    
    let cohortTables: string[] = []
    if (tablesError || !tables) {
      console.log('RPC not available, cannot get schedule tables')
      return NextResponse.json({ 
        error: 'Failed to get schedule tables. Please ensure get_schedule_tables RPC exists.',
        details: tablesError?.message 
      }, { status: 500 })
    } else {
      cohortTables = tables.map((row: any) => row.table_name)
    }

    console.log(`Found ${cohortTables.length} cohort tables:`, cohortTables)

    // Step 3: Process each mentor
    const results: any[] = []

    for (const mentor of mentors) {
      const mentorId = mentor.mentor_id
      const mentorName = mentor.Name || 'Unknown'
      const mentorEmail = mentor['Email address'] || null

      console.log(`\nProcessing mentor: ${mentorName} (ID: ${mentorId})`)

      let totalCompletedClasses = 0
      let presentCount = 0
      let absentCount = 0
      let specialAttendance = 0  // Classes taken on behalf of other mentors

      // Get today's date for comparison (to identify past classes)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      // Search all cohort tables for this mentor's assigned classes
      for (const tableName of cohortTables) {
        try {
          // Get all classes assigned to this mentor that are completed (have session_recording)
          const { data: classes, error: classesError } = await supabaseB
            .from(tableName)
            .select('id, date, mentor_id, swapped_mentor_id, session_recording')
            .eq('mentor_id', mentorId)
            .not('session_recording', 'is', null)
            .neq('session_recording', '')

          if (classesError) {
            console.log(`  Error querying ${tableName}:`, classesError.message)
            continue
          }

          if (classes && classes.length > 0) {
            console.log(`  Found ${classes.length} assigned completed classes in ${tableName}`)

            for (const cls of classes) {
              totalCompletedClasses++

              // Check if swapped_mentor_id is present
              if (cls.swapped_mentor_id !== null && cls.swapped_mentor_id !== undefined) {
                // Swapped mentor took the class = original mentor was absent
                absentCount++
                console.log(`    Class ${cls.id}: ABSENT (swapped to mentor ${cls.swapped_mentor_id})`)
              } else {
                // No swap = original mentor was present
                presentCount++
                console.log(`    Class ${cls.id}: PRESENT`)
              }
            }
          }

          // NEW: Get past classes with NO recording - mentor did nothing (absent)
          // These are classes assigned to this mentor, date is in the past, no recording, no swap
          const { data: missedClasses, error: missedError } = await supabaseB
            .from(tableName)
            .select('id, date, mentor_id, swapped_mentor_id, session_recording')
            .eq('mentor_id', mentorId)
            .lt('date', todayStr)  // Only past classes
            .or('session_recording.is.null,session_recording.eq.')  // No recording

          if (!missedError && missedClasses && missedClasses.length > 0) {
            // Filter out classes that were swapped (those are handled differently)
            const trulyMissedClasses = missedClasses.filter(cls => 
              cls.swapped_mentor_id === null || cls.swapped_mentor_id === undefined
            )
            
            if (trulyMissedClasses.length > 0) {
              console.log(`  Found ${trulyMissedClasses.length} MISSED classes in ${tableName} (no recording, no swap)`)
              
              for (const cls of trulyMissedClasses) {
                totalCompletedClasses++
                absentCount++
                console.log(`    Class ${cls.id} (date: ${cls.date}): ABSENT (no action taken - class missed)`)
              }
            }
          }

          // Also check for special attendance: classes where this mentor is the swapped mentor
          // (they took someone else's class)
          const { data: swappedClasses, error: swappedError } = await supabaseB
            .from(tableName)
            .select('id, mentor_id, swapped_mentor_id, session_recording')
            .eq('swapped_mentor_id', mentorId)
            .not('session_recording', 'is', null)
            .neq('session_recording', '')

          if (!swappedError && swappedClasses && swappedClasses.length > 0) {
            console.log(`  Found ${swappedClasses.length} SPECIAL classes in ${tableName} (took for other mentors)`)
            specialAttendance += swappedClasses.length
            
            for (const cls of swappedClasses) {
              console.log(`    Class ${cls.id}: SPECIAL (covered for mentor ${cls.mentor_id})`)
            }
          }

        } catch (err: any) {
          console.log(`  Error processing ${tableName}:`, err.message)
        }
      }

      // Calculate attendance percentage (special attendance not included in %)
      const attendancePercent = totalCompletedClasses > 0 
        ? Math.round((presentCount / totalCompletedClasses) * 100 * 100) / 100 
        : 0

      console.log(`  Summary for ${mentorName}: Total=${totalCompletedClasses}, Present=${presentCount}, Absent=${absentCount}, Special=${specialAttendance}, Attendance=${attendancePercent}%`)

      // Step 4: Save to Mentor attendance table in main DB
      const { error: upsertError } = await supabaseMain
        .from('mentor_attendance')
        .upsert({
          mentor_id: mentorId,
          name: mentorName,
          email: mentorEmail,
          total_classes: totalCompletedClasses,
          present: presentCount,
          absent: absentCount,
          special_attendance: specialAttendance,
          attendance_percent: attendancePercent,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'mentor_id'
        })

      if (upsertError) {
        console.error(`  Error saving attendance for ${mentorName}:`, upsertError.message)
      } else {
        console.log(`  ✅ Saved attendance for ${mentorName}`)
      }

      results.push({
        mentor_id: mentorId,
        name: mentorName,
        email: mentorEmail,
        total_classes: totalCompletedClasses,
        present: presentCount,
        absent: absentCount,
        special_attendance: specialAttendance,
        attendance_percent: attendancePercent
      })
    }

    console.log('\n=== MENTOR ATTENDANCE CALCULATION COMPLETED ===')

    return NextResponse.json({
      success: true,
      message: `Processed ${mentors.length} mentors`,
      results
    })

  } catch (error: any) {
    console.error('Error calculating mentor attendance:', error)
    return NextResponse.json({ 
      error: 'Failed to calculate mentor attendance',
      details: error.message 
    }, { status: 500 })
  }
}

// GET endpoint to fetch current attendance data or monthly breakdown
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const monthly = searchParams.get('monthly')

    const supabaseMain = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    // If monthly breakdown requested
    if (monthly === 'true' && year) {
      console.log(`=== MONTHLY ATTENDANCE FOR YEAR ${year} ===`)

      // Get all mentors
      const { data: mentors, error: mentorsError } = await supabaseB
        .from('Mentor Details')
        .select('mentor_id, Name, "Email address"')
      
      if (mentorsError || !mentors) {
        return NextResponse.json({ error: 'Failed to fetch mentors' }, { status: 500 })
      }

      // Get all cohort tables
      const { data: tables, error: tablesError } = await supabaseB.rpc('get_schedule_tables')
      
      if (tablesError || !tables) {
        return NextResponse.json({ error: 'Failed to get schedule tables' }, { status: 500 })
      }

      const cohortTables = tables.map((row: any) => row.table_name)

      // Process each mentor's monthly data
      const monthlyData: any[] = []
      const allMonths = new Set<string>()

      // Get today's date for comparison (to identify past classes)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      for (const mentor of mentors) {
        const mentorId = mentor.mentor_id
        const mentorName = mentor.Name || 'Unknown'

        // Monthly breakdown: { 'Jan': { self: 2, special: 1, missed: 0 }, 'Feb': { self: 3, special: 0, missed: 1 } }
        const monthBreakdown: Record<string, { self: number; special: number; missed: number }> = {}

        for (const tableName of cohortTables) {
          try {
            // Get all completed classes for this mentor in the given year
            const { data: classes, error: classesError } = await supabaseB
              .from(tableName)
              .select('id, date, mentor_id, swapped_mentor_id, session_recording')
              .eq('mentor_id', mentorId)
              .not('session_recording', 'is', null)
              .neq('session_recording', '')
              .gte('date', `${year}-01-01`)
              .lte('date', `${year}-12-31`)

            if (!classesError && classes) {
              for (const cls of classes) {
                if (!cls.date) continue
                
                const date = new Date(cls.date + 'T12:00:00')
                const monthKey = date.toLocaleString('en-US', { month: 'short' })
                allMonths.add(monthKey)

                if (!monthBreakdown[monthKey]) {
                  monthBreakdown[monthKey] = { self: 0, special: 0, missed: 0 }
                }

                // If no swap, mentor was present (self)
                if (cls.swapped_mentor_id === null || cls.swapped_mentor_id === undefined) {
                  monthBreakdown[monthKey].self++
                }
                // If swapped, this mentor was absent for this class (don't count in self)
              }
            }

            // Check for missed classes (past classes with no recording and no swap)
            const { data: missedClasses, error: missedError } = await supabaseB
              .from(tableName)
              .select('id, date, mentor_id, swapped_mentor_id, session_recording')
              .eq('mentor_id', mentorId)
              .lt('date', todayStr)  // Only past classes
              .gte('date', `${year}-01-01`)
              .lte('date', `${year}-12-31`)
              .or('session_recording.is.null,session_recording.eq.')  // No recording

            if (!missedError && missedClasses) {
              // Filter out classes that were swapped (those are handled differently)
              const trulyMissedClasses = missedClasses.filter(cls => 
                cls.swapped_mentor_id === null || cls.swapped_mentor_id === undefined
              )

              for (const cls of trulyMissedClasses) {
                if (!cls.date) continue
                
                const date = new Date(cls.date + 'T12:00:00')
                const monthKey = date.toLocaleString('en-US', { month: 'short' })
                allMonths.add(monthKey)

                if (!monthBreakdown[monthKey]) {
                  monthBreakdown[monthKey] = { self: 0, special: 0, missed: 0 }
                }

                monthBreakdown[monthKey].missed++
              }
            }

            // Check for special classes (where this mentor covered for someone else)
            const { data: swappedClasses, error: swappedError } = await supabaseB
              .from(tableName)
              .select('id, date, mentor_id, swapped_mentor_id, session_recording')
              .eq('swapped_mentor_id', mentorId)
              .not('session_recording', 'is', null)
              .neq('session_recording', '')
              .gte('date', `${year}-01-01`)
              .lte('date', `${year}-12-31`)

            if (!swappedError && swappedClasses) {
              for (const cls of swappedClasses) {
                if (!cls.date) continue
                
                const date = new Date(cls.date + 'T12:00:00')
                const monthKey = date.toLocaleString('en-US', { month: 'short' })
                allMonths.add(monthKey)

                if (!monthBreakdown[monthKey]) {
                  monthBreakdown[monthKey] = { self: 0, special: 0, missed: 0 }
                }

                monthBreakdown[monthKey].special++
              }
            }

          } catch (err: any) {
            console.log(`Error processing ${tableName}:`, err.message)
          }
        }

        // Only add mentors with data
        if (Object.keys(monthBreakdown).length > 0) {
          monthlyData.push({
            mentor_id: mentorId,
            name: mentorName,
            months: monthBreakdown
          })
        }
      }

      // Sort months chronologically
      const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const sortedMonths = Array.from(allMonths).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))

      console.log(`Found data for ${monthlyData.length} mentors across ${sortedMonths.length} months`)

      return NextResponse.json({
        success: true,
        year,
        months: sortedMonths,
        data: monthlyData
      })
    }

    // Default: fetch overall attendance data
    const { data, error } = await supabaseMain
      .from('mentor_attendance')
      .select('*')
      .order('attendance_percent', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      data 
    })

  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 })
  }
}

