-- Store photo capture time (from EXIF DateTimeOriginal) alongside URLs
-- so gallery can sort chronologically without per-photo client-side EXIF
-- fetches. Sharp-generated _display.jpg has EXIF stripped, so previously
-- exifr on the client returned nothing → fallback to filename ordering.

ALTER TABLE photo_urls_cache
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ NULL;
