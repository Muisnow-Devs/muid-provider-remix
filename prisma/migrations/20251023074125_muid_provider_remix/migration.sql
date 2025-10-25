/*
  Warnings:

  - A unique constraint covering the columns `[scope]` on the table `oidcScope` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `oidcScope_scope_key` ON `oidcScope`(`scope`);
