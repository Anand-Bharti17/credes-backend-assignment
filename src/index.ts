// src/index.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import contentRoutes from "./routes/content.routes";
import postRoutes from './routes/post.routes';
import './services/queue.service'; // This initializes the BullMQ worker!
import botRoutes from "./routes/bot.routes";
import "./bot/telegram"; // Ensure bot is initialized
import dashboardRoutes from "./routes/dashboard.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/dashboard", dashboardRoutes);


// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

