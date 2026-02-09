/**
 * Microsoft Graph helpers for Teams (token + meeting attendance).
 */

const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_V1 = 'https://graph.microsoft.com/v1.0'
const MS_GRAPH_BETA = 'https://graph.microsoft.com/beta'

export async function getGraphAccessToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft credentials (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)')
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

/**
 * Get total participant count for a past Teams meeting by its join URL.
 * Uses Graph beta to find meeting by joinWebUrl, then v1 attendanceReports.
 * Returns null if meeting not found, no reports, or on error.
 */
export async function getMeetingAttendeeCount(joinUrl: string): Promise<number | null> {
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId || !joinUrl?.trim().startsWith('http')) {
    return null
  }

  try {
    const accessToken = await getGraphAccessToken()
    const safeUrl = joinUrl.trim().replace(/'/g, "''")
    const filterValue = `joinWebUrl eq '${safeUrl}'`
    const listUrl = `${MS_GRAPH_BETA}/users/${organizerUserId}/onlineMeetings?$filter=${encodeURIComponent(filterValue)}`

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!listRes.ok) return null
    const listData = await listRes.json()
    const meetings = listData?.value
    if (!meetings?.length) return null

    const meetingId = meetings[0].id
    const reportsUrl = `${MS_GRAPH_V1}/users/${organizerUserId}/onlineMeetings/${meetingId}/attendanceReports`
    const reportsRes = await fetch(reportsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!reportsRes.ok) return null
    const reportsData = await reportsRes.json()
    const reports = reportsData?.value
    if (!reports?.length) return null

    let count: number | null = null
    for (const r of reports) {
      const n = r.totalParticipantCount
      if (typeof n === 'number' && (count === null || n > count)) count = n
    }
    return count
  } catch {
    return null
  }
}
