import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function PrivacyPolicy() {
    const { t } = useTranslation();

    return (
        <Link
            to="https://muisnowdevs.one/privacy"
            className="text-sm text-center text-gray-500"
        >
            {t("privacy_policy")}
        </Link>
    );
}