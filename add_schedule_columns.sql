-- =============================================
-- Run this SQL in Database B (Mentiby Public Database)
-- This adds the necessary columns for Teams meeting links
-- =============================================

-- Add teams_meeting_link column to each schedule table
-- Run for each cohort table that exists

-- For Basic 1.0
ALTER TABLE IF EXISTS public.basic1_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Basic 2.0
ALTER TABLE IF EXISTS public.basic2_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Basic 3.0
ALTER TABLE IF EXISTS public.basic3_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Basic 4.0
ALTER TABLE IF EXISTS public.basic4_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Basic 5.0
ALTER TABLE IF EXISTS public.basic5_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Placement 2.0
ALTER TABLE IF EXISTS public.placement2_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- For Placement 3.0
ALTER TABLE IF EXISTS public.placement3_0_schedule 
ADD COLUMN IF NOT EXISTS teams_meeting_link TEXT,
ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;

-- =============================================
-- After running this, your schedule tables will have:
-- - teams_meeting_link: Stores the MS Teams meeting URL
-- - notification_sent: Tracks if reminder email was sent
-- =============================================

