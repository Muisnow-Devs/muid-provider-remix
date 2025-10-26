/*
  Warnings:

  - You are about to drop the column `accountRemoveURL` on the `oauthapplication` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `oauthapplication` DROP COLUMN `accountRemoveURL`,
    ADD COLUMN `webhook` VARCHAR(191) NULL;
