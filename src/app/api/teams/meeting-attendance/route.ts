import { NextRequest, NextResponse } from 'next/server'
import { getMeetingAttendeeCount } from '@/lib/teams-graph'

/**
 * GET /api/teams/meeting-attendance?joinUrl=...
 * Returns totalParticipantCount for the meeting (from Teams attendance report).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const joinUrl = searchParams.get('joinUrl')

    if (!joinUrl || !joinUrl.startsWith('http')) {
      return NextResponse.json({ error: 'Valid joinUrl query parameter required' }, { status: 400 })
    }

    const attendeeCount = await getMeetingAttendeeCount(joinUrl)
    return NextResponse.json({ attendeeCount }, { status: 200 })
  } catch (e) {
    console.error('meeting-attendance error:', e)
    return NextResponse.json(
      { attendeeCount: null, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 200 }
    )
  }
}
