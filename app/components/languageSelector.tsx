import { useTranslation } from "react-i18next";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { useSearchParams } from "react-router";

const languageMap: Record<string, string> = {
    en: "English",
    "zh-TW": "正體中文",
};

export default function LanguageSelector() {
    const { i18n } = useTranslation();
    const [, setQuery] = useSearchParams();

    const changeLanguage = (lng: string) => {
        console.log("Changing language to:", lng);
        i18n.changeLanguage(lng);
        setQuery((prev) => {
            prev.set("lng", lng);
            return prev;
        });
    };

    return (
        <div>
            <Select onValueChange={(e) => changeLanguage(e)}>
                <SelectTrigger>
                    <SelectValue placeholder={languageMap[i18n.language]} />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {Object.keys(languageMap).map((lng) => (
                            <SelectItem key={lng} value={lng}>
                                {languageMap[lng] || lng}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}
