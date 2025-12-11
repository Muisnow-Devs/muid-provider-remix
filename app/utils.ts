import { redirect } from "react-router";

export const redirectToLogin = (url: string) => {
    return redirect("/auth/sign-in?redirectTo=" + encodeURIComponent(url), 303);
};

export const redirectToSelectAccount = (url: string) => {
    return redirect(
        "/accountSelector?redirectTo=" + encodeURIComponent(url),
        303
    );
};

export function sanitizeReturnTo(value: string) {
    if (!value) return "/";
    if (value.startsWith("/") && !value.startsWith("//")) {
        return value;
    }

    return "/";
}
