import { AppEventMap } from "@/.server/queue/tasks/ProcessData";

class TaskNotMatch extends Error {
    constructor(expected: keyof AppEventMap, received: keyof AppEventMap) {
        super(
            `Task type mismatch: expected ${expected}, but received ${received}`
        );
        this.name = "TaskNotMatch";
    }
}

export { TaskNotMatch };
