import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getAllContacts, sendMessage ,getChatById, getAllChats} from "../controllers/messgae.controller.js";
const router = express.Router();

router.get("/contacts",protectRoute,getAllContacts);
router.get("/chats",protectRoute,getAllChats);
router.get("/:id",protectRoute,getChatById);

router.post("/send/:id",protectRoute,sendMessage);

export default router;