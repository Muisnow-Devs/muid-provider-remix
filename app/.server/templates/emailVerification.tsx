import { EmailTemplate } from "@daveyplate/better-auth-ui/server";
import { render } from "@react-email/components";

export enum EmailType {
    OTP = "otp",
    Verify = "verify",
    Reset = "reset",
    MagicLink = "magicLink",
    Deletion = "deletion",
}
export type EmailAction =
    | { type: EmailType.OTP; otp: string }
    | { type: EmailType.Verify; url: string }
    | { type: EmailType.Reset; url: string }
    | { type: EmailType.MagicLink; url: string }
    | { type: EmailType.Deletion; url: string };

interface EmailVerificationTemplateProps {
    heading: string;
    name: string;
    action: EmailAction;
}

async function emailVerificationTemplate({
    heading,
    name,
    action,
}: EmailVerificationTemplateProps) {
    return await render(
        <EmailTemplate
            action="Verify"
            heading={heading}
            content={
                <>
                    <p>Hi {name},</p>
                    {action.type === EmailType.OTP && <OTPBox otp={action.otp} />}

                    {action.type === EmailType.Reset && (
                        <p>
                            To reset your password, please click the link below:
                        </p>
                    )}
                    {action.type === EmailType.Verify && (
                        <p>
                            To verify your email address, please click the link
                            below:
                        </p>
                    )}
                    {action.type === EmailType.MagicLink && (
                        <p>To sign in, please click the link below:</p>
                    )}
                    {action.type === EmailType.Deletion && (
                        <p>
                            To confirm your account deletion, please click the
                            link below:
                        </p>
                    )}
                </>
            }
            // imageUrl=""
            siteName="Muisnow Devs"
            baseUrl="https://muisnowdevs.one"
            url={action.type !== EmailType.OTP ? action.url : undefined}
        />
    );
}

function OTPBox({ otp }: { otp: string }) {
    return (
        <div>
            <p>Your one-time password (OTP) is:</p>
            <p
                style={{
                    textAlign: "center",
                    backgroundColor: "#f4f4f4",
                    padding: "10px",
                    borderRadius: "5px",
                }}
            >
                <strong
                    style={{
                        fontSize: "24px",
                        letterSpacing: "2px",
                    }}
                >
                    {otp}
                </strong>
            </p>
        </div>
    );
}

export default emailVerificationTemplate;
