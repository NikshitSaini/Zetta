import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import 'dotenv/config';

export const protectRoute = async (req,res,next)=>{
    try {
        const token = req.cookies.jwt;
        if(!token) return res.status(401).json({message:"Unauthorized"});

        const decodedToken = jwt.verify(token,process.env.JWT_SECRET);

        const user = await User.findById(decodedToken.id).select("-password");
        if(!user) return res.status(401).json({message:"Unauthorized"});

        req.user = user;
        next();
    } catch (error) {
        console.error("Error in protectRoute:", error);
        res.status(500).json({message:"Internal server error"});
    }
}