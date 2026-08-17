-- Reproduzierbare, widerrufbare Direktlinks fuer Dokumente in der Datencloud.
-- Bestehende Installationen koennen einzelne Spalten bereits manuell besitzen;
-- deshalb ist jede Schemaerweiterung idempotent.
ALTER TABLE public.business_partner_files
    ADD COLUMN IF NOT EXISTS public_link_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS public_token_hash text,
    ADD COLUMN IF NOT EXISTS public_token_preview varchar(12),
    ADD COLUMN IF NOT EXISTS public_link_created_at timestamptz,
    ADD COLUMN IF NOT EXISTS public_link_created_by uuid,
    ADD COLUMN IF NOT EXISTS public_download_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS public_link_download_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS public_link_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS public_max_downloads integer,
    ADD COLUMN IF NOT EXISTS public_last_downloaded_at timestamptz,
    ADD COLUMN IF NOT EXISTS malware_scan_status varchar(20) NOT NULL DEFAULT 'not_scanned',
    ADD COLUMN IF NOT EXISTS malware_scanned_at timestamptz,
    ADD COLUMN IF NOT EXISTS malware_scan_details text;

UPDATE public.business_partner_files
SET public_download_count = GREATEST(COALESCE(public_download_count, 0), 0),
    public_link_download_count = GREATEST(COALESCE(public_link_download_count, 0), 0),
    public_link_enabled = CASE
        WHEN public_token_hash IS NULL THEN false
        ELSE COALESCE(public_link_enabled, false)
    END,
    public_max_downloads = CASE
        WHEN public_max_downloads IS NULL THEN NULL
        WHEN public_max_downloads BETWEEN 1 AND 1000000 THEN public_max_downloads
        ELSE NULL
    END,
    malware_scan_status = CASE
        WHEN malware_scan_status IN ('not_scanned', 'clean', 'infected', 'scan_error') THEN malware_scan_status
        ELSE 'not_scanned'
    END;

UPDATE public.business_partner_files bpf
SET public_link_created_by = NULL
WHERE public_link_created_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = bpf.public_link_created_by
  );

ALTER TABLE public.business_partner_files
    ALTER COLUMN public_link_enabled SET DEFAULT false,
    ALTER COLUMN public_link_enabled SET NOT NULL,
    ALTER COLUMN public_download_count SET DEFAULT 0,
    ALTER COLUMN public_download_count SET NOT NULL,
    ALTER COLUMN public_link_download_count SET DEFAULT 0,
    ALTER COLUMN public_link_download_count SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'business_partner_files_public_created_by_fkey'
          AND conrelid = 'public.business_partner_files'::regclass
    ) THEN
        ALTER TABLE public.business_partner_files
            ADD CONSTRAINT business_partner_files_public_created_by_fkey
            FOREIGN KEY (public_link_created_by)
            REFERENCES public.users (id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'business_partner_files_public_downloads_check'
          AND conrelid = 'public.business_partner_files'::regclass
    ) THEN
        ALTER TABLE public.business_partner_files
            ADD CONSTRAINT business_partner_files_public_downloads_check
            CHECK (public_download_count >= 0 AND public_link_download_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'business_partner_files_public_max_downloads_check'
          AND conrelid = 'public.business_partner_files'::regclass
    ) THEN
        ALTER TABLE public.business_partner_files
            ADD CONSTRAINT business_partner_files_public_max_downloads_check
            CHECK (public_max_downloads IS NULL OR public_max_downloads BETWEEN 1 AND 1000000);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'business_partner_files_malware_scan_status_check'
          AND conrelid = 'public.business_partner_files'::regclass
    ) THEN
        ALTER TABLE public.business_partner_files
            ADD CONSTRAINT business_partner_files_malware_scan_status_check
            CHECK (malware_scan_status IN ('not_scanned', 'clean', 'infected', 'scan_error'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_partner_files_public_token_hash
    ON public.business_partner_files (public_token_hash)
    WHERE public_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_partner_files_public_active
    ON public.business_partner_files (public_link_expires_at)
    WHERE public_link_enabled = true;
