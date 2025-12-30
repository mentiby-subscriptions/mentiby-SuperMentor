-- ============================================
-- Run this SQL in Database B (Mentiby Public Database)
-- This creates/updates the function for auto table creation
-- ============================================

-- Drop existing function if it exists (to update schema)
DROP FUNCTION IF EXISTS create_cohort_schedule_table(TEXT);

-- Create the function to create cohort schedule tables
CREATE OR REPLACE FUNCTION create_cohort_schedule_table(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS public.%I (
      id BIGINT PRIMARY KEY,
      week_number INTEGER,
      session_number INTEGER,
      date DATE,
      time TIME,
      day TEXT,
      session_type TEXT,
      subject_type TEXT,
      subject_name TEXT,
      subject_topic TEXT,
      initial_session_material TEXT,
      session_material TEXT,
      session_recording TEXT,
      mentor_id INTEGER,
      teams_meeting_link TEXT,
      notification_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )', table_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and service_role
GRANT EXECUTE ON FUNCTION create_cohort_schedule_table(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_cohort_schedule_table(TEXT) TO service_role;

-- ============================================
-- After running this, your Cohort Initiator will:
-- 1. Auto-create tables with mentor_id column
-- 2. Assign mentor to all "live session" rows
-- ============================================
