-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "requestedExtraButlers" INTEGER NOT NULL DEFAULT 0;
