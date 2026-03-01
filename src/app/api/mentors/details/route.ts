import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseB() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL_B!,
    process.env.SUPABASE_SERVICE_ROLE_KEY_B!
  )
}

// GET /api/mentors/details - Fetch all mentor details
export async function GET() {
  try {
    const supabaseB = getSupabaseB()

    const { data: mentors, error } = await supabaseB
      .from('Mentor Details')
      .select('*')
      .order('mentor_id', { ascending: true })

    if (error) {
      console.error('Error fetching mentor details:', error)
      return NextResponse.json({ error: 'Failed to fetch mentor details' }, { status: 500 })
    }

    return NextResponse.json({ mentors: mentors || [] })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}

// PUT /api/mentors/details - Update a mentor field
export async function PUT(request: NextRequest) {
  try {
    const supabaseB = getSupabaseB()
    const { mentor_id, field, value } = await request.json()

    if (!mentor_id || !field) {
      return NextResponse.json({ error: 'mentor_id and field are required' }, { status: 400 })
    }

    const { data, error } = await supabaseB
      .from('Mentor Details')
      .update({ [field]: value })
      .eq('mentor_id', mentor_id)
      .select()

    if (error) {
      console.error('Error updating mentor:', error)
      return NextResponse.json({ error: `Failed to update mentor: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ mentor: data?.[0] || null })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}

// POST /api/mentors/details - Add a new mentor
export async function POST(request: NextRequest) {
  try {
    const supabaseB = getSupabaseB()
    const mentorData = await request.json()

    const { data, error } = await supabaseB
      .from('Mentor Details')
      .insert([mentorData])
      .select()

    if (error) {
      console.error('Error adding mentor:', error)
      return NextResponse.json({ error: `Failed to add mentor: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ mentor: data?.[0] || null })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}

// DELETE /api/mentors/details - Delete mentors
export async function DELETE(request: NextRequest) {
  try {
    const supabaseB = getSupabaseB()
    const { mentor_ids } = await request.json()

    if (!mentor_ids || !Array.isArray(mentor_ids) || mentor_ids.length === 0) {
      return NextResponse.json({ error: 'mentor_ids array is required' }, { status: 400 })
    }

    const { error } = await supabaseB
      .from('Mentor Details')
      .delete()
      .in('mentor_id', mentor_ids)

    if (error) {
      console.error('Error deleting mentors:', error)
      return NextResponse.json({ error: `Failed to delete mentors: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 })
  }
}
