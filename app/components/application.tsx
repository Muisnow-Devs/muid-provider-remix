import { Accordion, AccordionContent, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

interface ApplicationIconProps {
    icon: string | null;
    name: string;
}

export function ApplicationIcon({ icon, name }: ApplicationIconProps) {
    return (
        <>
            {icon && (
                <img
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
        </>
    );
}

interface ApplicationScopesProps {
    scopes: {
        id: string;
        name: string;
        description: string | null;
    }[];
}
export function ApplicationScopes({ scopes }: ApplicationScopesProps) {
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
