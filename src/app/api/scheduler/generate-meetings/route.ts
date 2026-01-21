import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint is called daily (via Vercel Cron) to:
// 1. Generate Teams meeting links for the next 7 days of classes
// 2. Fetch recordings from OneDrive for yesterday's completed classes

const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

// OneDrive Recording Interface
interface OneDriveRecording {
  name: string
  webUrl: string
  createdDateTime: string
  id: string
}

// Cache for recordings (refreshed each cron run)
let cachedRecordings: OneDriveRecording[] | null = null

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
          recordAutomatically: true,
          lobbyBypassSettings: {
            scope: 'everyone',
            isDialInBypassEnabled: true
          },
          autoAdmittedUsers: 'everyone',
          // Attendees join muted with camera off (organizer is exempt)
          allowAttendeeToEnableMic: false,
          allowAttendeeToEnableCamera: false
        })
      })
      
      if (patchResponse.ok) {
        console.log(`  Configured meeting: auto-recording, lobby bypass, attendees muted`)
      } else {
        console.log(`  Warning: Could not configure meeting settings: ${await patchResponse.text()}`)
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
      // Fallback: If RPC doesn't exist, log and return empty
      // The RPC function should be created in Database B for dynamic table discovery
      console.log('RPC get_schedule_tables not available. Please create it in Database B.')
      console.log('RPC Error:', error.message)
      // Return empty array - RPC is required for proper operation
      return []
    }
    
    return data?.map((row: any) => row.table_name) || []
  } catch (err) {
    console.error('Error fetching cohort tables:', err)
    // Return empty - RPC is required for proper operation
    return []
  }
}

// ============================================
// ONEDRIVE RECORDING FETCH FUNCTIONS
// ============================================

// Fetch all recordings from OneDrive Recordings folder
async function fetchOneDriveRecordings(accessToken: string): Promise<OneDriveRecording[]> {
  if (cachedRecordings) {
    return cachedRecordings
  }
  
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId) return []

  try {
    // First, get the Recordings folder ID
    const folderUrl = `${MS_GRAPH_API_URL}/users/${organizerUserId}/drive/root:/Recordings`
    
    const folderResponse = await fetch(folderUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    
    if (!folderResponse.ok) {
      console.log(`  Could not find Recordings folder: ${folderResponse.status}`)
      return []
    }
    
    const folderData = await folderResponse.json()
    const folderId = folderData.id
    
    // Then get children of the folder (simpler query, no $orderby)
    const recordingsUrl = `${MS_GRAPH_API_URL}/users/${organizerUserId}/drive/items/${folderId}/children`
    
    const response = await fetch(recordingsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`  Could not fetch OneDrive recordings: ${response.status} - ${errorText}`)
      return []
    }

    const data = await response.json()
    
    if (!data.value || data.value.length === 0) {
      console.log(`  No recordings found in OneDrive`)
      return []
    }

    cachedRecordings = data.value.map((item: any) => ({
      name: item.name,
      webUrl: item.webUrl,
      createdDateTime: item.createdDateTime,
      id: item.id
    }))
    
    console.log(`  Loaded ${cachedRecordings!.length} recordings from OneDrive`)
    return cachedRecordings!

  } catch (error: any) {
    console.log(`  Error fetching OneDrive recordings: ${error.message}`)
    return []
  }
}

// Create a shareable link for a recording (so external users can access it)
async function createSharingLink(accessToken: string, fileId: string): Promise<string | null> {
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId) return null

  try {
    const url = `${MS_GRAPH_API_URL}/users/${organizerUserId}/drive/items/${fileId}/createLink`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'view',           // Read-only access
        scope: 'anonymous'      // Anyone with the link can view
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`    Could not create sharing link: ${response.status} - ${errorText}`)
      return null
    }

    const data = await response.json()
    return data.link?.webUrl || null

  } catch (error: any) {
    console.log(`    Error creating sharing link: ${error.message}`)
    return null
  }
}

