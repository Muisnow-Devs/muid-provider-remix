import "dotenv/config";
import "@/.server/queue/worker";
import { RouterContextProvider } from "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";
import oidc from "@/.server/oidc";
import { userinfoRoute } from "./userinfo";

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

app.use("/oauth2", userinfoRoute);
app.use("/oauth2", oidc.callback());

const context = new RouterContextProvider();
app.use(
    createRequestHandler({
        build: () => import("virtual:react-router/server-build"),
        // @ts-ignore
        getLoadContext() {
            return context;
        },
    })
);
