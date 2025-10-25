/*
  Warnings:

  - You are about to drop the column `scope` on the `oidcscope` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `oidcScope_scope_key` ON `oidcscope`;

-- AlterTable
ALTER TABLE `oidcscope` DROP COLUMN `scope`;
