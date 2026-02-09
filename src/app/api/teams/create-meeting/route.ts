import { NextResponse } from 'next/server'

// Microsoft Graph API endpoints
const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

// Get access token using client credentials flow
async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft credentials in environment variables')
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get access token: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

// Create Teams meeting with full settings (3-step approach)
// Step 1: Create standalone online meeting with lobby bypass + auto-recording + organizer-only presenter
// Step 2: PATCH to disable attendee mic/camera
// Step 3: Create calendar event linked to the meeting
async function createTeamsMeeting(
  accessToken: string,
  userId: string,
  subject: string,
  startDateTime: string,
  endDateTime: string,
  timeZone: string = 'Asia/Kolkata',
  attendeeEmails: string[] = []
): Promise<{ joinUrl: string; meetingId: string; eventId: string | null }> {

  // STEP 1: Create standalone online meeting with lobby bypass + auto-recording
  const meetingBody = {
    subject,
    startDateTime: new Date(startDateTime).toISOString(),
    endDateTime: new Date(endDateTime).toISOString(),
    lobbyBypassSettings: {
      scope: 'everyone',
      isDialInBypassEnabled: true
    },
    autoAdmittedUsers: 'everyone',
    allowedPresenters: 'organizer',
    recordAutomatically: true,
    isEntryExitAnnounced: false,
    allowMeetingChat: 'enabled',
    allowTeamworkReactions: true
  }

  const meetingResponse = await fetch(`${MS_GRAPH_API_URL}/users/${userId}/onlineMeetings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(meetingBody)
  })

  if (!meetingResponse.ok) {
    const error = await meetingResponse.text()
    console.error('Online meeting creation error:', error)
    throw new Error(`Failed to create online meeting: ${error}`)
  }

  const meetingData = await meetingResponse.json()
  const joinUrl = meetingData.joinUrl || meetingData.joinWebUrl
  const onlineMeetingId = meetingData.id

  if (!joinUrl) {
    console.error('No join URL in response:', JSON.stringify(meetingData, null, 2))
    throw new Error('Meeting created but no join URL returned')
  }

  console.log(`  Step 1: Online meeting created with lobby bypass + auto-recording + organizer-only presenter`)

  // STEP 2: PATCH to disable attendee mic/camera
  try {
    const patchResponse = await fetch(`${MS_GRAPH_API_URL}/users/${userId}/onlineMeetings/${onlineMeetingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        allowAttendeeToEnableMic: false,
        allowAttendeeToEnableCamera: false
      })
    })

    if (patchResponse.ok) {
      console.log(`  Step 2: Mic/camera restrictions applied`)
    } else {
      console.log(`  Step 2: Warning - mic/camera patch failed: ${await patchResponse.text()}`)
    }
  } catch (patchError) {
    console.log(`  Step 2: Warning - patch error:`, patchError)
  }

  // STEP 3: Create calendar event linked to the meeting
  const attendees = attendeeEmails
    .filter(email => email && email.trim())
    .map(email => ({
      emailAddress: { address: email.trim() },
      type: 'required'
    }))

  const eventBody = {
    subject,
    start: {
      dateTime: startDateTime,
      timeZone
    },
    end: {
      dateTime: endDateTime,
      timeZone
    },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    onlineMeeting: {
      joinUrl: joinUrl
    },
    attendees,
    responseRequested: false,
    allowNewTimeProposals: false
  }

  let eventId: string | null = null

  try {
    const eventResponse = await fetch(`${MS_GRAPH_API_URL}/users/${userId}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    })

    if (eventResponse.ok) {
      const eventData = await eventResponse.json()
      eventId = eventData.id
      console.log(`  Step 3: Calendar event created with ${attendees.length} attendees`)
    } else {
      console.log(`  Step 3: Warning - calendar event failed: ${await eventResponse.text()}`)
    }
  } catch (eventError) {
    console.log(`  Step 3: Warning - calendar event error:`, eventError)
  }

  console.log(`  ✅ Meeting ready: ${joinUrl.substring(0, 50)}...`)

  return {
    joinUrl,
    meetingId: onlineMeetingId,
    eventId
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      subject, 
      startDateTime, 
      endDateTime, 
      timeZone = 'Asia/Kolkata',
      attendees = []
    } = body

    if (!subject || !startDateTime || !endDateTime) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, startDateTime, endDateTime' },
        { status: 400 }
      )
    }

    // Get MS Graph access token
    const accessToken = await getAccessToken()

    // The user ID should be the organizer's email or user ID
    const organizerUserId = process.env.MS_ORGANIZER_USER_ID
    if (!organizerUserId) {
      return NextResponse.json(
        { error: 'MS_ORGANIZER_USER_ID not configured' },
        { status: 500 }
      )
    }

    const result = await createTeamsMeeting(
      accessToken,
      organizerUserId,
      subject,
      startDateTime,
      endDateTime,
      timeZone,
      attendees
    )

    return NextResponse.json({
      success: true,
      joinUrl: result.joinUrl,
      meetingId: result.meetingId,
      eventId: result.eventId || null
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create Teams meeting'
    console.error('Error creating Teams meeting:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
