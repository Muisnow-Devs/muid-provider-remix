export enum ProcessType {
    EmailSender,
}

export type ProcessData =
    | { type: ProcessType.EmailSender; payload: { to: string; subject: string; body: string } }
// | { type: ProcessType.AutoReview; payload: { contentId: string } }