import { ProcessType } from "@/.server/tasks/ProcessData";

class TaskNotMatch extends Error {
    constructor(expected: ProcessType, received: ProcessType) {
        super(`Task type mismatch: expected ${ProcessType[expected]}, but received ${ProcessType[received]}`);
        this.name = "TaskNotMatch";
    }
}

export { TaskNotMatch };