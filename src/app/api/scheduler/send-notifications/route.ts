import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, generateStudentEmailHTML, generateMentorEmailHTML } from '@/lib/email'

// This endpoint is called daily at 9:00 AM IST (via Vercel Cron) to send notifications
// for ALL classes happening today - sends both Email and WhatsApp messages

// WhatsApp Cloud API Configuration
const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

// Format phone number for WhatsApp (must be E.164 format without +)
function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null
  
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '')
  
  // Handle Indian numbers
  if (cleaned.length === 10) {
    // Add India country code
    cleaned = '91' + cleaned
  } else if (cleaned.startsWith('0')) {
    // Remove leading 0 and add country code
    cleaned = '91' + cleaned.substring(1)
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1)
  }
  
  // Validate length (should be 12 for Indian numbers: 91 + 10 digits)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null
  }
  
  return cleaned
}

// Send WhatsApp template message
async function sendWhatsAppMessage(params: {
  to: string // Phone number in E.164 format (without +)
  templateName: string
  templateLanguage?: string
  components?: any[] // Template components with variables
}): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  
  if (!phoneNumberId || !accessToken) {
    console.log('WhatsApp not configured - skipping WhatsApp message')
    return false
  }
  
  try {
    const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`
    
    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'template',
      template: {
        name: params.templateName,
        language: {
          code: params.templateLanguage || 'en'
        }
      }
    }
    
    // Add components if provided (for variable substitution)
    if (params.components && params.components.length > 0) {
      body.template.components = params.components
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      const errorData = await response.text()
      console.error(`WhatsApp API error for ${params.to}:`, errorData)
      return false
    }
    
    const data = await response.json()
    console.log(`✅ WhatsApp sent to ${params.to}, message_id: ${data.messages?.[0]?.id}`)
    return true
    
  } catch (error: any) {
    console.error(`WhatsApp send error for ${params.to}:`, error.message)
    return false
  }
}

// Build WhatsApp template components for student notification
function buildStudentWhatsAppComponents(params: {
  studentName: string
  sessionDate: string
  sessionTime: string
  subjectName: string
  subjectTopic: string
  meetingLink: string
  mentorName: string
}): any[] {
  // This matches a template like:
  // "Hi {{1}}, you have a class on {{2}} at {{3}}. Subject: {{4}} - {{5}}. Mentor: {{6}}. Join: {{7}}"
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: params.studentName },
        { type: 'text', text: params.sessionDate },
        { type: 'text', text: params.sessionTime },
        { type: 'text', text: params.subjectName },
        { type: 'text', text: params.subjectTopic || 'Session' },
        { type: 'text', text: params.mentorName },
        { type: 'text', text: params.meetingLink || 'Check Dashboard' }
      ]
    }
  ]
}

// Build WhatsApp template components for mentor notification
function buildMentorWhatsAppComponents(params: {
  mentorName: string
  cohortName: string
  sessionDate: string
  sessionTime: string
  subjectName: string
  subjectTopic: string
  studentCount: number
  meetingLink: string
}): any[] {
  // This matches a template like:
  // "Hi {{1}}, reminder: You have a session for {{2}} on {{3}} at {{4}}. Topic: {{5}} - {{6}}. Students: {{7}}. Join: {{8}}"
  return [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: params.mentorName },
        { type: 'text', text: params.cohortName },
        { type: 'text', text: params.sessionDate },
        { type: 'text', text: params.sessionTime },
        { type: 'text', text: params.subjectName },
        { type: 'text', text: params.subjectTopic || 'Session' },
        { type: 'text', text: String(params.studentCount) },
        { type: 'text', text: params.meetingLink || 'Check Dashboard' }
      ]
    }
  ]
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
    const supabaseMain = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    // Get today's date in IST (UTC+5:30)
    const now = new Date()
    // Convert to IST by adding 5 hours 30 minutes
    const istOffset = 5.5 * 60 * 60 * 1000
    const istNow = new Date(now.getTime() + istOffset)
    const todayIST = istNow.toISOString().split('T')[0]

    console.log(`Sending notifications for all classes on ${todayIST} (IST)`)

    // Fetch all mentors for lookup
    const { data: allMentors } = await supabaseB
      .from('Mentor Details')
      .select('*')
    
    const mentorMap = new Map<number, any>()
    if (allMentors) {
      for (const mentor of allMentors) {
        mentorMap.set(mentor.mentor_id, mentor)
      }
      console.log(`Loaded ${allMentors.length} mentors. Sample:`, allMentors[0] ? { id: allMentors[0].mentor_id, name: allMentors[0].Name, email: allMentors[0]['Email address'] } : 'none')
    } else {
      console.log('WARNING: No mentors loaded from database!')
    }
    
    // Helper to get mentor info
    const getMentorInfo = (mentorId: number | null) => {
      const mentor = mentorMap.get(mentorId || 1) || mentorMap.get(1)
      return {
        name: mentor?.Name || 'MentiBY Team',
        email: mentor?.['Email address'] || null
      }
    }

    // Get cohort types dynamically from onboarding table
    const { data: cohortTypes } = await supabaseMain
      .from('onboarding')
      .select('"Cohort Type", "Cohort Number"')
    
    // Build cohort mapping dynamically
    const cohortMapping: Record<string, string> = {}
    const seenCohorts = new Set<string>()
    
    if (cohortTypes) {
      for (const row of cohortTypes) {
        const cohortType = row['Cohort Type']
        const cohortNumber = row['Cohort Number']
        if (cohortType && cohortNumber) {
          const key = `${cohortType} ${cohortNumber}`
          if (!seenCohorts.has(key)) {
            seenCohorts.add(key)
            // Convert to table name format: "Basic 2.0" -> "basic2_0_schedule"
            const tableName = `${cohortType.toLowerCase()}${cohortNumber.replace('.', '_')}_schedule`
            cohortMapping[key] = tableName
          }
        }
      }
    }
    
    // Fallback if no cohorts found
    if (Object.keys(cohortMapping).length === 0) {
      console.log('No cohorts found in onboarding, using fallback')
      Object.assign(cohortMapping, {
        'Basic 1.0': 'basic1_0_schedule',
        'Basic 1.1': 'basic1_1_schedule',
        'Basic 2.0': 'basic2_0_schedule',
        'Placement 2.0': 'placement2_0_schedule'
      })
    }
    
    console.log('Active cohorts:', Object.keys(cohortMapping))

    const results: any[] = []
    let totalEmailsSent = 0
    let totalMentorEmailsSent = 0
    let totalWhatsAppSent = 0
    let totalMentorWhatsAppSent = 0
    
    // WhatsApp template names (create these in Meta Business Manager)
    const STUDENT_WA_TEMPLATE = process.env.WHATSAPP_STUDENT_TEMPLATE || 'class_reminder_student'
    const MENTOR_WA_TEMPLATE = process.env.WHATSAPP_MENTOR_TEMPLATE || 'class_reminder_mentor'

    for (const [cohortKey, tableName] of Object.entries(cohortMapping)) {
      try {
        const [cohortType, cohortNumber] = cohortKey.split(' ')

        // Fetch all sessions for today
        const { data: sessions, error: fetchError } = await supabaseB
          .from(tableName)
          .select('*')
          .eq('date', todayIST)

        if (fetchError) {
          console.log(`Skipping ${tableName}: ${fetchError.message}`)
          continue
        }

        if (!sessions || sessions.length === 0) {
          continue
        }

        // Process each session for today
        for (const session of sessions) {
          // Skip if no time set or already notified
          if (!session.time) continue
          
          // Check if we already sent notification (prevent duplicates)
          if (session.notification_sent) {
            console.log(`Notification already sent for session ${session.id}`)
            continue
          }

          console.log(`Sending notification for: ${tableName}, session ${session.id}, time ${session.time}`)

          // Get students in this cohort
            const { data: students, error: studentsError } = await supabaseMain
              .from('onboarding')
              .select('*')
              .eq('Cohort Type', cohortType)
              .eq('Cohort Number', cohortNumber)

            if (studentsError || !students) {
              console.error(`Error fetching students for ${cohortKey}:`, studentsError)
              continue
            }

            // Send emails to students
            const sessionDate = new Date(session.date).toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })

            const sessionTime = session.time 
              ? new Date(`2000-01-01T${session.time}`).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })
              : 'Check Dashboard'

            // Get mentor info for this session
            const mentorInfo = getMentorInfo(session.mentor_id)
            const mentorName = mentorInfo.name
            const mentorEmail = mentorInfo.email
            
            console.log(`Session ${session.id} - mentor_id: ${session.mentor_id}, mentorName: ${mentorName}, mentorEmail: ${mentorEmail || 'NOT FOUND'}`)

            let studentEmailsSent = 0
            let studentWhatsAppSent = 0

            for (const student of students) {
              const studentName = student['Full Name'] || 'Student'
              
              // Send Email
              if (student.Email) {
                const emailHtml = generateStudentEmailHTML({
                  studentName,
                  sessionDate,
                  sessionTime,
                  sessionDay: session.day || '',
                  subjectName: session.subject_name || 'Session',
                  subjectTopic: session.subject_topic || '',
                  sessionType: session.session_type || 'Live Session',
                  meetingLink: session.teams_meeting_link,
                  mentorName
                })

                const sent = await sendEmail({
                  to: student.Email,
                  subject: `🎓 Upcoming Session: ${session.subject_name} - ${session.subject_topic}`,
                  html: emailHtml
                })

                if (sent) {
                  studentEmailsSent++
                  totalEmailsSent++
                }
              }
              
              // Send WhatsApp
              const studentPhone = formatPhoneForWhatsApp(student['Phone Number'] || student.Phone || student.phone)
              if (studentPhone) {
                const waComponents = buildStudentWhatsAppComponents({
                  studentName,
                  sessionDate,
                  sessionTime,
                  subjectName: session.subject_name || 'Session',
                  subjectTopic: session.subject_topic || '',
                  meetingLink: session.teams_meeting_link || 'Check Dashboard',
                  mentorName
                })
                
                const waSent = await sendWhatsAppMessage({
                  to: studentPhone,
                  templateName: STUDENT_WA_TEMPLATE,
                  components: waComponents
                })
                
                if (waSent) {
                  studentWhatsAppSent++
                  totalWhatsAppSent++
                }
              }
              
              // Rate limit: wait 600ms between messages (for both Resend and WhatsApp)
              await new Promise(resolve => setTimeout(resolve, 600))
            }

            // Send email and WhatsApp to mentor
            const mentorData = mentorMap.get(session.mentor_id || 1)
            const mentorPhone = formatPhoneForWhatsApp(mentorData?.['Phone Number'] || mentorData?.Phone || mentorData?.phone)
            
            if (mentorEmail) {
              console.log(`Sending mentor email to: ${mentorEmail}`)
              const mentorEmailHtml = generateMentorEmailHTML({
                mentorName,
                sessionDate,
                sessionTime,
                sessionDay: session.day || '',
                subjectName: session.subject_name || 'Session',
                subjectTopic: session.subject_topic || '',
                sessionType: session.session_type || 'Live Session',
                meetingLink: session.teams_meeting_link,
                cohortName: cohortKey,
                studentCount: students.length
              })

              const mentorSent = await sendEmail({
                to: mentorEmail,
                subject: `📚 Mentor Reminder: ${cohortKey} - ${session.subject_name}`,
                html: mentorEmailHtml
              })

              if (mentorSent) {
                totalMentorEmailsSent++
                console.log(`✅ Mentor email sent successfully to ${mentorEmail}`)
              } else {
                console.log(`❌ Failed to send mentor email to ${mentorEmail}`)
              }
              // Rate limit delay after mentor email
              await new Promise(resolve => setTimeout(resolve, 600))
            } else {
              console.log(`⚠️ No mentor email found for session ${session.id} (mentor_id: ${session.mentor_id})`)
            }
            
            // Send WhatsApp to mentor
            if (mentorPhone) {
              console.log(`Sending mentor WhatsApp to: ${mentorPhone}`)
              const mentorWaComponents = buildMentorWhatsAppComponents({
                mentorName,
                cohortName: cohortKey,
                sessionDate,
                sessionTime,
                subjectName: session.subject_name || 'Session',
                subjectTopic: session.subject_topic || '',
                studentCount: students.length,
                meetingLink: session.teams_meeting_link || 'Check Dashboard'
              })
              
              const mentorWaSent = await sendWhatsAppMessage({
                to: mentorPhone,
                templateName: MENTOR_WA_TEMPLATE,
                components: mentorWaComponents
              })
              
              if (mentorWaSent) {
                totalMentorWhatsAppSent++
                console.log(`✅ Mentor WhatsApp sent successfully to ${mentorPhone}`)
              } else {
                console.log(`❌ Failed to send mentor WhatsApp to ${mentorPhone}`)
              }
              // Rate limit delay
              await new Promise(resolve => setTimeout(resolve, 600))
            } else {
              console.log(`⚠️ No mentor phone found for session ${session.id}`)
            }

            // Mark notification as sent (if column exists)
            try {
              await supabaseB
                .from(tableName)
                .update({ notification_sent: true })
                .eq('id', session.id)
            } catch (e) {
              // Column might not exist, that's ok
            }

            results.push({
              cohort: cohortKey,
              sessionId: session.id,
              subject: session.subject_name,
              topic: session.subject_topic,
              time: session.time,
              studentEmailsSent,
              studentWhatsAppSent,
              mentorEmailSent: !!mentorEmail,
              mentorWhatsAppSent: !!mentorPhone
            })
        }

      } catch (cohortError: any) {
        console.error(`Error processing ${tableName}:`, cohortError)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      notificationDate: todayIST,
      email: {
        studentsSent: totalEmailsSent,
        mentorsSent: totalMentorEmailsSent
      },
      whatsapp: {
        studentsSent: totalWhatsAppSent,
        mentorsSent: totalMentorWhatsAppSent
      },
      sessionsNotified: results.length,
      details: results
    })

  } catch (error: any) {
    console.error('Notification scheduler error:', error)
    return NextResponse.json(
      { error: error.message || 'Notification scheduler failed' },
      { status: 500 }
    )
  }
}

// Also support GET for manual testing
export async function GET(request: Request) {
  return POST(request)
}

