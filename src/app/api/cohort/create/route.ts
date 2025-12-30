import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper function to get day of week index (0 = Sunday, 1 = Monday, etc.)
const getDayIndex = (dayName: string): number => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days.indexOf(dayName)
}

// Helper function to calculate date for a session
const calculateSessionDate = (
  startDate: Date,
  weekNumber: number,
  sessionNumber: number,
  day1: string,
  day2: string
): Date | null => {
  // Determine which day this session falls on
  const isDay1 = sessionNumber === 1
  const targetDayName = isDay1 ? day1 : day2
  const targetDayIndex = getDayIndex(targetDayName)
  
  if (targetDayIndex === -1) return null

  const day1Index = getDayIndex(day1)
  const day2Index = getDayIndex(day2)
  const startDayIndex = startDate.getDay()

  // Calculate the date for the first occurrence of each day
  let day1Offset = day1Index - startDayIndex
  if (day1Offset < 0) day1Offset += 7

  let day2Offset = day2Index - startDayIndex
  if (day2Offset < 0) day2Offset += 7

  // Ensure day2 comes after day1 in the week
  if (day2Offset <= day1Offset) {
    day2Offset += 7
  }

  // Calculate the base date for this week
  const weeksToAdd = weekNumber - 1
  const baseOffset = isDay1 ? day1Offset : day2Offset
  const totalDaysToAdd = weeksToAdd * 7 + baseOffset

  const resultDate = new Date(startDate)
  resultDate.setDate(startDate.getDate() + totalDaysToAdd)
  
  return resultDate
}

