-- CreateTable
CREATE TABLE "working_hours" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "openTime" TIME(0) NOT NULL,
    "closeTime" TIME(0) NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_history" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "intentKind" VARCHAR(50) NOT NULL,
    "intentParams" JSONB NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL,

    CONSTRAINT "change_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "working_hours_doctorId_day_key" ON "working_hours"("doctorId", "day");

-- CreateIndex
CREATE INDEX "appointments_doctorId_day_idx" ON "appointments"("doctorId", "day");
