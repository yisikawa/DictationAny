-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "mediaFileName" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "mediaSizeBytes" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "sttProvider" TEXT;
