import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import 'dotenv/config';

export const socketAuthMiddleware = async (socket, next) => {
    try{
        const token = socket.handshake.headers.cookie
        ?.split("; ")
        .find(c => c.trim().startsWith('token='))
        ?.split('=')[1];

        if(!token){
            console.log("No token found in socket handshake headers");
        return next(new Error("Authentication error: No token provided"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if(!decoded){
            console.log("Token verification failed");
            return next(new Error("Authentication error: Invalid token"));
        }

        const user = await User.findById(decoded.id);
        if(!user){
            console.log("User not found for the provided token");
            return next(new Error("Authentication error: User not found"));
        }

        socket.user = user; // Attach user to socket object for later use
        socket.userId = user._id.toString(); // Attach user ID to socket object for later use
        next();

    }catch(err){
        console.error("Error in socket authentication:", err);
        return next(new Error("Authentication error"));
    }
}