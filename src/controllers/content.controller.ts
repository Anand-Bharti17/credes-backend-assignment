// src/controllers/content.controller.ts
import { Request, Response } from "express";
import { generateContent } from "../services/ai.service";

export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { idea, post_type, platforms, tone, language, model } = req.body;

    // Basic validation
    if (!idea || idea.length > 500) {
      res
        .status(400)
        .json({ error: "Idea is required and must be under 500 characters." });
      return;
    }
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      res
        .status(400)
        .json({ error: "At least one platform must be selected." });
      return;
    }

    const aiResponse = await generateContent({
      userId,
      idea,
      post_type,
      platforms,
      tone,
      language,
      model,
    });

    res.json(aiResponse);
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to generate content" });
  }
};
