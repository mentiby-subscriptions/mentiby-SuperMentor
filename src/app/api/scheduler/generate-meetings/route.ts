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

// Create Teams meeting via calendar event (creates chat automatically)
async function createTeamsMeetingWithChat(
  accessToken: string,
  subject: string,
  startDateTime: string,
  endDateTime: string,
  attendeeEmails: string[] = []
): Promise<string> {
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId) {
    throw new Error('MS_ORGANIZER_USER_ID not configured')
  }

  const url = `${MS_GRAPH_API_URL}/users/${organizerUserId}/events`

  // Build attendees list (mentor + any other attendees)
  const attendees = attendeeEmails
    .filter(email => email && email.trim())
    .map(email => ({
      emailAddress: { address: email.trim() },
      type: 'required'
    }))

  // Create calendar event with Teams meeting - this creates the chat!
  const eventBody = {
    subject,
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Kolkata'
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Kolkata'
    },
    // This is the key setting - creates Teams meeting with chat
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    // Add attendees (they'll be part of the chat)
    attendees,
    // Don't require response
    responseRequested: false,
    allowNewTimeProposals: false
  }

  console.log(`Creating calendar event with chat for: ${subject}`)
  if (attendees.length > 0) {
    console.log(`  Attendees: ${attendeeEmails.join(', ')}`)
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Calendar event creation error:', errorText)
    throw new Error(`Failed to create calendar event: ${errorText}`)
  }

  const data = await response.json()
  
  // The join URL is in onlineMeeting.joinUrl
  const joinUrl = data.onlineMeeting?.joinUrl
  const onlineMeetingId = data.onlineMeeting?.id // Meeting ID to patch for recording settings
  
  if (!joinUrl) {
    console.error('No join URL in response:', JSON.stringify(data, null, 2))
    throw new Error('Meeting created but no join URL returned')
  }

  // Enable auto-recording by patching the online meeting
  if (onlineMeetingId) {
    try {
      const patchUrl = `${MS_GRAPH_API_URL}/users/${organizerUserId}/onlineMeetings/${onlineMeetingId}`
      const patchResponse = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recordAutomatically: true
        })
      })
      
      if (patchResponse.ok) {
        console.log(`  Enabled auto-recording for meeting`)
      } else {
        console.log(`  Warning: Could not enable auto-recording: ${await patchResponse.text()}`)
      }
    } catch (patchError) {
      console.log(`  Warning: Failed to patch meeting for auto-recording:`, patchError)
    }
  }

  console.log(`  Created meeting with chat: ${joinUrl.substring(0, 50)}...`)
  return joinUrl
}

