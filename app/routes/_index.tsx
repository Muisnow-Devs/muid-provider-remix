import { redirect } from "react-router";

export function loader() {
  return redirect("/account/settings", 301);
}