-- Create storage bucket for session images
INSERT INTO storage.buckets (id, name, public) VALUES ('session-images', 'session-images', true);

-- Allow anyone to view session images (public bucket)
CREATE POLICY "Session images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-images');

-- Allow anyone to upload session images (no auth in this app)
CREATE POLICY "Anyone can upload session images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'session-images');

-- Allow anyone to delete session images
CREATE POLICY "Anyone can delete session images"
ON storage.objects FOR DELETE
USING (bucket_id = 'session-images');