// Fallback: Create standalone online meeting (no chat, but always works)
async function createOnlineMeetingFallback(
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

  const meetingBody = {
    startDateTime,
    endDateTime,
    subject,
    lobbyBypassSettings: { 
      scope: 'everyone',
      isDialInBypassEnabled: true 
    },
    autoAdmittedUsers: 'everyone',
    allowedPresenters: 'everyone',
    recordAutomatically: true // Auto-start recording when meeting begins
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(meetingBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create online meeting: ${errorText}`)
  }

  const data = await response.json()
  console.log(`  Created meeting (fallback, no chat): ${data.joinWebUrl.substring(0, 50)}...`)
  return data.joinWebUrl
}

// Parse table name to get cohort type and number
// e.g., "basic1_1_schedule" -> { type: "Basic", number: "1.1" }
// e.g., "placement2_0_schedule" -> { type: "Placement", number: "2.0" }
function parseCohortFromTableName(tableName: string): { type: string; number: string } | null {
  // Remove _schedule suffix
  const name = tableName.replace('_schedule', '')
  
  // Match pattern like "basic1_1" or "placement2_0"
  const match = name.match(/^([a-zA-Z]+)(\d+)_(\d+)$/)
  
  if (!match) {
    console.log(`Could not parse cohort from table name: ${tableName}`)
    return null
  }
  
  const [, typeRaw, major, minor] = match
  
  // Capitalize first letter for cohort type
  const type = typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1)
  const number = `${major}.${minor}`
  
  return { type, number }
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

    // Initialize Supabase clients
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )
    
    // Main Supabase for student data (onboarding table)
    const supabaseMain = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all mentors for co-organizer lookup
    const { data: allMentors } = await supabaseB
      .from('Mentor Details')
      .select('mentor_id, Name, "Email address"')
    
    const mentorMap = new Map<number, string>()
    if (allMentors) {
      for (const mentor of allMentors) {
        if (mentor['Email address']) {
          mentorMap.set(mentor.mentor_id, mentor['Email address'])
        }
      }
      console.log(`Loaded ${allMentors.length} mentors for co-organizer assignment`)
    }

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
    
    // Cache for student emails per cohort (to avoid repeated queries)
    const studentEmailsCache = new Map<string, string[]>()

    for (const tableName of cohortTables) {
      try {
        // Parse cohort info from table name
        const cohortInfo = parseCohortFromTableName(tableName)
        
        // Fetch students for this cohort (cache to avoid repeated queries)
        let studentEmails: string[] = []
        if (cohortInfo) {
          const cacheKey = `${cohortInfo.type}_${cohortInfo.number}`
          
          if (studentEmailsCache.has(cacheKey)) {
            studentEmails = studentEmailsCache.get(cacheKey) || []
          } else {
            const { data: students, error: studentsError } = await supabaseMain
              .from('onboarding')
              .select('Email')
              .eq('Cohort Type', cohortInfo.type)
              .eq('Cohort Number', cohortInfo.number)
            
            if (studentsError) {
              console.error(`Error fetching students for ${cacheKey}:`, studentsError)
            } else if (students) {
              studentEmails = students
                .map(s => s.Email)
                .filter((email): email is string => !!email && email.includes('@'))
              studentEmailsCache.set(cacheKey, studentEmails)
              console.log(`Loaded ${studentEmails.length} students for ${cohortInfo.type} ${cohortInfo.number}`)
            }
          }
        }

        // Fetch sessions in the next 7 days (we'll filter for missing links in code)
        const { data: sessions, error: fetchError } = await supabaseB
          .from(tableName)
          .select('*')
          .gte('date', todayStr)
          .lte('date', nextWeekStr)
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
            // Skip if no date
            if (!session.date) {
              console.log(`Skipping session ${session.id}: no date`)
              continue
            }
            
            // Skip if already has a valid link (not null, not empty, not just whitespace)
            const existingLink = session.teams_meeting_link
            if (existingLink && existingLink.trim() !== '' && existingLink !== 'null') {
              console.log(`Skipping session ${session.id}: already has link - "${existingLink.substring(0, 50)}..."`)
              continue
            }

            // Create meeting subject: "Cohort Basic 1.1 - Web Development"
            const cohortTypeForSubject = cohortInfo?.type || 'Unknown'
            const cohortNumberForSubject = cohortInfo?.number || '0.0'
            const subject = `Cohort ${cohortTypeForSubject} ${cohortNumberForSubject} - ${session.subject_name || 'Session'}`

            // Default time if not set (you can customize this)
            const sessionTime = session.time || '19:00:00' // 7 PM default
            const startDateTime = `${session.date}T${sessionTime}`
            
            // Calculate end time (1.5 hours later)
            const startDate = new Date(`${session.date}T${sessionTime}`)
            startDate.setMinutes(startDate.getMinutes() + 90)
            const endDateTime = startDate.toISOString()

            // Get mentor email
            const mentorEmail = session.mentor_id ? mentorMap.get(session.mentor_id) : undefined
            
            // Combine mentor + all students as attendees
            const attendees: string[] = []
            if (mentorEmail) {
              attendees.push(mentorEmail)
            }
            // Add all student emails for this cohort
            attendees.push(...studentEmails)
            
            console.log(`Creating meeting for ${subject} with ${attendees.length} attendees (1 mentor + ${studentEmails.length} students)`)
            
            let meetingLink: string
            
            try {
              // Try calendar event first (creates chat automatically)
              meetingLink = await createTeamsMeetingWithChat(
                accessToken,
                subject,
                new Date(`${session.date}T${sessionTime}`).toISOString(),
                endDateTime,
                attendees
              )
            } catch (calendarError: any) {
              // Fallback to old method if calendar API fails (no chat, but creates meeting)
              console.log(`Calendar API failed, falling back to onlineMeetings API: ${calendarError.message}`)
              meetingLink = await createOnlineMeetingFallback(
                accessToken,
                subject,
                new Date(`${session.date}T${sessionTime}`).toISOString(),
                endDateTime
              )
            }

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
          meetingsCreated,
          studentsInCohort: studentEmails.length
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

