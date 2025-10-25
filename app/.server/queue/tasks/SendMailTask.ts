import { Job } from "bullmq";
import {
    AppQueueEvent,
} from "./ProcessData";
import QueueTask from "./QueueTask";
import mailer from "@/.server/mailler";

export class SendMailTask extends QueueTask {
    async process(job: Job<AppQueueEvent<"email.sent">>) {
        super.process(job);

        const { to, subject, body } = job.data.payload;
        await mailer.sendMail({
            from: process.env.SMTP_FROM || "",
            to,
            subject: "[MuID] " + subject,
            html: body,
        })
    }
}