import { NextResponse } from 'next/server'
import { sendEmail, generateStudentEmailHTML, generateMentorEmailHTML } from '@/lib/email'

// Test endpoint to verify email system is working
// GET /api/scheduler/test?email=your@email.com

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const testEmail = searchParams.get('email')

    if (!testEmail) {
      return NextResponse.json({
        error: 'Please provide an email parameter: /api/scheduler/test?email=your@email.com',
        usage: {
          description: 'This endpoint sends a test email to verify the email system',
          example: '/api/scheduler/test?email=test@example.com'
        }
      }, { status: 400 })
    }

    // Generate sample student email
    const studentEmailHtml = generateStudentEmailHTML({
      studentName: 'Test Student',
      sessionDate: 'Monday, January 6, 2025',
      sessionTime: '7:00 PM',
      sessionDay: 'Monday',
      subjectName: 'Python',
      subjectTopic: 'Getting Started with Python',
      sessionType: 'Live Session',
      meetingLink: 'https://teams.microsoft.com/l/meetup-join/test-meeting',
      mentorName: 'Test Mentor'
    })

    // Generate sample mentor email
    const mentorEmailHtml = generateMentorEmailHTML({
      mentorName: 'Test Mentor',
      sessionDate: 'Monday, January 6, 2025',
      sessionTime: '7:00 PM',
      sessionDay: 'Monday',
      subjectName: 'Python',
      subjectTopic: 'Getting Started with Python',
      sessionType: 'Live Session',
      meetingLink: 'https://teams.microsoft.com/l/meetup-join/test-meeting',
      cohortName: 'Basic 2.0',
      studentCount: 25
    })

    // Send test student email
    const studentSent = await sendEmail({
      to: testEmail,
      subject: '🧪 [TEST] Student Session Reminder - MentiBY',
      html: studentEmailHtml
    })

    // Send test mentor email
    const mentorSent = await sendEmail({
      to: testEmail,
      subject: '🧪 [TEST] Mentor Session Reminder - MentiBY',
      html: mentorEmailHtml
    })

    return NextResponse.json({
      success: true,
      message: 'Test emails sent!',
      results: {
        studentEmail: {
          sent: studentSent,
          to: testEmail,
          type: 'Student notification'
        },
        mentorEmail: {
          sent: mentorSent,
          to: testEmail,
          type: 'Mentor notification'
        }
      },
      note: studentSent && mentorSent 
        ? 'Check your inbox (and spam folder) for the test emails!'
        : 'Email sending may have failed. Check RESEND_API_KEY configuration.'
    })

  } catch (error: any) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { error: error.message || 'Test failed' },
      { status: 500 }
    )
  }
}

