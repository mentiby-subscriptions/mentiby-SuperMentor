import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, generateStudentEmailHTML } from '@/lib/email'

// Microsoft Graph API configuration
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

// Delete a Teams meeting by finding the calendar event with that join URL
async function deleteTeamsMeeting(accessToken: string, meetingLink: string): Promise<boolean> {
  const organizerUserId = process.env.MS_ORGANIZER_USER_ID
  if (!organizerUserId) {
    console.log('MS_ORGANIZER_USER_ID not configured, skipping meeting deletion')
    return false
  }

  try {
    // Search for calendar events with this meeting link
    // We need to find the event that contains this join URL
    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

    const url = `${MS_GRAPH_API_URL}/users/${organizerUserId}/calendarView?startDateTime=${oneYearAgo.toISOString()}&endDateTime=${oneYearFromNow.toISOString()}&$select=id,subject,onlineMeeting`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('Could not search calendar events:', await response.text())
      return false
    }

    const data = await response.json()
    const events = data.value || []

    // Find the event with matching join URL
    const matchingEvent = events.find((event: any) => 
      event.onlineMeeting?.joinUrl === meetingLink
    )

    if (matchingEvent) {
      // Delete the calendar event (this also cancels the meeting)
      const deleteUrl = `${MS_GRAPH_API_URL}/users/${organizerUserId}/events/${matchingEvent.id}`
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (deleteResponse.ok || deleteResponse.status === 204) {
        console.log(`  Deleted meeting: ${matchingEvent.subject}`)
        return true
      } else {
        console.log('Could not delete meeting:', await deleteResponse.text())
      }
    } else {
      console.log('  Meeting event not found in calendar, skipping deletion')
    }

    return false
  } catch (error) {
    console.error('Error deleting meeting:', error)
    return false
  }
}

// Create a new Teams meeting
async function createTeamsMeeting(
  accessToken: string,
  subject: string,
  startDateTime: string,
  endDateTime: string
): Promise<string | null> {
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
    recordAutomatically: true
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
    console.error('Failed to create meeting:', errorText)
    return null
  }

  const data = await response.json()
  console.log(`  Created new meeting: ${data.joinWebUrl?.substring(0, 50)}...`)
  return data.joinWebUrl
}

// Parse cohort from table name
function parseCohortFromTableName(tableName: string): { type: string; number: string } | null {
  const name = tableName.replace('_schedule', '')
  const match = name.match(/^([a-zA-Z]+)(\d+)_(\d+)$/)
  
  if (!match) return null
  
  const [, typeRaw, major, minor] = match
  const type = typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1)
  const number = `${major}.${minor}`
  
  return { type, number }
}

// Send update notification emails
async function sendUpdateNotifications(params: {
  tableName: string
  session: any
  oldDate: string
  oldTime: string
  newDate: string
  newTime: string
  supabaseMain: any
}): Promise<{ studentsSent: number; mentorSent: boolean }> {
  const { tableName, session, oldDate, oldTime, newDate, newTime, supabaseMain } = params
  const result = { studentsSent: 0, mentorSent: false }

  try {
    const cohortInfo = parseCohortFromTableName(tableName)
    if (!cohortInfo) {
      console.log('Could not parse cohort info from table name')
      return result
    }

    // Get students from this cohort
    const { data: students, error: studentsError } = await supabaseMain
      .from('onboarding')
      .select('id, "Name", "Email address"')
      .eq('cohort_type', cohortInfo.type)
      .eq('cohort_number', cohortInfo.number)

    if (studentsError || !students) {
      console.log('Could not fetch students:', studentsError?.message)
      return result
    }

    // Get mentor info
    const effectiveMentorId = session.swapped_mentor_id ?? session.mentor_id
    const { data: mentor } = await supabaseMain
      .from('Mentor Details')
      .select('mentor_id, "Name", "Email address"')
      .eq('mentor_id', effectiveMentorId)
      .single()

    // Format dates for display
    const formatDate = (dateStr: string) => {
      const d = new Date(dateStr + 'T12:00:00')
      return d.toLocaleDateString('en-IN', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })
    }

    const oldDateFormatted = formatDate(oldDate)
    const newDateFormatted = formatDate(newDate)

    // Generate update email HTML
    const generateUpdateEmailHTML = (recipientName: string, recipientType: 'student' | 'mentor') => {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Class Schedule Updated</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">⚠️ Schedule Updated</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
                Hi <strong>${recipientName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
                Your <strong>${cohortInfo.type} ${cohortInfo.number}</strong> class has been rescheduled:
              </p>

              <!-- Old Schedule -->
              <div style="background-color: #fef2f2; border-radius: 8px; padding: 15px; margin-bottom: 15px; border-left: 4px solid #ef4444;">
                <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 600;">Previous Schedule:</p>
                <p style="margin: 5px 0 0; font-size: 16px; color: #374151;">
                  📅 ${oldDateFormatted}<br>
                  ⏰ ${oldTime}
                </p>
              </div>

              <!-- New Schedule -->
              <div style="background-color: #ecfdf5; border-radius: 8px; padding: 15px; margin-bottom: 20px; border-left: 4px solid #10b981;">
                <p style="margin: 0; font-size: 14px; color: #065f46; font-weight: 600;">New Schedule:</p>
                <p style="margin: 5px 0 0; font-size: 16px; color: #374151;">
                  📅 ${newDateFormatted}<br>
                  ⏰ ${newTime}
                </p>
              </div>

              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
                <strong>Subject:</strong> ${session.subject_name || 'N/A'}
              </p>

              ${session.teams_meeting_link ? `
              <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280;">
                A new meeting link will be generated and shared before the class.
              </p>
              ` : ''}

              <p style="margin: 20px 0 0; font-size: 14px; color: #6b7280;">
                Please update your calendar accordingly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This is an automated notification from MentiBY.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
    }

    // Send to students (with rate limiting)
    for (const student of students) {
      const email = student['Email address']
      const name = student['Name'] || 'Student'
      
      if (!email) continue

      try {
        const success = await sendEmail({
          to: email,
          subject: `📅 Class Rescheduled - ${cohortInfo.type} ${cohortInfo.number}`,
          html: generateUpdateEmailHTML(name, 'student')
        })
        
        if (success) {
          result.studentsSent++
        }
        
        // Rate limit: wait 600ms between emails
        await new Promise(resolve => setTimeout(resolve, 600))
      } catch (error) {
        console.error(`Failed to send update email to student ${email}:`, error)
      }
    }

    // Send to mentor
    if (mentor && mentor['Email address']) {
      try {
        const success = await sendEmail({
          to: mentor['Email address'],
          subject: `📅 Class Rescheduled - ${cohortInfo.type} ${cohortInfo.number}`,
          html: generateUpdateEmailHTML(mentor['Name'] || 'Mentor', 'mentor')
        })
        
        result.mentorSent = success
      } catch (error) {
        console.error(`Failed to send update email to mentor:`, error)
      }
    }

    return result
  } catch (error) {
    console.error('Error sending update notifications:', error)
    return result
  }
}

