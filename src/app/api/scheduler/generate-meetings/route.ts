import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint is called daily (via Vercel Cron) to generate Teams meeting links
// for the next 7 days of classes

const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

// Get access token for MS Graph
async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft credentials')
  }

  const tokenUrl = `${MS_GRAPH_AUTH_URL}/${tenantId}/oauth2/v2.0/token`

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${await response.text()}`)
  }

  const data = await response.json()
  return data.access_token
}

// Create Teams meeting
async function createTeamsMeeting(
  accessToken: string,
  subject: string,
  startDateTime: string,
  endDateTime: string
): Promise<string> {
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId) {
    throw new Error('MS_ORGANIZER_USER_ID not configured')
  }

  const url = `${MS_GRAPH_API_URL}/users/${organizerUserId}/onlineMeetings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDateTime,
      endDateTime,
      subject,
      lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true },
      allowedPresenters: 'everyone'
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to create meeting: ${await response.text()}`)
  }

  const data = await response.json()
  return data.joinWebUrl
}

// Get all cohort schedule tables dynamically from Database B
async function getCohortTables(supabaseB: any): Promise<string[]> {
  try {
    // Query PostgreSQL information_schema to find all tables ending with _schedule
    const { data, error } = await supabaseB.rpc('get_schedule_tables')
    
    if (error) {
      // Fallback: If RPC doesn't exist, try querying directly
      console.log('RPC not available, using fallback table list')
      // Return known tables as fallback
      const knownTables = [
        'basic1_0_schedule',
        'basic1_1_schedule',
        'basic2_0_schedule',
        'basic3_0_schedule',
        'placement2_0_schedule',
        'placement3_0_schedule'
      ]
      return knownTables
    }
    
    return data?.map((row: any) => row.table_name) || []
  } catch (err) {
    console.error('Error fetching cohort tables:', err)
    // Fallback to known tables
    return [
      'basic1_0_schedule',
      'basic1_1_schedule', 
      'basic2_0_schedule',
      'basic3_0_schedule',
      'placement2_0_schedule',
      'placement3_0_schedule'
    ]
  }
}

export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase B client
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    // Get MS Graph access token
    let accessToken: string
    try {
      accessToken = await getAccessToken()
    } catch (error: any) {
      console.error('Failed to get MS Graph token:', error.message)
      return NextResponse.json({
        error: 'Failed to authenticate with Microsoft',
        details: error.message
      }, { status: 500 })
    }

    // Calculate date range (today + 7 days)
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const todayStr = today.toISOString().split('T')[0]
    const nextWeekStr = nextWeek.toISOString().split('T')[0]

    console.log(`Generating meetings for ${todayStr} to ${nextWeekStr}`)

    const results: any[] = []
    const cohortTables = await getCohortTables(supabaseB)

    for (const tableName of cohortTables) {
      try {
        // Fetch sessions in the next 7 days that don't have a meeting link yet
        const { data: sessions, error: fetchError } = await supabaseB
          .from(tableName)
          .select('*')
          .gte('date', todayStr)
          .lte('date', nextWeekStr)
          .or('teams_meeting_link.is.null,teams_meeting_link.eq.')
          .not('session_type', 'is', null)

        if (fetchError) {
          // Table might not have teams_meeting_link column yet
          if (fetchError.message.includes('teams_meeting_link')) {
            console.log(`Table ${tableName} needs teams_meeting_link column`)
            results.push({
              table: tableName,
              status: 'needs_column',
              message: 'teams_meeting_link column not found'
            })
            continue
          }
          console.error(`Error fetching ${tableName}:`, fetchError)
          continue
        }

        if (!sessions || sessions.length === 0) {
          results.push({
            table: tableName,
            status: 'no_sessions',
            message: 'No sessions need meeting links'
          })
          continue
        }

        let meetingsCreated = 0

        for (const session of sessions) {
          try {
            // Skip if no date or already has link
            if (!session.date || session.teams_meeting_link) continue

            // Create meeting subject
            const cohortName = tableName.replace('_schedule', '').replace('_', ' ').toUpperCase()
            const subject = `${cohortName} - ${session.subject_name || 'Session'}: ${session.subject_topic || 'Class'}`

            // Default time if not set (you can customize this)
            const sessionTime = session.time || '19:00:00' // 7 PM default
            const startDateTime = `${session.date}T${sessionTime}`
            
            // Calculate end time (1.5 hours later)
            const startDate = new Date(`${session.date}T${sessionTime}`)
            startDate.setMinutes(startDate.getMinutes() + 90)
            const endDateTime = startDate.toISOString()

            // Create Teams meeting
            const meetingLink = await createTeamsMeeting(
              accessToken,
              subject,
              new Date(`${session.date}T${sessionTime}`).toISOString(),
              endDateTime
            )

            // Update the session with the meeting link
            const { error: updateError } = await supabaseB
              .from(tableName)
              .update({ teams_meeting_link: meetingLink })
              .eq('id', session.id)

            if (updateError) {
              console.error(`Error updating session ${session.id}:`, updateError)
            } else {
              meetingsCreated++
            }

          } catch (sessionError: any) {
            console.error(`Error creating meeting for session ${session.id}:`, sessionError.message)
          }
        }

        results.push({
          table: tableName,
          status: 'success',
          sessionsFound: sessions.length,
          meetingsCreated
        })

      } catch (tableError: any) {
        console.error(`Error processing ${tableName}:`, tableError)
        results.push({
          table: tableName,
          status: 'error',
          message: tableError.message
        })
      }
    }

    return NextResponse.json({
      success: true,
      dateRange: { from: todayStr, to: nextWeekStr },
      results
    })

  } catch (error: any) {
    console.error('Scheduler error:', error)
    return NextResponse.json(
      { error: error.message || 'Scheduler failed' },
      { status: 500 }
    )
  }
}

// Also support GET for manual testing
export async function GET(request: Request) {
  return POST(request)
}

