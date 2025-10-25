import "react-router";
import "@/.server/queue/default";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import oidc from "@/.server/oidc";

declare module "react-router" {
    interface AppLoadContext {}
}

export const app = express();
app.use(function (req, res, next) {
    if (req.url === "/.well-known/openid-configuration") {
        req.url = "/oauth2/.well-known/openid-configuration";
    }
    next();
});
app.use("/oauth2", oidc.callback());
app.use(
    createRequestHandler({
        build: () => import("virtual:react-router/server-build"),
        getLoadContext() {
            return {};
        },
    })
);