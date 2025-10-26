-- CreateIndex
CREATE INDEX `oauthConsent_userId_clientId_idx` ON `oauthConsent`(`userId`, `clientId`);
