import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMeetingAttendeeCount } from '@/lib/teams-graph'

// This endpoint fetches all classes from all cohorts with mentor information

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const month = searchParams.get('month') // 1-12, optional

    // Initialize Supabase clients
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    console.log(`=== FETCHING ALL COHORT CLASSES FOR ${year}${month ? `-${month}` : ''} ===`)

    // Step 1: Get all cohort schedule tables
    const { data: tables, error: tablesError } = await supabaseB.rpc('get_schedule_tables')
    
    if (tablesError || !tables) {
      console.error('Error getting schedule tables:', tablesError)
      return NextResponse.json({ 
        error: 'Failed to get schedule tables',
        details: tablesError?.message 
      }, { status: 500 })
    }

    const cohortTables = tables.map((row: any) => row.table_name)
    console.log(`Found ${cohortTables.length} cohort tables:`, cohortTables)

    // Step 2: Get all mentors for mapping
    const { data: mentors, error: mentorsError } = await supabaseB
      .from('Mentor Details')
      .select('mentor_id, Name, "Email address"')

    if (mentorsError) {
      console.error('Error fetching mentors:', mentorsError)
    }

    // Create mentor map for quick lookup
    const mentorMap = new Map<number, { name: string; email: string }>()
    if (mentors) {
      for (const mentor of mentors) {
        mentorMap.set(mentor.mentor_id, {
          name: mentor.Name || 'Unknown',
          email: mentor['Email address'] || ''
        })
      }
    }
    console.log(`Loaded ${mentorMap.size} mentors`)

    // Step 3: Fetch all classes from all cohort tables
    const allClasses: any[] = []
    const allCohorts: { table: string; name: string }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    // Build date range based on year and optional month
    let startDate = `${year}-01-01`
    let endDate = `${year}-12-31`
    
    if (month) {
      const monthNum = parseInt(month)
      const paddedMonth = monthNum.toString().padStart(2, '0')
      startDate = `${year}-${paddedMonth}-01`
      // Get last day of month
      const lastDay = new Date(parseInt(year), monthNum, 0).getDate()
      endDate = `${year}-${paddedMonth}-${lastDay}`
    }

    for (const tableName of cohortTables) {
      try {
        // Skip Basic 1.1 cohort
        if (tableName === 'basic1_1_schedule') {
          console.log(`  Skipping ${tableName} (excluded)`)
          continue
        }

        // Extract cohort name from table name (e.g., "basic1_1_schedule" -> "Basic 1.1 Schedule")
        // Format: <type><number>_<subnumber>_schedule (e.g., basic1_1_schedule, placement2_schedule)
        const withoutSuffix = tableName.replace('_schedule', '')
        
        // Known cohort types
        const cohortTypes = ['basic', 'placement', 'mern', 'fullstack']
        
        let type = ''
        let numberPart = ''
        
        // Find which type this table belongs to
        for (const t of cohortTypes) {
          if (withoutSuffix.startsWith(t)) {
            type = t.charAt(0).toUpperCase() + t.slice(1)
            if (t === 'mern') type = 'MERN' // Special case for MERN
            numberPart = withoutSuffix.slice(t.length)
            break
          }
        }
        
        // Replace underscores with dots in the number part (e.g., "1_1" -> "1.1")
        const formattedNumber = numberPart.replace(/_/g, '.')
        
        const cohortName = formattedNumber ? `${type} ${formattedNumber}` : type

        // Track all cohorts regardless of whether they have classes in this month
        allCohorts.push({
          table: tableName,
          name: cohortName
        })

        const { data: classes, error: classesError } = await supabaseB
          .from(tableName)
          .select('id, week_number, session_number, date, time, day, session_type, subject_type, subject_name, subject_topic, mentor_id, swapped_mentor_id, session_recording, teams_meeting_link')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('time', { ascending: true })

        if (classesError) {
          console.log(`  Error querying ${tableName}:`, classesError.message)
          continue
        }

        if (classes && classes.length > 0) {
          console.log(`  Found ${classes.length} classes in ${tableName}`)

          for (const cls of classes) {
            // Determine the effective mentor (swapped or original)
            const effectiveMentorId = cls.swapped_mentor_id || cls.mentor_id
            const mentorInfo = effectiveMentorId ? mentorMap.get(effectiveMentorId) : null
            const originalMentorInfo = cls.mentor_id ? mentorMap.get(cls.mentor_id) : null

            // Determine attendance status
            let status: 'present' | 'absent' | 'upcoming' | 'unknown' = 'unknown'
            const classDate = cls.date

            if (classDate) {
              if (classDate >= todayStr) {
                // Future or today's class
                status = 'upcoming'
              } else {
                // Past class - check attendance
                const hasRecording = cls.session_recording && cls.session_recording.trim() !== ''
                
                if (hasRecording) {
                  // Class happened
                  if (cls.swapped_mentor_id !== null && cls.swapped_mentor_id !== undefined) {
                    // Original mentor was absent, swapped mentor took it
                    status = 'absent'
                  } else {
                    // Original mentor was present
                    status = 'present'
                  }
                } else {
                  // No recording - mentor missed the class entirely
                  status = 'absent'
                }
              }
            }

            allClasses.push({
              id: cls.id,
              cohort: cohortName,
              cohortTable: tableName,
              weekNumber: cls.week_number,
              sessionNumber: cls.session_number,
              date: cls.date,
              time: cls.time,
              day: cls.day,
              sessionType: cls.session_type,
              subjectType: cls.subject_type,
              subjectName: cls.subject_name,
              subjectTopic: cls.subject_topic,
              mentorId: effectiveMentorId,
              mentorName: mentorInfo?.name || 'Unassigned',
              originalMentorId: cls.mentor_id,
              originalMentorName: originalMentorInfo?.name || 'Unassigned',
              isSwapped: cls.swapped_mentor_id !== null && cls.swapped_mentor_id !== undefined,
              hasRecording: cls.session_recording && cls.session_recording.trim() !== '',
              teamsLink: cls.teams_meeting_link,
              status,
              attendeeCount: null as number | null
            })
          }
        }

      } catch (err: any) {
        console.log(`  Error processing ${tableName}:`, err.message)
      }
    }

    console.log(`=== TOTAL: ${allClasses.length} classes fetched ===`)

    // Fetch Teams attendee count for past classes that have a meeting link (in small parallel batches)
    const pastWithLink = allClasses.filter(
      (c: any) => c.date && c.date < todayStr && c.teamsLink && c.teamsLink.trim() !== ''
    )
    const BATCH = 5
    for (let i = 0; i < pastWithLink.length; i += BATCH) {
      const batch = pastWithLink.slice(i, i + BATCH)
      await Promise.all(
        batch.map(async (c: any) => {
          try {
            const count = await getMeetingAttendeeCount(c.teamsLink)
            c.attendeeCount = count
          } catch {
            c.attendeeCount = null
          }
        })
      )
    }

    // Group classes by date for calendar view
    const classesByDate: Record<string, any[]> = {}
    for (const cls of allClasses) {
      if (cls.date) {
        if (!classesByDate[cls.date]) {
          classesByDate[cls.date] = []
        }
        classesByDate[cls.date].push(cls)
      }
    }

    return NextResponse.json({
      success: true,
      year,
      month: month || null,
      totalClasses: allClasses.length,
      cohorts: cohortTables.length,
      allCohorts,
      classesByDate,
      allClasses
    })

  } catch (error: any) {
    console.error('Error fetching all cohort classes:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch cohort classes',
      details: error.message 
    }, { status: 500 })
  }
}
