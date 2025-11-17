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
import { Globe } from "lucide-react";

const languageMap: Record<string, string> = {
    en: "English",
    "zh-TW": "正體中文",
};

interface LanguageSelectorProps {
    className?: string;
}

export default function LanguageSelector({ className }: LanguageSelectorProps) {
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
        <div className={className}>
            <Select onValueChange={(e) => changeLanguage(e)}>
                <SelectTrigger className="w-full">
                    <Globe />
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
