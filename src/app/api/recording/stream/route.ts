// /src/app/api/recording/stream/route.ts
// FULL FILE - Streaming endpoint for OneDrive recordings

import { NextRequest, NextResponse } from 'next/server'

// Microsoft Graph API endpoints
const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

// Get access token using client credentials flow
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const meetingId = searchParams.get('meetingId')
    const recordingId = searchParams.get('recordingId')
    
    // Alternative: accept direct recording URL (for backward compatibility)
    const directUrl = searchParams.get('url')

    if (!meetingId && !recordingId && !directUrl) {
      return NextResponse.json({ error: 'meetingId and recordingId or url required' }, { status: 400 })
    }

    const organizerUserId = process.env.MS_ORGANIZER_USER_ID
    if (!organizerUserId) {
      return NextResponse.json({ error: 'Organizer not configured' }, { status: 500 })
    }

    const accessToken = await getAccessToken()

    let contentUrl: string

    if (directUrl) {
      // Direct URL provided - use it
      contentUrl = directUrl
    } else {
      // Construct the recording content URL
      contentUrl = `${MS_GRAPH_API_URL}/users/${organizerUserId}/onlineMeetings/${meetingId}/recordings/${recordingId}/content`
    }

    // Fetch the recording content
    const response = await fetch(contentUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Recording fetch error:', errorText)
      return NextResponse.json({ error: 'Failed to fetch recording' }, { status: response.status })
    }

    // Check if it's a redirect (MS Graph sometimes returns redirect to actual content)
    if (response.redirected) {
      // Redirect the client to the actual video URL
      return NextResponse.redirect(response.url)
    }

    // Stream the content
    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')

    const headers: HeadersInit = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
    }

    if (contentLength) {
      headers['Content-Length'] = contentLength
    }

    // Return the video stream
    return new NextResponse(response.body, {
      status: 200,
      headers
    })

  } catch (error: any) {
    console.error('Recording stream error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to stream recording' },
      { status: 500 }
    )
  }
}
