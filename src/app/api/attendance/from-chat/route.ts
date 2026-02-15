/**
 * Attendance from chat (no CSV).
 * For every class in the last 50h: fetch Teams chat, find enrollment IDs in messages
 * (exact match from that cohort's onboarding), then log to attendance_logs and update stu
 * exactly like attendance_processor.py. No 10% rule: present = enrollment ID found in chat.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MS_GRAPH_AUTH_URL = 'https://login.microsoftonline.com'
const MS_GRAPH_API_URL = 'https://graph.microsoft.com/v1.0'

// Parse table name to cohort type and number (e.g. basic6_0_schedule -> Basic, 6.0)
function parseCohortFromTableName(tableName: string): { type: string; number: string } | null {
  const name = tableName.replace('_schedule', '')
  const match = name.match(/^([a-zA-Z]+)(\d+)_(\d+)$/)
  if (!match) return null
  const [, typeRaw, major, minor] = match
  const type = typeRaw.charAt(0).toUpperCase() + typeRaw.slice(1)
  const number = `${major}.${minor}`
  return { type, number }
}

function extractChatThreadId(joinUrl: string | null): string | null {
  if (!joinUrl || !joinUrl.includes('meetup-join/')) return null
  try {
    const m = joinUrl.match(/meetup-join\/([^/]+)/)
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

async function getAccessToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing MS_TENANT_ID, MS_CLIENT_ID, or MS_CLIENT_SECRET')
  }
  const tokenUrl = `${MS_GRAPH_AUTH_URL}/${tenantId}/oauth2/v2.0/token`
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

async function fetchAllChatMessages(accessToken: string, chatId: string): Promise<any[]> {
  const messages: any[] = []
  let url = `${MS_GRAPH_API_URL}/chats/${encodeURIComponent(chatId)}/messages?$top=50&$orderby=createdDateTime desc`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Chat API ${res.status}: ${text}`)
    }
    const data = await res.json()
    messages.push(...(data.value || []))
    url = data['@odata.nextLink'] || null
  }
  return messages
}

function stripHtml(html: string | null | undefined): string {
  if (html == null || typeof html !== 'string') return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Find enrollment IDs that appear in text as whole-word matches (exact match from cohort set)
function findEnrollmentIdsInText(text: string, cohortEnrollmentIds: Set<string>): Set<string> {
  const found = new Set<string>()
  const cleaned = stripHtml(text)
  for (const id of cohortEnrollmentIds) {
    const re = new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (re.test(cleaned)) found.add(id)
  }
  return found
}

// Session is in last 50h if (date + time) in IST is within [now-50h, now]
function isSessionInLast50h(session: { date: string; time?: string | null }): boolean {
  const now = Date.now()
  const cutoff = now - 50 * 60 * 60 * 1000
  const timeStr = session.time && session.time.trim() ? session.time.trim() : '00:00:00'
  const iso = `${session.date}T${timeStr}+05:30`
  const sessionMs = new Date(iso).getTime()
  if (Number.isNaN(sessionMs)) return false
  return sessionMs >= cutoff && sessionMs <= now
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrlB = process.env.NEXT_PUBLIC_SUPABASE_URL_B
    const supabaseKeyB = process.env.SUPABASE_SERVICE_ROLE_KEY_B
    if (!supabaseUrl || !supabaseKey || !supabaseUrlB || !supabaseKeyB) {
      return NextResponse.json(
        { error: 'Missing Supabase env (main and B)' },
        { status: 500 }
      )
    }

    const supabaseMain = createClient(supabaseUrl, supabaseKey)
    const supabaseB = createClient(supabaseUrlB, supabaseKeyB)

    const { data: tablesData, error: tablesError } = await supabaseB.rpc('get_schedule_tables')
    if (tablesError || !tablesData?.length) {
      return NextResponse.json(
        { error: 'Failed to get schedule tables', details: tablesError?.message },
        { status: 500 }
      )
    }
    const cohortTables = (tablesData as { table_name: string }[]).map((r) => r.table_name)

    const accessToken = await getAccessToken()

    const results: Array<{
      table: string
      cohort: string
      sessionId: number
      date: string
      subject: string
      processed: number
      present: number
      absent: number
      stuUpdated: number
      errors: string[]
    }> = []

    const todayStr = new Date().toISOString().slice(0, 10)
    const cutoffDateStr = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString().slice(0, 10)

    for (const tableName of cohortTables) {
      const cohortInfo = parseCohortFromTableName(tableName)
      if (!cohortInfo) continue

      const { data: sessions, error: sessError } = await supabaseB
        .from(tableName)
        .select('id, date, time, subject_name, teams_meeting_link, mentor_id, swapped_mentor_id')
        .gte('date', cutoffDateStr)
        .lte('date', todayStr)
        .not('teams_meeting_link', 'is', null)
        .neq('teams_meeting_link', '')
        .not('session_recording', 'is', null)
        .neq('session_recording', '')
        .order('date', { ascending: true })
        .order('time', { ascending: true })

      if (sessError || !sessions?.length) continue

      for (const session of sessions) {
        if (!isSessionInLast50h(session)) continue

        const cohortType = cohortInfo.type
        const cohortNumber = cohortInfo.number
        const classDate = session.date
        const subject = session.subject_name || ''

        let teacherName = 'Unknown'
        const mentorId = session.swapped_mentor_id ?? session.mentor_id
        if (mentorId) {
          const { data: mentor } = await supabaseB
            .from('Mentor Details')
            .select('Name')
            .eq('mentor_id', mentorId)
            .single()
          if (mentor?.Name) teacherName = mentor.Name
        }

        const { data: existingLogs } = await supabaseMain
          .from('attendance_logs')
          .select('log_id')
          .eq('cohort_type', cohortType)
          .eq('cohort_number', cohortNumber)
          .eq('class_date', classDate)
          .eq('subject', subject)
          .eq('teacher_name', teacherName)
          .limit(1)
        if (existingLogs?.length) continue

        const joinUrl = session.teams_meeting_link
        const chatId = extractChatThreadId(joinUrl)
        if (!chatId) continue

        const { data: onboardingRows } = await supabaseMain
          .from('onboarding')
          .select('EnrollmentID, "Full Name"')
          .eq('Cohort Type', cohortType)
          .eq('Cohort Number', cohortNumber)

        if (!onboardingRows?.length) continue

        const cohortEnrollmentIds = new Set(
          onboardingRows.map((r: any) => String(r.EnrollmentID).trim()).filter(Boolean)
        )
        const cohortStudents = new Map(
          onboardingRows.map((r: any) => [String(r.EnrollmentID).trim(), r['Full Name'] || ''])
        )

        let messages: any[]
        try {
          messages = await fetchAllChatMessages(accessToken, chatId)
        } catch (e) {
          results.push({
            table: tableName,
            cohort: `${cohortType} ${cohortNumber}`,
            sessionId: session.id,
            date: classDate,
            subject,
            processed: 0,
            present: 0,
            absent: 0,
            stuUpdated: 0,
            errors: [(e as Error).message],
          })
          continue
        }

        const foundInChat = new Set<string>()
        for (const m of messages) {
          const body = m.body?.content
          if (body == null) continue
          const found = findEnrollmentIdsInText(body, cohortEnrollmentIds)
          found.forEach((id) => foundInChat.add(id))
        }

        const participants: Array<{ enrollment_id: string; name: string; attendance: boolean }> = []
        for (const enrollmentId of cohortEnrollmentIds) {
          participants.push({
            enrollment_id: enrollmentId,
            name: cohortStudents.get(enrollmentId) || enrollmentId,
            attendance: foundInChat.has(enrollmentId),
          })
        }

        if (participants.length === 0) continue

        const { data: lastLog } = await supabaseMain
          .from('attendance_logs')
          .select('log_id')
          .order('log_id', { ascending: false })
          .limit(1)
          .single()
        let currentLogId = (lastLog?.log_id ?? 0) + 1

        let presentCount = 0
        let absentCount = 0
        const insertErrors: string[] = []

        for (const p of participants) {
          try {
            await supabaseMain.from('attendance_logs').insert({
              log_id: currentLogId,
              enrollment_id: p.enrollment_id,
              cohort_type: cohortType,
              cohort_number: cohortNumber,
              subject,
              class_date: classDate,
              teacher_name: teacherName,
              attendance: p.attendance,
            })
            currentLogId++
            if (p.attendance) presentCount++
            else absentCount++
          } catch (err) {
            insertErrors.push(`${p.enrollment_id}: ${(err as Error).message}`)
          }
        }

        const { data: attendanceRows } = await supabaseMain
          .from('attendance_logs')
          .select('enrollment_id, attendance')
          .eq('class_date', classDate)
          .eq('cohort_type', cohortType)
          .eq('cohort_number', cohortNumber)

        const attendanceLookup: Record<string, boolean> = {}
        for (const r of attendanceRows || []) {
          attendanceLookup[r.enrollment_id] = r.attendance
        }

        const enrollmentIds = Array.from(cohortEnrollmentIds)
        const { data: existingStu } = await supabaseMain
          .from('stu')
          .select('*')
          .in('enrollment_id', enrollmentIds)

        const existingMap = new Map((existingStu || []).map((r: any) => [r.enrollment_id, r]))
        const inserts: any[] = []
        const updates: Array<{ enrollment_id: string; total_classes: number; present_classes: number; overall_attendance: number }> = []

        for (const student of onboardingRows) {
          const enrollmentId = String(student.EnrollmentID).trim()
          const name = student['Full Name'] || ''
          const wasPresent = attendanceLookup[enrollmentId] ?? false
          const existing = existingMap.get(enrollmentId)

          if (existing) {
            const newTotal = existing.total_classes + 1
            const newPresent = existing.present_classes + (wasPresent ? 1 : 0)
            updates.push({
              enrollment_id: enrollmentId,
              total_classes: newTotal,
              present_classes: newPresent,
              overall_attendance: Math.round((newPresent / newTotal) * 100 * 100) / 100,
            })
          } else {
            inserts.push({
              enrollment_id: enrollmentId,
              name,
              cohort_type: cohortType,
              cohort_number: cohortNumber,
              total_classes: 1,
              present_classes: wasPresent ? 1 : 0,
              overall_attendance: wasPresent ? 100 : 0,
            })
          }
        }

        if (inserts.length) {
          await supabaseMain.from('stu').insert(inserts)
        }
        for (const u of updates) {
          const { enrollment_id, ...rest } = u
          await supabaseMain
            .from('stu')
            .update({
              ...rest,
              updated_at: new Date().toISOString(),
            })
            .eq('enrollment_id', enrollment_id)
        }

        results.push({
          table: tableName,
          cohort: `${cohortType} ${cohortNumber}`,
          sessionId: session.id,
          date: classDate,
          subject,
          processed: participants.length,
          present: presentCount,
          absent: absentCount,
          stuUpdated: participants.length,
          errors: insertErrors,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Attendance from chat processed',
      results,
    })
  } catch (e) {
    console.error('attendance/from-chat error:', e)
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to run attendance from chat for last 50h classes. No CSV; enrollment IDs from chat.',
  })
}
