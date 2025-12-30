-- Run this in Database B (NEXT_PUBLIC_SUPABASE_URL_B) SQL Editor
-- This function returns all cohort schedule tables dynamically

CREATE OR REPLACE FUNCTION get_schedule_tables()
RETURNS TABLE(table_name text) AS $$
BEGIN
  RETURN QUERY
  SELECT t.tablename::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename LIKE '%_schedule'
    AND t.tablename NOT LIKE '%gen_schedule';  -- Exclude template tables
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_schedule_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION get_schedule_tables() TO anon;
GRANT EXECUTE ON FUNCTION get_schedule_tables() TO service_role;

