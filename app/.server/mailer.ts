import { createTransport } from "nodemailer";
import logger from "./logger";

const nodemailer = createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

nodemailer.addListener("error", (err) => {
    logger.error("[Mailer] Mailer encountered an error", { error: err });
});

export async function verifyMailer() {
    await nodemailer.verify().then(() => {
        logger.info("[Mailer] Mailer is configured correctly");
    });
}

export default nodemailer;