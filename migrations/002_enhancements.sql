-- Add avatar_url and FCM token columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Add soft delete and edit capability to messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS original_content TEXT;

-- Create index for deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted 
ON messages(is_deleted) WHERE is_deleted = false;

-- Comment updates
COMMENT ON COLUMN users.avatar_url IS 'URL to user profile picture';
COMMENT ON COLUMN users.fcm_token IS 'Firebase Cloud Messaging token for push notifications';
COMMENT ON COLUMN messages.is_deleted IS 'Soft delete flag for messages';
COMMENT ON COLUMN messages.original_content IS 'Original content before edit';
