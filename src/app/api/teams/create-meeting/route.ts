import { NextResponse } from 'next/server'

// Microsoft Graph API endpoints
const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

interface MeetingDetails {
  subject: string
  startDateTime: string // ISO format
  endDateTime: string // ISO format
  timeZone?: string
}

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

// Create an online meeting
async function createOnlineMeeting(
  accessToken: string,
  userId: string,
  meeting: MeetingDetails
): Promise<{ joinUrl: string; meetingId: string }> {
  const url = `${MS_GRAPH_API_URL}/users/${userId}/onlineMeetings`

  const meetingBody = {
    startDateTime: meeting.startDateTime,
    endDateTime: meeting.endDateTime,
    subject: meeting.subject,
    lobbyBypassSettings: {
      scope: 'everyone',
      isDialInBypassEnabled: true
    },
    allowedPresenters: 'everyone'
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
    const error = await response.text()
    throw new Error(`Failed to create meeting: ${error}`)
  }

  const data = await response.json()
  return {
    joinUrl: data.joinWebUrl,
    meetingId: data.id
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { subject, startDateTime, endDateTime, timeZone = 'Asia/Kolkata' } = body

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

    // Create the meeting
    const meeting = await createOnlineMeeting(accessToken, organizerUserId, {
      subject,
      startDateTime,
      endDateTime,
      timeZone
    })

    return NextResponse.json({
      success: true,
      joinUrl: meeting.joinUrl,
      meetingId: meeting.meetingId
    })

  } catch (error: any) {
    console.error('Error creating Teams meeting:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create Teams meeting' },
      { status: 500 }
    )
  }
}

