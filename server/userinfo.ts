import provider, { getUserInfoByScopes } from '@/.server/oidc';
import express from 'express';

export const userinfoRoute = express();
userinfoRoute.get('/me', async (req, res) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const ac = await provider.AccessToken.find(accessToken);
    const grant = ac && await provider.Grant.find(ac.grantId);
    
    if (!ac || !grant) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userInfo = await getUserInfoByScopes(ac.accountId);
    if (!userInfo) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json(await userInfo.claims('', ac.scope ?? ""));
});
