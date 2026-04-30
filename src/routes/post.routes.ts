// src/routes/post.routes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { publishPost, getPosts } from "../controllers/post.controller";

const router = Router();

router.use(authenticate);

router.post("/publish", publishPost);
router.post("/schedule", publishPost); // Uses same controller, handles publish_at
router.get("/", getPosts);

export default router;
