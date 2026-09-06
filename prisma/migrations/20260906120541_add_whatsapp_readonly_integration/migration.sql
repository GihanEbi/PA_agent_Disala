-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('PENDING_QR', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'PENDING_QR',
    "sessionState" JSONB,
    "riskAcknowledgedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_synced_chats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "chatName" TEXT,
    "syncing" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_synced_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatJid" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "senderJid" TEXT NOT NULL,
    "senderName" TEXT,
    "text" TEXT NOT NULL,
    "isFromMe" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_userId_key" ON "whatsapp_connections"("userId");

-- CreateIndex
CREATE INDEX "whatsapp_synced_chats_userId_idx" ON "whatsapp_synced_chats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_synced_chats_userId_chatJid_key" ON "whatsapp_synced_chats"("userId", "chatJid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_userId_chatJid_sentAt_idx" ON "whatsapp_messages"("userId", "chatJid", "sentAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_sentAt_idx" ON "whatsapp_messages"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_userId_chatJid_waMessageId_key" ON "whatsapp_messages"("userId", "chatJid", "waMessageId");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_synced_chats" ADD CONSTRAINT "whatsapp_synced_chats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_synced_chats" ADD CONSTRAINT "whatsapp_synced_chats_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
