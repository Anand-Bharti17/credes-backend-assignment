// src/controllers/dashboard.controller.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const totalPosts = await prisma.post.count({ where: { user_id: userId } });

    // Fetch all child platform posts to calculate success rates
    const platformPosts = await prisma.platformPost.findMany({
      where: { post: { user_id: userId } },
      select: { status: true, platform: true },
    });

    const totalPlatformPosts = platformPosts.length;
    const successfulPosts = platformPosts.filter(
      (p) => p.status === "PUBLISHED",
    ).length;
    const successRate =
      totalPlatformPosts === 0
        ? 0
        : Math.round((successfulPosts / totalPlatformPosts) * 100);

    // Group by platform
    const postsPerPlatform = platformPosts.reduce(
      (acc, curr) => {
        acc[curr.platform] = (acc[curr.platform] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Strict Response Envelope required by the brief
    res.json({
      data: {
        total_posts: totalPosts,
        success_rate: `${successRate}%`,
        posts_per_platform: postsPerPlatform,
      },
      meta: null,
      error: null,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({
        data: null,
        meta: null,
        error: "Failed to fetch dashboard stats",
      });
  }
};
