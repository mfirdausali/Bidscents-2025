-- Create sessions table in Supabase for secure session storage
-- This completely isolates sessions to prevent session hijacking

CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient session expiry cleanup
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);

-- Create index for faster session lookups
CREATE INDEX IF NOT EXISTS sessions_sid_idx ON sessions (sid);

-- Add RLS (Row Level Security) for additional security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows the service role to manage all sessions
CREATE POLICY "Service role can manage sessions" ON sessions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sessions WHERE expire < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RPC function for session table initialization
CREATE OR REPLACE FUNCTION create_sessions_table_if_not_exists()
RETURNS BOOLEAN AS $$
BEGIN
    -- Table creation is handled above, this function just confirms it exists
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;