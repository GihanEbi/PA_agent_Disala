/*
  Warnings:

  - You are about to drop the column `accessToken` on the `connected_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `connected_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `tokenExpiresAt` on the `connected_accounts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "connected_accounts" DROP COLUMN "accessToken",
DROP COLUMN "refreshToken",
DROP COLUMN "tokenExpiresAt",
ADD COLUMN     "providerEmail" TEXT;
