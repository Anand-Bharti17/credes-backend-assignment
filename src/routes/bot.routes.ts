// src/routes/bot.routes.ts
import { Router } from "express";
import { bot } from "../bot/telegram";

const router = Router();

// Telegram will send POST requests here
router.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

export default router;
