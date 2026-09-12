-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "couple" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "wishDateLabel" TEXT NOT NULL,
    "venueLabel" TEXT NOT NULL,
    "guestsLabel" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedPlan" TEXT NOT NULL,
    "confirmDate" TEXT NOT NULL,
    "confirmTime" TEXT NOT NULL,
    "confirmVenue" TEXT NOT NULL,
    "confirmPlan" TEXT NOT NULL,
    "confirmButlers" INTEGER NOT NULL,
    "confirmExtraGuests" INTEGER NOT NULL,
    "confirmDiscount" INTEGER NOT NULL DEFAULT 0,
    "confirmHours" TEXT NOT NULL,
    "confirmNote" TEXT NOT NULL DEFAULT '',
    "alimtalkAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
