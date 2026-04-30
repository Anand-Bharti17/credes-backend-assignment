// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret";

const generateTokens = (userId: string, email: string) => {
  const accessToken = jwt.sign({ id: userId, email }, JWT_SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ id: userId, email }, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "Email already in use" });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, password_hash, name },
    });

    res
      .status(201)
      .json({ message: "User registered successfully", userId: user.id });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: hashedRefreshToken },
    });

    res.json({ access_token: accessToken, refresh_token: refreshToken });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: "Refresh token required" });
      return;
    }

    const decoded = jwt.verify(refresh_token, JWT_REFRESH_SECRET) as {
      id: string;
      email: string;
    };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (
      !user ||
      !user.refresh_token ||
      !(await bcrypt.compare(refresh_token, user.refresh_token))
    ) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    const { accessToken: newAccess, refreshToken: newRefresh } = generateTokens(
      user.id,
      user.email,
    );
    const hashedNewRefresh = await bcrypt.hash(newRefresh, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { refresh_token: hashedNewRefresh },
    });

    res.json({ access_token: newAccess, refresh_token: newRefresh });
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // We can assume req.user exists because this route will be protected by the auth middleware
    const userId = (req as any).user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { refresh_token: null },
    });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
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
        created_at: true,
      },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
};
