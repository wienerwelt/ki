ALTER TABLE public_ai_assistant_settings
ADD COLUMN IF NOT EXISTS avatar_key varchar(20) NOT NULL DEFAULT 'female';

ALTER TABLE public_ai_assistant_settings
DROP CONSTRAINT IF EXISTS public_ai_assistant_settings_avatar_key_check;

ALTER TABLE public_ai_assistant_settings
ADD CONSTRAINT public_ai_assistant_settings_avatar_key_check
CHECK (avatar_key IN ('female', 'male'));

COMMENT ON COLUMN public_ai_assistant_settings.avatar_key IS
'Allowlisted avatar selection for the public AI assistant: female or male.';
