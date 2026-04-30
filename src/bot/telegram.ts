// src/bot/telegram.ts
import TelegramBot from "node-telegram-bot-api";
import prisma from "../utils/prisma";
import {
  getBotState,
  setBotState,
  clearBotState,
} from "../services/session.service";
import { generateContent } from "../services/ai.service";
import { publishQueue } from "../services/queue.service";

const token = process.env.TELEGRAM_BOT_TOKEN!;
// Use polling for local dev, webhook for production
const isProd = process.env.NODE_ENV === "production";
export const bot = new TelegramBot(token, { polling: !isProd });

// Commands
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await clearBotState(chatId);
  await setBotState(chatId, { step: "AWAITING_EMAIL" });
  bot.sendMessage(
    chatId,
    "Welcome to Postly! Please enter your registered email address to link your account.",
  );
});

bot.onText(/\/help/, (msg) => {
  const helpText = `
🤖 **Postly Bot Commands:**
/start - Start a new post
/status - View last 5 posts
/accounts - View connected platforms
/help - Show this menu
  `;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const state = await getBotState(chatId);
  if (!state?.userId)
    return bot.sendMessage(chatId, "Please /start and link your email first.");

  const posts = await prisma.post.findMany({
    where: { user_id: state.userId },
    orderBy: { created_at: "desc" },
    take: 5,
    include: { platforms: true },
  });

  if (posts.length === 0)
    return bot.sendMessage(chatId, "You haven't made any posts yet.");

  let response = "📊 **Your Last 5 Posts:**\n\n";
  posts.forEach((p) => {
    response += `📝 Idea: ${p.idea.substring(0, 30)}...\n`;
    p.platforms.forEach((plat) => {
      response += `  - ${plat.platform}: ${plat.status}\n`;
    });
    response += "\n";
  });
  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});

bot.onText(/\/accounts/, async (msg) => {
  const chatId = msg.chat.id;
  const state = await getBotState(chatId);
  if (!state?.userId)
    return bot.sendMessage(chatId, "Please /start and link your email first.");

  const accounts = await prisma.socialAccount.findMany({
    where: { user_id: state.userId },
  });
  if (accounts.length === 0)
    return bot.sendMessage(chatId, "No accounts connected.");

  const response =
    "🔗 **Connected Accounts:**\n" +
    accounts.map((a) => `- ${a.platform}`).join("\n");
  bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
});

// Main State Machine
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const text = msg.text;
  const state = await getBotState(chatId);

  if (!state) {
    bot.sendMessage(
      chatId,
      "Session expired or not started. Send /start to begin.",
    );
    return;
  }

  try {
    switch (state.step) {
      case "AWAITING_EMAIL":
        const user = await prisma.user.findUnique({
          where: { email: text.trim() },
        });
        if (!user) {
          bot.sendMessage(chatId, "Email not found. Please try again.");
          return;
        }
        await setBotState(chatId, { userId: user.id, step: "AWAITING_TYPE" });
        bot.sendMessage(
          chatId,
          `Hey ${user.name}! What type of post is this?\n\nOptions: Announcement, Thread, Story, Promotional, Educational, Opinion`,
          {
            reply_markup: {
              keyboard: [
                [
                  { text: "Announcement" },
                  { text: "Thread" },
                  { text: "Story" },
                ],
                [
                  { text: "Promotional" },
                  { text: "Educational" },
                  { text: "Opinion" },
                ],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
        break;

      case "AWAITING_TYPE":
        await setBotState(chatId, {
          post_type: text,
          step: "AWAITING_PLATFORMS",
        });
        bot.sendMessage(
          chatId,
          "Which platforms should I post to? (Type them separated by commas, e.g., twitter, linkedin, threads)",
        );
        break;

      case "AWAITING_PLATFORMS":
        const platforms = text.split(",").map((p) => p.trim().toLowerCase());
        await setBotState(chatId, { platforms, step: "AWAITING_TONE" });
        bot.sendMessage(
          chatId,
          "What tone should the content have?\n\nOptions: Professional, Casual, Witty, Authoritative, Friendly",
          {
            reply_markup: {
              keyboard: [
                [
                  { text: "Professional" },
                  { text: "Casual" },
                  { text: "Witty" },
                ],
                [{ text: "Authoritative" }, { text: "Friendly" }],
              ],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
        break;

      case "AWAITING_TONE":
        await setBotState(chatId, { tone: text, step: "AWAITING_MODEL" });
        bot.sendMessage(
          chatId,
          "Which AI model do you want to use?\n\nOptions: openai, anthropic",
          {
            reply_markup: {
              keyboard: [[{ text: "openai" }, { text: "anthropic" }]],
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          },
        );
        break;

      case "AWAITING_MODEL":
        await setBotState(chatId, {
          model: text.toLowerCase(),
          step: "AWAITING_IDEA",
        });
        bot.sendMessage(
          chatId,
          "Tell me the idea or core message (keep it brief).",
          { reply_markup: { remove_keyboard: true } },
        );
        break;

      case "AWAITING_IDEA":
        bot.sendMessage(chatId, "⚙️ Generating your content...");

        // Ensure language defaults to 'en' for now
        const aiResponse = await generateContent({
          userId: state.userId!,
          idea: text,
          post_type: state.post_type!,
          platforms: state.platforms!,
          tone: state.tone!,
          language: "en",
          model: state.model as "openai" | "anthropic",
        });

        await setBotState(chatId, {
          idea: text,
          generatedContent: aiResponse.generated,
          step: "AWAITING_CONFIRMATION",
        });

        let previewMsg = "✨ **Preview:**\n\n";
        for (const [plat, data] of Object.entries(aiResponse.generated)) {
          previewMsg += `**${plat.toUpperCase()}:**\n${(data as any).content}\n\n`;
        }
        previewMsg += "Confirm and post?";

        bot.sendMessage(chatId, previewMsg, {
          parse_mode: "Markdown",
          reply_markup: {
            keyboard: [[{ text: "Yes, Post Now" }, { text: "Cancel" }]],
            one_time_keyboard: true,
            resize_keyboard: true,
          },
        });
        break;

      case "AWAITING_CONFIRMATION":
        if (text === "Yes, Post Now") {
          bot.sendMessage(chatId, "🚀 Queuing posts...", {
            reply_markup: { remove_keyboard: true },
          });

          // Save to DB and Queue
          const post = await prisma.post.create({
            data: {
              user_id: state.userId!,
              idea: state.idea!,
              post_type: state.post_type!,
              tone: state.tone!,
              language: "en",
              model_used: state.model!,
            },
          });

          for (const [platform, data] of Object.entries(
            state.generatedContent,
          )) {
            const platPost = await prisma.platformPost.create({
              data: {
                post_id: post.id,
                platform,
                content: (data as any).content,
              },
            });

            await publishQueue.add(
              `publish-${platform}`,
              {
                platformPostId: platPost.id,
                platform,
                content: (data as any).content,
                userId: state.userId,
              },
              { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
            );
          }

          bot.sendMessage(
            chatId,
            "✅ Posts added to the queue! Use /status to check on them.",
          );
          await clearBotState(chatId);
        } else {
          bot.sendMessage(chatId, "❌ Cancelled. Send /start to begin again.", {
            reply_markup: { remove_keyboard: true },
          });
          await clearBotState(chatId);
        }
        break;
    }
  } catch (error: any) {
    bot.sendMessage(chatId, `⚠️ Error: ${error.message}`);
  }
});
