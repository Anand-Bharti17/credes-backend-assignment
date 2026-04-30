// src/services/ai.service.ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../utils/prisma";
import { decrypt } from "../utils/encryption";

interface GenerateContentParams {
  userId: string;
  idea: string;
  post_type: string;
  platforms: string[];
  tone: string;
  language: string;
  model: "openai" | "anthropic";
}

export const generateContent = async (params: GenerateContentParams) => {
  const { userId, idea, post_type, platforms, tone, language, model } = params;

  // 1. Retrieve API Keys (User specific or fallback)
  const userKeys = await prisma.aiKey.findUnique({
    where: { user_id: userId },
  });

  let openaiKey = process.env.OPENAI_API_KEY;
  let anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (userKeys?.openai_key_enc) openaiKey = decrypt(userKeys.openai_key_enc);
  if (userKeys?.anthropic_key_enc)
    anthropicKey = decrypt(userKeys.anthropic_key_enc);

  // 2. Build the System Prompt
  const systemPrompt = `You are an expert social media manager. Generate content for a ${post_type} post based on the user's idea.
  Global constraints:
  - Tone: ${tone} (Note: LinkedIn MUST always remain professional regardless of this setting).
  - Language: ${language}
  - Platforms requested: ${platforms.join(", ")}

  Platform Rules:
  - Twitter: max 280 characters, 2-3 hashtags, punchy opener.
  - LinkedIn: 800-1300 characters, professional tone, 3-5 hashtags.
  - Instagram: engaging caption, emoji-friendly, 10-15 hashtags.
  - Threads: 500 characters max, highly conversational.

  You MUST return ONLY a valid JSON object matching this exact structure (omit platforms not requested):
  {
    "generated": {
      "twitter": { "content": "...", "char_count": 0, "hashtags": [] },
      "linkedin": { "content": "...", "char_count": 0 },
      "instagram": { "content": "...", "hashtags": [] },
      "threads": { "content": "..." }
    }
  }`;

  let resultJson;
  let tokensUsed = 0;
  let actualModelUsed = "";

  // 3. Call the appropriate AI Model
  if (model === "openai") {
    if (!openaiKey) throw new Error("OpenAI API key is missing.");
    const openai = new OpenAI({ apiKey: openaiKey });

    actualModelUsed = "gpt-4o";
    const response = await openai.chat.completions.create({
      model: actualModelUsed,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: idea },
      ],
    });

    resultJson = JSON.parse(response.choices[0].message.content || "{}");
    tokensUsed = response.usage?.total_tokens || 0;
  } else if (model === "anthropic") {
    if (!anthropicKey) throw new Error("Anthropic API key is missing.");
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    actualModelUsed = "claude-3-5-sonnet-20240620";
    const response = await anthropic.messages.create({
      model: actualModelUsed,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the idea: ${idea}\nReturn ONLY JSON.`,
        },
      ],
    });

    const contentBlock = response.content.find(
      (block) => block.type === "text",
    );
    if (contentBlock && contentBlock.type === "text") {
      resultJson = JSON.parse(contentBlock.text);
    }
    tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  } else {
    throw new Error("Unsupported AI model selected.");
  }

  return {
    ...resultJson,
    model_used: actualModelUsed,
    tokens_used: tokensUsed,
  };
};
