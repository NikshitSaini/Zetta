import express from "express";

import {Signup,Login,Logout,UpdateProfile} from "../controllers/auth.controller.js";
import {protectRoute} from "../middleware/auth.middleware.js";
import {authLimiter} from "../middleware/redis.middleware.js";


const router = express.Router();


// router.post("/login", login);
router.post("/signup",authLimiter, Signup);
router.post("/login", authLimiter, Login);
router.post("/logout",authLimiter, Logout);
router.put("/update-profile",protectRoute, UpdateProfile);

router.get("/check", protectRoute, (req, res) => {
    res.status(200).json(req.user);
});

export default router;
