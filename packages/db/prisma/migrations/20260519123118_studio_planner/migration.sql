-- CreateEnum
CREATE TYPE "MarketingIdeaStage" AS ENUM ('IDEA', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'LIVE', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingIdeaPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('TWITTER', 'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'TIKTOK', 'THREADS', 'PINTEREST', 'REDDIT', 'WHATSAPP', 'TELEGRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductIdeaStatus" AS ENUM ('IDEA', 'VALIDATING', 'PLANNED', 'BUILDING', 'SHIPPED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TeamToolCategory" AS ENUM ('AI', 'DESIGN', 'DEVELOPMENT', 'MARKETING', 'PRODUCTIVITY', 'ANALYTICS', 'COMMUNICATION', 'RESEARCH', 'OTHER');

-- CreateTable
CREATE TABLE "MarketingIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "stage" "MarketingIdeaStage" NOT NULL DEFAULT 'IDEA',
    "priority" "MarketingIdeaPriority" NOT NULL DEFAULT 'MEDIUM',
    "targetDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingIdeaTask" (
    "id" TEXT NOT NULL,
    "marketingIdeaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingIdeaTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "link" TEXT,
    "marketingIdeaId" TEXT,
    "ownerId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rationale" TEXT,
    "successMetric" TEXT,
    "status" "ProductIdeaStatus" NOT NULL DEFAULT 'IDEA',
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIdeaTask" (
    "id" TEXT NOT NULL,
    "productIdeaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIdeaTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIdeaVote" (
    "id" TEXT NOT NULL,
    "productIdeaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductIdeaVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamTool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "iconUrl" TEXT,
    "category" "TeamToolCategory" NOT NULL DEFAULT 'OTHER',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingIdea_stage_idx" ON "MarketingIdea"("stage");

-- CreateIndex
CREATE INDEX "MarketingIdea_ownerId_idx" ON "MarketingIdea"("ownerId");

-- CreateIndex
CREATE INDEX "MarketingIdea_targetDate_idx" ON "MarketingIdea"("targetDate");

-- CreateIndex
CREATE INDEX "MarketingIdeaTask_marketingIdeaId_sortOrder_idx" ON "MarketingIdeaTask"("marketingIdeaId", "sortOrder");

-- CreateIndex
CREATE INDEX "SocialPost_platform_idx" ON "SocialPost"("platform");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE INDEX "SocialPost_scheduledAt_idx" ON "SocialPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPost_ownerId_idx" ON "SocialPost"("ownerId");

-- CreateIndex
CREATE INDEX "ProductIdea_status_idx" ON "ProductIdea"("status");

-- CreateIndex
CREATE INDEX "ProductIdea_ownerId_idx" ON "ProductIdea"("ownerId");

-- CreateIndex
CREATE INDEX "ProductIdea_voteCount_idx" ON "ProductIdea"("voteCount");

-- CreateIndex
CREATE INDEX "ProductIdeaTask_productIdeaId_sortOrder_idx" ON "ProductIdeaTask"("productIdeaId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductIdeaVote_userId_idx" ON "ProductIdeaVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductIdeaVote_productIdeaId_userId_key" ON "ProductIdeaVote"("productIdeaId", "userId");

-- CreateIndex
CREATE INDEX "TeamTool_category_idx" ON "TeamTool"("category");

-- CreateIndex
CREATE INDEX "TeamTool_isPinned_idx" ON "TeamTool"("isPinned");

-- AddForeignKey
ALTER TABLE "MarketingIdea" ADD CONSTRAINT "MarketingIdea_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingIdeaTask" ADD CONSTRAINT "MarketingIdeaTask_marketingIdeaId_fkey" FOREIGN KEY ("marketingIdeaId") REFERENCES "MarketingIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingIdeaTask" ADD CONSTRAINT "MarketingIdeaTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_marketingIdeaId_fkey" FOREIGN KEY ("marketingIdeaId") REFERENCES "MarketingIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIdea" ADD CONSTRAINT "ProductIdea_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIdeaTask" ADD CONSTRAINT "ProductIdeaTask_productIdeaId_fkey" FOREIGN KEY ("productIdeaId") REFERENCES "ProductIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIdeaTask" ADD CONSTRAINT "ProductIdeaTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIdeaVote" ADD CONSTRAINT "ProductIdeaVote_productIdeaId_fkey" FOREIGN KEY ("productIdeaId") REFERENCES "ProductIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIdeaVote" ADD CONSTRAINT "ProductIdeaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTool" ADD CONSTRAINT "TeamTool_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
