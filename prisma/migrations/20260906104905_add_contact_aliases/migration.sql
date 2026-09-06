-- CreateTable
CREATE TABLE "contact_aliases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_aliases_userId_idx" ON "contact_aliases"("userId");

-- CreateIndex
CREATE INDEX "contact_aliases_contactId_idx" ON "contact_aliases"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_aliases_userId_alias_key" ON "contact_aliases"("userId", "alias");

-- AddForeignKey
ALTER TABLE "contact_aliases" ADD CONSTRAINT "contact_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_aliases" ADD CONSTRAINT "contact_aliases_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