// Get day name from date
const getDayName = (date: Date): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[date.getDay()]
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { cohortType, cohortNumber, day1, day2, startDate, mentorId } = body

    // Validate inputs
    if (!cohortType || !cohortNumber || !day1 || !day2 || !startDate || !mentorId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create supabase client for Database B with service role key for admin operations
    // All cohort tables are created and stored in Database B
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

    // Determine the source table name based on cohort type
    const sourceTableName = `${cohortType}gen_schedule`
    
    // Fetch data from the gen_schedule table in database B
    const { data: genScheduleData, error: fetchError } = await supabaseB
      .from(sourceTableName)
      .select('*')
      .order('id', { ascending: true })

    if (fetchError) {
      console.error('Error fetching gen_schedule:', fetchError)
      return NextResponse.json(
        { error: `Failed to fetch ${sourceTableName}: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!genScheduleData || genScheduleData.length === 0) {
      return NextResponse.json(
        { error: `No data found in ${sourceTableName}` },
        { status: 404 }
      )
    }

    // Create the new table name (replace dots with underscores)
    const tableName = `${cohortType}${cohortNumber.replace('.', '_')}_schedule`

    // SQL for manual table creation (shown in error messages if needed)
    const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.${tableName} (
  id BIGINT PRIMARY KEY,
  week_number INTEGER,
  session_number INTEGER,
  date DATE,
  time TIME,
  day TEXT,
  session_type TEXT,
  subject_type TEXT,
  subject_name TEXT,
  subject_topic TEXT,
  initial_session_material TEXT,
  session_material TEXT,
  session_recording TEXT,
  mentor_id INTEGER,
  teams_meeting_link TEXT,
  notification_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`

    // Try to create the table using the database function in Database B
    let tableCreated = false
    try {
      const { error: createError } = await supabaseB.rpc('create_cohort_schedule_table', {
        table_name: tableName
      })
      
      if (!createError) {
        tableCreated = true
        console.log(`Table ${tableName} created successfully in Database B`)
        // Wait for PostgREST schema cache to refresh (takes ~2-3 seconds)
        console.log('Waiting for schema cache to refresh...')
        await new Promise(resolve => setTimeout(resolve, 3000))
      } else {
        console.log('RPC function error:', createError.message)
      }
    } catch (rpcError: any) {
      console.log('RPC function not available:', rpcError.message)
    }

    // Transform and prepare data for insertion
    const startDateObj = new Date(startDate)
    const recordsToInsert = genScheduleData.map((record: any) => {
      let sessionDate = null
      let dayName = null

      // Calculate date if week_number and session_number are available
      if (record.week_number && record.session_number) {
        sessionDate = calculateSessionDate(
          startDateObj,
          record.week_number,
          record.session_number,
          day1,
          day2
        )
        
        if (sessionDate) {
          dayName = getDayName(sessionDate)
        }
      }

      // Assign mentor_id only for live sessions
      const isLiveSession = record.session_type?.toLowerCase() === 'live session'

      return {
        id: record.id,
        week_number: record.week_number,
        session_number: record.session_number,
        date: sessionDate ? sessionDate.toISOString().split('T')[0] : null,
        time: '21:00:00', // 9 PM
        day: dayName,
        session_type: record.session_type,
        subject_type: record.subject_type,
        subject_name: record.subject_name,
        subject_topic: record.subject_topic,
        initial_session_material: record.initial_session_material,
        session_material: null,
        session_recording: null,
        mentor_id: isLiveSession ? mentorId : null,
        created_at: new Date().toISOString()
      }
    })

    // Check if table exists in Database B
    const { error: tableCheckError } = await supabaseB
      .from(tableName)
      .select('id')
      .limit(1)

    // If table doesn't exist and we couldn't create it via RPC
    if (tableCheckError && (tableCheckError.message.includes('does not exist') || tableCheckError.code === '42P01')) {
      if (!tableCreated) {
        // Table doesn't exist and RPC function isn't available
        return NextResponse.json(
          { 
            error: `Table ${tableName} does not exist in Database B. You need to set up the database function first.`,
            setupRequired: true,
            setupSQL: `-- Run this SQL in Database B (Mentiby Public Database) SQL Editor ONCE to enable auto table creation:

CREATE OR REPLACE FUNCTION create_cohort_schedule_table(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id BIGINT PRIMARY KEY,
      week_number INTEGER,
      session_number INTEGER,
      date DATE,
      time TIME,
      day TEXT,
      session_type TEXT,
      subject_type TEXT,
      subject_name TEXT,
      subject_topic TEXT,
      initial_session_material TEXT,
      session_material TEXT,
      session_recording TEXT,
      mentor_id INTEGER,
      teams_meeting_link TEXT,
      notification_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )', table_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_cohort_schedule_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_cohort_schedule_table(TEXT) TO service_role;`,
            manualSQL: createTableSQL,
            note: 'Run in Database B (Mentiby Public Database). Option 1: Run the Setup SQL once to enable auto-creation for all future cohorts. Option 2: Run the Manual SQL to create just this table.'
          },
          { status: 400 }
        )
      }
    }

    // Try to delete existing data and insert new data in Database B with retry logic
    const maxRetries = 3
    let lastError: any = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Insert attempt ${attempt}/${maxRetries}...`)
        
        // Delete existing data first (if any)
        await supabaseB
          .from(tableName)
          .delete()
          .gte('id', 0)

        // Insert new data in batches
        const batchSize = 100
        let totalInserted = 0

        for (let i = 0; i < recordsToInsert.length; i += batchSize) {
          const batch = recordsToInsert.slice(i, i + batchSize)
          const { error: insertError } = await supabaseB
            .from(tableName)
            .insert(batch)

          if (insertError) {
            // If schema cache error, throw to trigger retry
            if (insertError.message?.includes('schema cache') || insertError.code === 'PGRST205') {
              throw new Error(`Schema cache not ready: ${insertError.message}`)
            }
            console.error('Error inserting batch:', insertError)
            throw new Error(`Failed to insert data: ${insertError.message}`)
          }

          totalInserted += batch.length
        }

        return NextResponse.json({
          success: true,
          message: `Successfully created ${tableName} schedule`,
          tableName,
          recordsInserted: totalInserted
        })

      } catch (insertError: any) {
        lastError = insertError
        console.error(`Attempt ${attempt} failed:`, insertError.message)
        
        // If schema cache error and not last attempt, wait and retry
        if ((insertError.message?.includes('schema cache') || insertError.message?.includes('PGRST205')) && attempt < maxRetries) {
          console.log(`Waiting 2 seconds before retry...`)
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }
        
        // Check if error is due to table not existing (and not schema cache)
        if (insertError.message?.includes('does not exist') || insertError.message?.includes('relation')) {
          return NextResponse.json(
            { 
              error: `Table ${tableName} needs to be created first in Database B.`,
              setupRequired: true,
              manualSQL: createTableSQL,
              note: 'Please run the SQL in Database B (Mentiby Public Database) SQL editor to create the table.'
            },
            { status: 400 }
          )
        }
        
        // For other errors on last attempt, throw
        if (attempt === maxRetries) {
          throw insertError
        }
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Failed to insert data after retries')

  } catch (error: any) {
    console.error('Error in cohort creation:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred while creating the cohort' },
      { status: 500 }
    )
  }
}

