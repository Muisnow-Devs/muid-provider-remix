/*
  Warnings:

  - Made the column `createdAt` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `oauthapplication` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `oauthconsent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updatedAt` on table `oauthconsent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `passkey` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `oauthApplication` MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `oauthConsent` MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `passkey` MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
