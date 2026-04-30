// src/controllers/user.controller.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { encrypt } from "../utils/encryption";

// --- Profile Management ---

export const getProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        default_tone: true,
        default_language: true,
      },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { name, bio, default_tone, default_language } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name, bio, default_tone, default_language },
      select: {
        id: true,
        name: true,
        bio: true,
        default_tone: true,
        default_language: true,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// --- Social Accounts Management ---

export const addSocialAccount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { platform, access_token, refresh_token, handle } = req.body;

    // Encrypt the tokens before storing
    const access_token_enc = encrypt(access_token);
    const refresh_token_enc = refresh_token ? encrypt(refresh_token) : null;

    const account = await prisma.socialAccount.upsert({
      where: {
        user_id_platform: { user_id: userId, platform },
      },
      update: {
        access_token_enc,
        refresh_token_enc,
        handle,
      },
      create: {
        user_id: userId,
        platform,
        access_token_enc,
        refresh_token_enc,
        handle,
      },
    });

    res
      .status(201)
      .json({
        message: `${platform} connected successfully`,
        accountId: account.id,
      });
  } catch (error) {
    res.status(500).json({ error: "Failed to connect social account" });
  }
};

export const listSocialAccounts = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Explicitly exclude the encrypted tokens from the response for security
    const accounts = await prisma.socialAccount.findMany({
      where: { user_id: userId },
      select: { id: true, platform: true, handle: true, connected_at: true },
    });

    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch social accounts" });
  }
};

export const disconnectSocialAccount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const accountId = req.params.id;

    await prisma.socialAccount.deleteMany({
      where: { id: accountId, user_id: userId }, // Ensure user owns the account
    });

    res.json({ message: "Account disconnected successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
};

// --- AI Keys Management ---

export const updateAiKeys = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { openai_key, anthropic_key } = req.body;

    const openai_key_enc = openai_key ? encrypt(openai_key) : undefined;
    const anthropic_key_enc = anthropic_key
      ? encrypt(anthropic_key)
      : undefined;

    await prisma.aiKey.upsert({
      where: { user_id: userId },
      update: {
        ...(openai_key_enc && { openai_key_enc }),
        ...(anthropic_key_enc && { anthropic_key_enc }),
      },
      create: {
        user_id: userId,
        openai_key_enc: openai_key_enc || null,
        anthropic_key_enc: anthropic_key_enc || null,
      },
    });

    res.json({ message: "AI keys securely stored" });
  } catch (error) {
    res.status(500).json({ error: "Failed to store AI keys" });
  }
};
