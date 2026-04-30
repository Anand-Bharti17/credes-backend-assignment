// src/controllers/post.controller.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { publishQueue } from "../services/queue.service";

export const publishPost = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const {
      idea,
      post_type,
      tone,
      language,
      model_used,
      platforms,
      publish_at,
    } = req.body;

    // 1. Save the parent Post
    const post = await prisma.post.create({
      data: {
        user_id: userId,
        idea,
        post_type,
        tone,
        language,
        model_used,
        publish_at: publish_at ? new Date(publish_at) : null,
      },
    });

    // 2. Save child PlatformPosts and add to Queue
    const platformPostPromises = Object.entries(platforms).map(
      async ([platform, data]: [string, any]) => {
        const platformPost = await prisma.platformPost.create({
          data: {
            post_id: post.id,
            platform,
            content: data.content,
          },
        });

        // Calculate delay if scheduling for the future
        let delay = 0;
        if (publish_at) {
          const publishDate = new Date(publish_at).getTime();
          delay = Math.max(0, publishDate - Date.now());
        }

        // Add to BullMQ with strict exponential backoff (1s -> 5s -> 25s)
        await publishQueue.add(
          `publish-${platform}`,
          {
            platformPostId: platformPost.id,
            platform,
            content: data.content,
            userId,
          },
          {
            delay,
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: true, // Keep Redis clean
          },
        );

        return platformPost;
      },
    );

    await Promise.all(platformPostPromises);

    res
      .status(202)
      .json({ message: "Post queued successfully", postId: post.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to queue post" });
  }
};


export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const platform = req.query.platform as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    const skip = (page - 1) * limit;

    // Build dynamic where clause for filtering
    const whereClause: any = { user_id: userId };

    if (status) whereClause.status = status.toUpperCase();
    if (startDate && endDate) {
      whereClause.created_at = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }
    if (platform) {
      whereClause.platforms = { some: { platform: platform.toLowerCase() } };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: whereClause,
        include: { platforms: true },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.post.count({ where: whereClause }),
    ]);

    // Strict Response Envelope
    res.json({
      data: posts,
      meta: { total, page, limit },
      error: null,
    });
  } catch (error) {
    res
      .status(500)
      .json({ data: null, meta: null, error: "Failed to fetch posts" });
  }
};

export const getPostById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;
    const post = await prisma.post.findFirst({
      where: { id, user_id: userId },
      include: { platforms: true },
    });

    if (!post) {
      res.status(404).json({ data: null, meta: null, error: "Post not found" });
      return;
    }

    res.json({ data: post, meta: null, error: null });
  } catch (error) {
    res
      .status(500)
      .json({ data: null, meta: null, error: "Failed to fetch post details" });
  }
};