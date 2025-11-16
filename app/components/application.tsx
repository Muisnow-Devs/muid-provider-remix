import { BadgeCheckIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { Badge } from "./ui/badge";

interface ApplicationIconProps {
    clientId: string;
    icon: string | null;
    name: string;
}

export function ApplicationIcon({ clientId, icon, name }: Readonly<ApplicationIconProps>) {
    return (
        <div className="flex flex-col items-center gap-4 relative">
            {icon && (
                <img
                    alt={name}
                    src={icon}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-md object-cover"
                />
            )}

            {!icon && (
                <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                    <span className="text-lg font-semibold">
                        {name.charAt(0).toUpperCase()}
                    </span>
                </div>
            )}

            {clientId.endsWith(".service.sanzi.io") && <Badge
                variant="secondary"
                className="bg-blue-500 text-white dark:bg-blue-600 absolute bottom-0 right-1/2 transform translate-y-1/2 translate-x-1/2"
            >
                <BadgeCheckIcon />
                Official
            </Badge>}
        </div>
    );
}

interface ApplicationScopesProps {
    scopes: {
        id: string;
        name: string;
        description: string | null;
    }[];
}
export function ApplicationScopes({ scopes }: Readonly<ApplicationScopesProps>) {
    return (
        <Accordion
            type="multiple"
            className="mb-4 font-medium flex flex-col gap-2"
        >
            {scopes.map((s) => (
                <AccordionItem value={s.id} key={s.id}>
                    <AccordionTrigger>{s.name}</AccordionTrigger>
                    <AccordionContent>
                        <p className="text-sm text-muted-foreground">
                            {s.description}
                        </p>
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
