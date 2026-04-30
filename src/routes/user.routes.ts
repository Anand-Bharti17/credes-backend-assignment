// src/routes/user.routes.ts
import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import {
  getProfile,
  updateProfile,
  addSocialAccount,
  listSocialAccounts,
  disconnectSocialAccount,
  updateAiKeys,
} from "../controllers/user.controller";

const router = Router();

// All user routes must be protected
router.use(authenticate);

// Profile
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

// Social Accounts
router.post("/social-accounts", addSocialAccount);
router.get("/social-accounts", listSocialAccounts);
router.delete("/social-accounts/:id", disconnectSocialAccount);

// AI Keys
router.put("/ai-keys", updateAiKeys);

export default router;
