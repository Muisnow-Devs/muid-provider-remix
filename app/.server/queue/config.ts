import { QueueOptions } from "bullmq";
import client from "../redis";

export default {
    connection: client,
    prefix: process.env.REDIS_PREFIX || "bull",
} as QueueOptions;