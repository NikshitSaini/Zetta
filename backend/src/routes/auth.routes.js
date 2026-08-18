import express from "express";
const router = express.Router();

import {Signup,Login,Logout,UpdateProfile} from "../controllers/auth.controller.js";
import {protectRoute} from "../middleware/auth.middleware.js";


// router.post("/login", login);
router.post("/signup", Signup);
router.post("/login", Login);
router.post("/logout", Logout);
router.put("/update-profile",protectRoute, UpdateProfile);

router.get("/check", protectRoute, (req, res) => {
    res.status(200).json(req.user);
});

export default router;