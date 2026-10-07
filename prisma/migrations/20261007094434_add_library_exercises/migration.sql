-- CreateTable
CREATE TABLE "LibraryExercise" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration" INTEGER,
    "difficulty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryMedia" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "libraryExerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryExercise_ownerId_idx" ON "LibraryExercise"("ownerId");

-- CreateIndex
CREATE INDEX "LibraryExercise_ownerId_category_idx" ON "LibraryExercise"("ownerId", "category");

-- CreateIndex
CREATE INDEX "LibraryExercise_ownerId_createdAt_idx" ON "LibraryExercise"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryMedia_libraryExerciseId_idx" ON "LibraryMedia"("libraryExerciseId");

-- AddForeignKey
ALTER TABLE "LibraryExercise" ADD CONSTRAINT "LibraryExercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryMedia" ADD CONSTRAINT "LibraryMedia_libraryExerciseId_fkey" FOREIGN KEY ("libraryExerciseId") REFERENCES "LibraryExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
