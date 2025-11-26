/*
  Warnings:

  - You are about to drop the column `webhook` on the `oauthapplication` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `oauthapplication` DROP COLUMN `webhook`,
    ADD COLUMN `privacyURL` VARCHAR(191) NULL,
    ADD COLUMN `tosURL` VARCHAR(191) NULL;
