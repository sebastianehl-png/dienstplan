-- AlterTable
ALTER TABLE "Absence" ADD COLUMN     "substituteId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "emergency" TEXT,
ADD COLUMN     "hireDate" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "staffNotes" TEXT,
ADD COLUMN     "weeklyHours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "AbsenceType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "countsAsVacation" BOOLEAN NOT NULL DEFAULT false,
    "countsForLimit" BOOLEAN NOT NULL DEFAULT false,
    "needsApproval" BOOLEAN NOT NULL DEFAULT true,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "AbsenceType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceType_code_key" ON "AbsenceType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AbsenceType_name_key" ON "AbsenceType"("name");
