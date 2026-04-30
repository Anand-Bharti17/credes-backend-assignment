// src/services/session.service.ts
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6380");

export interface BotState {
  step:
    | "AWAITING_EMAIL"
    | "AWAITING_TYPE"
    | "AWAITING_PLATFORMS"
    | "AWAITING_TONE"
    | "AWAITING_MODEL"
    | "AWAITING_IDEA"
    | "AWAITING_CONFIRMATION";
  userId?: string;
  post_type?: string;
  platforms?: string[];
  tone?: string;
  model?: string;
  idea?: string;
  generatedContent?: any;
}

const TTL = 1800; // 30 minutes in seconds

export const setBotState = async (chatId: number, state: Partial<BotState>) => {
  const currentState = await getBotState(chatId);
  const newState = { ...currentState, ...state };
  await redis.set(`tg_session:${chatId}`, JSON.stringify(newState), "EX", TTL);
};

export const getBotState = async (chatId: number): Promise<BotState | null> => {
  const state = await redis.get(`tg_session:${chatId}`);
  return state ? JSON.parse(state) : null;
};

export const clearBotState = async (chatId: number) => {
  await redis.del(`tg_session:${chatId}`);
};
