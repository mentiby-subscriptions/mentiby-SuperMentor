import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET - Fetch current enrollment config
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabase
      .from('enrollment_config')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .single()

    if (error) {
      console.error('Error fetching enrollment config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Update enrollment config
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { starting_enrollment_number, cohort_type, cohort_number } = body

    if (!cohort_type || !cohort_number) {
      return NextResponse.json(
        { error: 'cohort_type and cohort_number are required' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get the first row ID
    const { data: existingConfig } = await supabase
      .from('enrollment_config')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .single()

    if (!existingConfig) {
      // Create if doesn't exist
      const { data, error } = await supabase
        .from('enrollment_config')
        .insert({
          starting_enrollment_number: starting_enrollment_number || 2501,
          cohort_type,
          cohort_number
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, config: data })
    }

    // Update the first row
    const { data, error } = await supabase
      .from('enrollment_config')
      .update({
        starting_enrollment_number: starting_enrollment_number || existingConfig.id,
        cohort_type,
        cohort_number
      })
      .eq('id', existingConfig.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating enrollment config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: data })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
