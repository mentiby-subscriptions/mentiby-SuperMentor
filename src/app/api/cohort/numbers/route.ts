import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cohortType = searchParams.get('cohortType')

    if (!cohortType) {
      return NextResponse.json(
        { error: 'Cohort type is required' },
        { status: 400 }
      )
    }

    // Create supabase client for main database (onboarding table)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Query onboarding table to get distinct cohort numbers for the given cohort type
    const { data, error } = await supabase
      .from('onboarding')
      .select('"Cohort Number"')
      .ilike('"Cohort Type"', cohortType)

    if (error) {
      console.error('Error fetching cohort numbers:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Extract unique cohort numbers and sort them
    const uniqueNumbers = [...new Set(
      data
        ?.map(row => row['Cohort Number'])
        .filter(num => num !== null && num !== undefined && num !== '')
    )].sort((a, b) => {
      // Sort numerically (e.g., 1.0, 2.0, 3.0)
      const numA = parseFloat(a)
      const numB = parseFloat(b)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB
      }
      return String(a).localeCompare(String(b))
    })

    return NextResponse.json({ cohortNumbers: uniqueNumbers })

  } catch (error: any) {
    console.error('Error fetching cohort numbers:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    )
  }
}

