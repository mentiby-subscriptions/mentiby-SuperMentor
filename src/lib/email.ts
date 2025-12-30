// Email utility using Nodemailer or any email service
// For production, use services like SendGrid, AWS SES, or Resend

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
}

// Send email using SMTP (configure with your provider)
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, subject, html } = options

  // Using Resend API (recommended for Next.js)
  const resendApiKey = process.env.RESEND_API_KEY

  if (resendApiKey) {
    try {
      // Use Resend's default sender for testing, or your verified domain
      // For production, verify your domain at https://resend.com/domains
      const fromEmail = process.env.EMAIL_FROM || 'MentiBY <onboarding@resend.dev>'
      
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: Array.isArray(to) ? to : [to],
          subject,
          html
        })
      })
      
      // Log response for debugging
      const responseData = await response.json().catch(() => ({}))
      console.log('Resend response:', response.status, JSON.stringify(responseData))

      if (!response.ok) {
        console.error('Resend error:', responseData)
        return false
      }

      return true
    } catch (error) {
      console.error('Email send error:', error)
      return false
    }
  }

  // Fallback: Log email for testing
  console.log('=== EMAIL (Test Mode) ===')
  console.log('To:', to)
  console.log('Subject:', subject)
  console.log('HTML:', html.substring(0, 200) + '...')
  console.log('========================')
  
  return true
}

// Generate student notification email HTML
export function generateStudentEmailHTML(params: {
  studentName: string
  sessionDate: string
  sessionTime: string
  sessionDay: string
  subjectName: string
  subjectTopic: string
  sessionType: string
  meetingLink: string
  mentorName: string
}): string {
  const { studentName, sessionDate, sessionTime, sessionDay, subjectName, subjectTopic, sessionType, meetingLink, mentorName } = params

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upcoming Session Reminder - MentiBY</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f97316, #fbbf24); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">
        <span style="font-weight: bold;">Menti</span><span style="font-weight: normal;">BY</span>
      </h1>
      <p style="color: rgba(255,255,255,0.9); margin-top: 8px; font-size: 14px;">Your Learning Journey Continues!</p>
    </div>
    
    <!-- Content -->
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hi ${studentName}! 👋</h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        You have an upcoming <strong>${sessionType}</strong> session. Here are the details:
      </p>
      
      <!-- Session Details Card -->
      <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 12px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #92400e; font-weight: 600;">📅 Date:</td>
            <td style="padding: 8px 0; color: #78350f;">${sessionDate} (${sessionDay})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #92400e; font-weight: 600;">⏰ Time:</td>
            <td style="padding: 8px 0; color: #78350f;">${sessionTime || 'Check Dashboard'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #92400e; font-weight: 600;">📚 Subject:</td>
            <td style="padding: 8px 0; color: #78350f;">${subjectName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #92400e; font-weight: 600;">📖 Topic:</td>
            <td style="padding: 8px 0; color: #78350f;">${subjectTopic}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #92400e; font-weight: 600;">👨‍🏫 Mentor:</td>
            <td style="padding: 8px 0; color: #78350f;">${mentorName}</td>
          </tr>
        </table>
      </div>
      
      <!-- Join Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${meetingLink}" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(249,115,22,0.4);">
          🎥 Join Session on Teams
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px; text-align: center; margin-top: 20px;">
        Can't make it at this time? No worries!
      </p>
      
      <!-- Dashboard Link -->
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://mentiby-student.vercel.app" style="display: inline-block; background: #f3f4f6; color: #374151; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; border: 1px solid #e5e7eb;">
          View Dashboard
        </a>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #1f2937; padding: 20px; text-align: center;">
      <p style="color: #9ca3af; margin: 0; font-size: 12px;">
        © 2025 MentiBY. All rights reserved.
      </p>
      <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 11px;">
        You're receiving this because you're enrolled in a MentiBY cohort.
      </p>
    </div>
  </div>
</body>
</html>
  `
}

// Generate mentor notification email HTML
export function generateMentorEmailHTML(params: {
  mentorName: string
  sessionDate: string
  sessionTime: string
  sessionDay: string
  subjectName: string
  subjectTopic: string
  sessionType: string
  meetingLink: string
  cohortName: string
  studentCount: number
}): string {
  const { mentorName, sessionDate, sessionTime, sessionDay, subjectName, subjectTopic, sessionType, meetingLink, cohortName, studentCount } = params

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upcoming Session - MentiBY Mentor</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #8b5cf6, #6366f1); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">
        <span style="font-weight: bold;">Menti</span><span style="font-weight: normal;">BY</span>
        <span style="font-size: 14px; display: block; margin-top: 4px;">Mentor Portal</span>
      </h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 30px;">
      <h2 style="color: #333; margin-top: 0;">Hello ${mentorName}! 🌟</h2>
      
      <p style="color: #666; font-size: 16px; line-height: 1.6;">
        You have an upcoming <strong>${sessionType}</strong> session for <strong>${cohortName}</strong> cohort.
      </p>
      
      <!-- Session Details Card -->
      <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); border-radius: 12px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #5b21b6; font-weight: 600;">📅 Date:</td>
            <td style="padding: 8px 0; color: #4c1d95;">${sessionDate} (${sessionDay})</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #5b21b6; font-weight: 600;">⏰ Time:</td>
            <td style="padding: 8px 0; color: #4c1d95;">${sessionTime || 'Check Dashboard'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #5b21b6; font-weight: 600;">📚 Subject:</td>
            <td style="padding: 8px 0; color: #4c1d95;">${subjectName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #5b21b6; font-weight: 600;">📖 Topic:</td>
            <td style="padding: 8px 0; color: #4c1d95;">${subjectTopic}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #5b21b6; font-weight: 600;">👥 Students:</td>
            <td style="padding: 8px 0; color: #4c1d95;">${studentCount} enrolled</td>
          </tr>
        </table>
      </div>
      
      <!-- Join Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${meetingLink}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(139,92,246,0.4);">
          🎥 Start Session on Teams
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px; text-align: center;">
        Need to reschedule? You can Postpone or Prepone the session:
      </p>
      
      <!-- Dashboard Link -->
      <div style="text-align: center; margin: 15px 0;">
        <a href="https://mentiby-mentor.vercel.app" style="display: inline-block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">
          Open Mentor Dashboard
        </a>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background: #1f2937; padding: 20px; text-align: center;">
      <p style="color: #9ca3af; margin: 0; font-size: 12px;">
        © 2025 MentiBY. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `
}

