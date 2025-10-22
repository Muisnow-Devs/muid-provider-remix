import { Job } from "bullmq";
import { ProcessData, ProcessType } from "./ProcessData";
import QueueTask from "./QueueTask";
import mailer from "../mailler";
import { TaskNotMatch } from "@/errors/tasks";

export class SendMailTask implements QueueTask {
    async process(job: Job<ProcessData>) {
        if (job.data.type !== ProcessType.EmailSender) {
            throw new TaskNotMatch(ProcessType.EmailSender, job.data.type);
        }
        
        const { to, subject, body } = job.data.payload;
        await mailer.sendMail({
            from: process.env.SMTP_FROM || "",
            to,
            subject: "[MuID] " + subject,
            html: body,
        })
    }
}