import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, generateStudentEmailHTML, generateMentorEmailHTML } from '@/lib/email'

// This endpoint is called daily at 6:05 AM IST (via Vercel Cron) to send notifications
// for ALL classes happening today

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

            for (const student of students) {
              if (!student.Email) continue

              const emailHtml = generateStudentEmailHTML({
                studentName: student['Full Name'] || 'Student',
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
              
              // Rate limit: wait 600ms between emails (max 2 per second on Resend free plan)
              await new Promise(resolve => setTimeout(resolve, 600))
            }

            // Send email to mentor
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
              mentorNotified: !!mentorEmail
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
      totalStudentEmailsSent: totalEmailsSent,
      totalMentorEmailsSent,
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

