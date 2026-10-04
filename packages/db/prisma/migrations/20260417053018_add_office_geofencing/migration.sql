-- CreateTable
CREATE TABLE "OfficeSettings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Office',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "geofenceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeSettings_pkey" PRIMARY KEY ("id")
);