// Main handler for session updates
// Called after date/time changes to handle meeting recreation and notifications
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      tableName, 
      sessionId, 
      oldDate, 
      oldTime, 
      newDate, 
      newTime,
      skipMeetingRegeneration = false
    } = body

    if (!tableName || !sessionId) {
      return NextResponse.json({ error: 'tableName and sessionId are required' }, { status: 400 })
    }

    console.log(`\n=== Session Update Handler ===`)
    console.log(`Table: ${tableName}, Session ID: ${sessionId}`)
    console.log(`Old: ${oldDate} ${oldTime} → New: ${newDate} ${newTime}`)

    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const supabaseMain = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Fetch the session
    const { data: session, error: fetchError } = await supabaseB
      .from(tableName)
      .select('*')
      .eq('id', sessionId)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const results = {
      meetingDeleted: false,
      meetingCreated: false,
      newMeetingLink: null as string | null,
      notificationsSent: { studentsSent: 0, mentorSent: false }
    }

    // Step 1: Handle meeting link if exists (skip for contest sessions)
    const isContest = session.session_type && session.session_type.toLowerCase() === 'contest'
    
    if (isContest) {
      console.log('Contest session - skipping meeting link handling (contests don\'t have Teams links)')
    } else if (session.teams_meeting_link && !skipMeetingRegeneration) {
      console.log('Session has meeting link - handling regeneration...')
      
      try {
        const accessToken = await getAccessToken()
        
        // Delete old meeting
        results.meetingDeleted = await deleteTeamsMeeting(accessToken, session.teams_meeting_link)
        
        // Create new meeting with updated date/time
        const effectiveDate = newDate || session.date
        const effectiveTime = newTime || session.time || '19:00'
        
        const startDateTime = `${effectiveDate}T${effectiveTime}:00`
        const endTime = new Date(`${effectiveDate}T${effectiveTime}:00`)
        endTime.setHours(endTime.getHours() + 1)
        const endDateTime = `${effectiveDate}T${endTime.toTimeString().slice(0, 5)}:00`

        const cohortInfo = parseCohortFromTableName(tableName)
        const subject = cohortInfo 
          ? `${cohortInfo.type} ${cohortInfo.number} - ${session.subject_name || 'Class'}`
          : `Class - ${session.subject_name || 'Session'}`

        const newLink = await createTeamsMeeting(accessToken, subject, startDateTime, endDateTime)
        
        if (newLink) {
          results.meetingCreated = true
          results.newMeetingLink = newLink
          
          // Update the session with new meeting link
          await supabaseB
            .from(tableName)
            .update({ teams_meeting_link: newLink })
            .eq('id', sessionId)
          
          console.log('Updated session with new meeting link')
        }
      } catch (error) {
        console.error('Error handling meeting:', error)
      }
    }

    // Step 2: Send update notifications if email was already sent
    if (session.email_sent === true) {
      console.log('Email was already sent - sending update notifications...')
      
      results.notificationsSent = await sendUpdateNotifications({
        tableName,
        session,
        oldDate: oldDate || session.date,
        oldTime: oldTime || session.time || '19:00',
        newDate: newDate || session.date,
        newTime: newTime || session.time || '19:00',
        supabaseMain
      })
      
      console.log(`Sent updates to ${results.notificationsSent.studentsSent} students, mentor: ${results.notificationsSent.mentorSent}`)
    } else {
      console.log('Email not yet sent - skipping update notifications')
    }

    // Step 3: Reset email_sent and whatsapp_sent to false so daily cron will resend
    if (session.email_sent === true || session.whatsapp_sent === true) {
      console.log('Resetting email_sent and whatsapp_sent to false for fresh notifications...')
      
      const { error: resetError } = await supabaseB
        .from(tableName)
        .update({ 
          email_sent: false, 
          whatsapp_sent: false 
        })
        .eq('id', sessionId)
      
      if (resetError) {
        console.error('Failed to reset notification flags:', resetError)
      } else {
        console.log('Notification flags reset - daily cron will send fresh notifications')
      }
    }

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error: any) {
    console.error('Session update handler error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}
