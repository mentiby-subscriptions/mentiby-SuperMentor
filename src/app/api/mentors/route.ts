import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/mentors - Fetch all mentors from Database B
export async function GET() {
  try {
    const supabaseB = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
      process.env.SUPABASE_SERVICE_ROLE_KEY_B!
    )

    const { data: mentors, error } = await supabaseB
      .from('Mentor Details')
      .select('mentor_id, Name, "Email address", "Mobile number"')
      .order('mentor_id', { ascending: true })

    if (error) {
      console.error('Error fetching mentors:', error)
      return NextResponse.json(
        { error: 'Failed to fetch mentors' },
        { status: 500 }
      )
    }

    // Transform to simpler format
    const mentorList = mentors?.map(m => ({
      id: m.mentor_id,
      name: m.Name,
      email: m['Email address'],
      phone: m['Mobile number']
    })) || []

    return NextResponse.json({ mentors: mentorList })

  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

