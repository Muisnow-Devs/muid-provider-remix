/*
  Warnings:

  - Made the column `clientId` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clientSecret` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `redirectURLs` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `type` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clientId` on table `oauthconsent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `oauthconsent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `scopes` on table `oauthconsent` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `oauthConsent` DROP FOREIGN KEY `oauthConsent_clientId_fkey`;

-- DropForeignKey
ALTER TABLE `oauthConsent` DROP FOREIGN KEY `oauthConsent_userId_fkey`;

-- DropIndex
DROP INDEX `oauthConsent_clientId_fkey` ON `oauthConsent`;

-- AlterTable
ALTER TABLE `oauthApplication` MODIFY `clientId` VARCHAR(191) NOT NULL,
    MODIFY `clientSecret` VARCHAR(191) NOT NULL,
    MODIFY `redirectURLs` VARCHAR(191) NOT NULL,
    MODIFY `type` VARCHAR(191) NOT NULL DEFAULT 'web',
    MODIFY `createdAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `updatedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `oauthConsent` MODIFY `clientId` VARCHAR(191) NOT NULL,
    MODIFY `userId` VARCHAR(191) NOT NULL,
    MODIFY `scopes` TEXT NOT NULL,
    MODIFY `createdAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `updatedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE `oauthConsent` ADD CONSTRAINT `oauthConsent_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `oauthApplication`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauthConsent` ADD CONSTRAINT `oauthConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
