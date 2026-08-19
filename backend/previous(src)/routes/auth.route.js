import express from "express";
import { signup, login, logout, updateProfile } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import {authLimiter} from "../middleware/redis.middleware.js";
const router = express.Router();

router.use(arcjetProtection);

router.post("/signup",authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/logout",authLimiter, logout);

router.put("/update-profile", protectRoute, updateProfile);

router.get("/check", protectRoute, (req, res) => res.status(200).json(req.user));

export default router;
