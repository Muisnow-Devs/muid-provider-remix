import { auth } from "@/.server/auth";
import prisma from "@/.server/prisma";
import { authClient, redirectToLogin } from "@/components/auth-client";
import { LoaderFunctionArgs, redirect } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    if (!session) {
        return redirectToLogin(encodeURIComponent("/account/connect"));
    }
    
    const clientData = await prisma.oauthConsent.findMany({
        
    })
}

export default function AccountConnectRoute() {
    return <div>Connected Apps</div>;
}