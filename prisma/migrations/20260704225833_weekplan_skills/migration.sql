-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jobRole" TEXT NOT NULL DEFAULT 'OBERARZT';

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "validFrom" TEXT,
    "validTo" TEXT,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekCell" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "userId" TEXT,
    "text" TEXT,

    CONSTRAINT "WeekCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RowDefault" (
    "rowKey" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "RowDefault_pkey" PRIMARY KEY ("rowKey")
);

-- CreateTable
CREATE TABLE "SpecialRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rowKey" TEXT,
    "weekday" INTEGER NOT NULL,
    "interval" TEXT NOT NULL DEFAULT 'EVERY',
    "refDate" TEXT,
    "validFrom" TEXT,
    "validTo" TEXT,
    "note" TEXT,

    CONSTRAINT "SpecialRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSkill_skill_idx" ON "UserSkill"("skill");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_skill_key" ON "UserSkill"("userId", "skill");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_weekStart_key" ON "WeekPlan"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeekCell_planId_rowKey_day_key" ON "WeekCell"("planId", "rowKey", "day");

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekCell" ADD CONSTRAINT "WeekCell_planId_fkey" FOREIGN KEY ("planId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
