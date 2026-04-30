// src/services/queue.service.ts
import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import prisma from "../utils/prisma";
import dotenv from "dotenv";

dotenv.config();

const redisConnection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6380",
  {
    maxRetriesPerRequest: null, // Required by BullMQ
  },
);

// 1. Initialize the Queue
export const publishQueue = new Queue("publish-queue", {
  connection: redisConnection,
});

// 2. Define the Worker logic
const processJob = async (job: Job) => {
  const { platformPostId, platform, content, userId } = job.data;

  // Mark as processing in DB
  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: "PROCESSING", attempts: job.attemptsMade + 1 },
  });

  try {
    // In a real scenario, you would decrypt the user's OAuth token here
    // and make an Axios call to the specific platform's API.
    // const account = await prisma.socialAccount.findFirst({ ... })

    console.log(`[Worker] Publishing to ${platform} for User ${userId}...`);

    // Simulating API call latency and potential random failure (for testing retries)
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        // 10% chance to fail to test our exponential backoff
        if (Math.random() < 0.1)
          reject(new Error(`${platform} API rate limit exceeded`));
        else resolve(true);
      }, 1500);
    });

    // Mark as published on success
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: "PUBLISHED", published_at: new Date() },
    });

    console.log(`[Worker] Successfully published to ${platform}!`);
  } catch (error: any) {
    console.error(`[Worker] Failed to publish to ${platform}:`, error.message);
    throw error; // Throwing triggers BullMQ's retry mechanism
  }
};

// 3. Initialize the Worker
export const publishWorker = new Worker("publish-queue", processJob, {
  connection: redisConnection,
  concurrency: 5, // Process up to 5 jobs concurrently
});

// 4. Handle Permanent Failures (after all retries exhaust)
publishWorker.on("failed", async (job, err) => {
  if (job) {
    const { platformPostId } = job.data;
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: "FAILED", error_message: err.message },
    });
  }
});
