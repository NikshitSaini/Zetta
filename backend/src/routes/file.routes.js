import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  initUpload,
  finalizeUpload,
  getFileManifest,
  getUserFiles,
} from "../controllers/file.controller.js";

const router = express.Router();

// Authenticated routes
router.post("/init", protectRoute, initUpload);
router.post("/finalize", protectRoute, finalizeUpload);
router.get("/my-files", protectRoute, getUserFiles);

// Worker-accessed manifest endpoint — validated by X-Worker-Key header (no user auth)
router.get("/:fileId/manifest", getFileManifest);

export default router;
