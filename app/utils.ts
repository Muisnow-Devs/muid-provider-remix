import { redirect } from "react-router";

export const redirectToLogin = (url: string) => {
    return redirect("/auth/sign-in?redirectTo=" + encodeURIComponent(url));
};