// Match a session to a recording by cohort type/number and date
// Recording names can be in various formats:
// - "Basic 6.0 - Orientation Session..."
// - "Cohort - 2.0 (20-01-2026)-20260120..."
// - "Cohort-3.0(20012026)- Strings-..."
// - "Cohort Basic 1.1 - Web Development - Saswata-20260105..."
function findRecordingForSession(
  recordings: OneDriveRecording[],
  meetingSubject: string,
  sessionDate: string,
  cohortType?: string,
  cohortNumber?: string
): OneDriveRecording | null {
  // Session date in multiple formats for matching
  const dateYYYYMMDD = sessionDate.replace(/-/g, '') // 20260120
  const dateParts = sessionDate.split('-') // [2026, 01, 20]
  const dateDDMMYYYY = `${dateParts[2]}${dateParts[1]}${dateParts[0]}` // 20012026
  const dateDDMMYY = `${dateParts[2]}${dateParts[1]}${dateParts[0].slice(2)}` // 200126
  const dateDisplayFormat = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` // 20-01-2026
  
  console.log(`    Looking for recording with dates: ${dateYYYYMMDD}, ${dateDDMMYYYY}, or ${dateDisplayFormat}`)
  
  // Extract cohort info from subject if not provided
  // Subject format: "Cohort Basic 6.0 - Orientation Session - Swaroop"
  let cohortTypeFromSubject = cohortType?.toLowerCase() || ''
  let cohortNumberFromSubject = cohortNumber || ''
  
  if (!cohortTypeFromSubject) {
    const cohortMatch = meetingSubject.match(/cohort\s+(\w+)\s+([\d.]+)/i)
    if (cohortMatch) {
      cohortTypeFromSubject = cohortMatch[1].toLowerCase()
      cohortNumberFromSubject = cohortMatch[2]
    }
  }
  
  console.log(`    Cohort: ${cohortTypeFromSubject} ${cohortNumberFromSubject}`)
  
  for (const recording of recordings) {
    const normalizedName = recording.name.toLowerCase()
    
    // Check if recording contains the date in any format
    const hasDate = recording.name.includes(dateYYYYMMDD) || 
                    recording.name.includes(dateDDMMYYYY) ||
                    recording.name.includes(dateDisplayFormat) ||
                    recording.name.includes(dateDDMMYY)
    
    // Also check createdDateTime for date matching
    const createdDate = recording.createdDateTime?.split('T')[0] || ''
    const createdDateMatches = createdDate === sessionDate
    
    if (!hasDate && !createdDateMatches) {
      continue
    }
    
    // Check for cohort type and number match
    // Patterns: "Basic 6.0", "Cohort - 6.0", "Cohort-6.0", "Cohort Basic 6.0"
    const hasMatchingCohort = 
      // Direct match: "Basic 6.0" or "basic 6.0"
      normalizedName.includes(`${cohortTypeFromSubject} ${cohortNumberFromSubject}`) ||
      normalizedName.includes(`${cohortTypeFromSubject}${cohortNumberFromSubject}`) ||
      // Just the number: "- 6.0" or "-6.0" 
      (cohortNumberFromSubject && (
        normalizedName.includes(`- ${cohortNumberFromSubject}`) ||
        normalizedName.includes(`-${cohortNumberFromSubject}`)
      )) ||
      // Type only for specific matches
      (cohortTypeFromSubject && normalizedName.includes(cohortTypeFromSubject))
    
    if (hasMatchingCohort) {
      console.log(`    ✓ Match found: ${recording.name}`)
      console.log(`      Date match: ${hasDate ? 'in filename' : 'by created date'}`)
      return recording
    }
  }
  
  // Fallback: Try matching by subject parts (more lenient)
  const normalizedSubject = meetingSubject.trim().toLowerCase()
  const subjectParts = normalizedSubject.split(' - ').map(p => p.trim()).filter(p => p.length > 2)
  
  for (const recording of recordings) {
    const normalizedName = recording.name.toLowerCase()
    
    // Check date first
    const hasDate = recording.name.includes(dateYYYYMMDD) || 
                    recording.name.includes(dateDDMMYYYY) ||
                    recording.name.includes(dateDisplayFormat)
    
    const createdDate = recording.createdDateTime?.split('T')[0] || ''
    const createdDateMatches = createdDate === sessionDate
    
    if (!hasDate && !createdDateMatches) {
      continue
    }
    
    // Check if key subject parts are present
    const matchingParts = subjectParts.filter(part => normalizedName.includes(part))
    if (matchingParts.length >= 2) {
      console.log(`    ✓ Fuzzy match found: ${recording.name}`)
      console.log(`      Matched parts: ${matchingParts.join(', ')}`)
      return recording
    }
  }
  
  console.log(`    No recording found for date ${sessionDate}`)
  return null
}

// Get recording URL for a session by checking OneDrive
// Creates a shareable link so external users can access it
async function fetchRecordingForSession(
  accessToken: string,
  meetingSubject: string,
  sessionDate: string,
  cohortType?: string,
  cohortNumber?: string
): Promise<string | null> {
  const recordings = await fetchOneDriveRecordings(accessToken)
  
  if (recordings.length === 0) {
    return null
  }
  
  const matchedRecording = findRecordingForSession(
    recordings, 
    meetingSubject, 
    sessionDate,
    cohortType,
    cohortNumber
  )
  
  if (matchedRecording) {
    console.log(`  ✓ Found matching recording: ${matchedRecording.name}`)
    
    // Create a shareable link so anyone (including external users) can access
    const sharingLink = await createSharingLink(accessToken, matchedRecording.id)
    
    if (sharingLink) {
      console.log(`  ✓ Created sharing link`)
      return sharingLink
    }
    
    // Fallback to direct URL if sharing link creation fails
    console.log(`  ⚠ Could not create sharing link, using direct URL`)
    return matchedRecording.webUrl
  }
  
  return null
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

    // Calculate dates
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    const todayStr = today.toISOString().split('T')[0]
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const nextWeekStr = nextWeek.toISOString().split('T')[0]

    // Build mentor name map for recording matching
    const mentorNameMap = new Map<number, string>()
    if (allMentors) {
      for (const mentor of allMentors) {
        if (mentor.Name) {
          mentorNameMap.set(mentor.mentor_id, mentor.Name)
        }
      }
    }

    // ============================================
    // PHASE 1: Fetch recordings for past sessions
    // ============================================
    const recordingResults: any[] = []
    const cohortTablesForRecordings = await getCohortTables(supabaseB)
    
    console.log('\n=== PHASE 1: Fetching Recordings ===')
    console.log(`Checking for recordings from ${yesterdayStr}`)

    // Reset recording cache for fresh fetch
    cachedRecordings = null

    // Parse cohort info helper for recording matching
    const getCohortInfoFromTable = (tableName: string) => {
      const name = tableName.replace('_schedule', '')
      const match = name.match(/^([a-zA-Z]+)(\d+)_(\d+)$/)
      if (!match) return null
      const [, typeRaw, major, minor] = match
      return {
        type: typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1),
        number: `${major}.${minor}`
      }
    }

    for (const tableName of cohortTablesForRecordings) {
      try {
        // Parse cohort info for constructing meeting subject
        const cohortInfo = getCohortInfoFromTable(tableName)
        
        // Fetch yesterday's sessions that:
        // - Have a teams_meeting_link (meeting was scheduled)
        // - Don't have a session_recording (recording not yet fetched)
        const { data: pastSessions, error: pastError } = await supabaseB
          .from(tableName)
          .select('id, date, time, subject_name, teams_meeting_link, session_recording, mentor_id')
          .eq('date', yesterdayStr)
          .not('teams_meeting_link', 'is', null)

        if (pastError) {
          console.log(`Error querying ${tableName} for recordings:`, pastError.message)
          continue
        }

        if (!pastSessions || pastSessions.length === 0) {
          continue
        }

        // Filter sessions that need recordings (have meeting link but no recording yet)
        const sessionsNeedingRecordings = pastSessions.filter(s => {
          // Must have meeting link
          if (!s.teams_meeting_link || s.teams_meeting_link.trim() === '') return false
          
          // Must not already have recording
          if (s.session_recording && s.session_recording.trim() !== '') return false
          
          return true
        })

        if (sessionsNeedingRecordings.length === 0) {
          continue
        }

        console.log(`\n${tableName}: ${sessionsNeedingRecordings.length} session(s) need recordings`)

        let recordingsFetched = 0

        for (const session of sessionsNeedingRecordings) {
          // Construct the meeting subject to match against OneDrive recordings
          // Format: "Cohort {Type} {Number} - {subject_name} - {Mentor Name}"
          const mentorName = session.mentor_id ? mentorNameMap.get(session.mentor_id) : null
          let meetingSubject = ''
          
          if (cohortInfo) {
            meetingSubject = `Cohort ${cohortInfo.type} ${cohortInfo.number}`
            if (session.subject_name) {
              meetingSubject += ` - ${session.subject_name}`
            }
            if (mentorName) {
              meetingSubject += ` - ${mentorName}`
            }
          } else {
            // Fallback: just use subject_name
            meetingSubject = session.subject_name || 'Session'
          }
          
          const sessionDate = String(session.date).split('T')[0]
          console.log(`  Checking recording for: "${meetingSubject}" (${sessionDate})`)
          
          const recordingUrl = await fetchRecordingForSession(
            accessToken, 
            meetingSubject, 
            sessionDate,
            cohortInfo?.type,
            cohortInfo?.number
          )
          
          if (recordingUrl) {
            // Update the session with the recording URL
            const { error: updateError } = await supabaseB
              .from(tableName)
              .update({ session_recording: recordingUrl })
              .eq('id', session.id)

            if (updateError) {
              console.log(`  Error saving recording URL: ${updateError.message}`)
            } else {
              console.log(`  ✓ Saved recording URL to database`)
              recordingsFetched++
            }
          }
        }

        if (recordingsFetched > 0) {
          recordingResults.push({
            table: tableName,
            sessionsChecked: sessionsNeedingRecordings.length,
            recordingsFetched
          })
        }

      } catch (tableError: any) {
        console.log(`Error processing ${tableName} for recordings: ${tableError.message}`)
      }
    }

    console.log(`\nPhase 1 Complete: ${recordingResults.reduce((sum, r) => sum + r.recordingsFetched, 0)} recordings fetched`)

    // ============================================
    // PHASE 2: Generate meetings for upcoming sessions
    // ============================================
    console.log('\n=== PHASE 2: Generating Meetings ===')
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
            
            // Skip contest sessions - only create links for live sessions
            if (session.session_type && session.session_type.toLowerCase() === 'contest') {
              console.log(`Skipping session ${session.id}: contest sessions don't need meeting links`)
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
      phase1_recordings: {
        dateChecked: yesterdayStr,
        tablesProcessed: recordingResults.length,
        totalRecordingsFetched: recordingResults.reduce((sum, r) => sum + r.recordingsFetched, 0),
        details: recordingResults
      },
      phase2_meetings: {
        dateRange: { from: todayStr, to: nextWeekStr },
        results
      }
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

