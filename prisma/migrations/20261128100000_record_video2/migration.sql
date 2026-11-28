-- 양가 요금제(스몰양가·프리미엄) 신부측 영상
ALTER TABLE "RecordLink" ADD COLUMN IF NOT EXISTS "videoUrl2" TEXT NOT NULL DEFAULT '';
