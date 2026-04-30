// src/routes/content.routes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { generate } from "../controllers/content.controller";

const router = Router();

router.use(authenticate);

router.post("/generate", generate);

export default router;
