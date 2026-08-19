import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import cookieParser from "cookie-parser";

import connectDB from "./lib/db.js";
import { connectRedis } from "./lib/redis.js";

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();
const __dirname = path.resolve();

// Required on Render to correctly read client IPs behind reverse proxies
app.set("trust proxy", 1);

// Basic middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "5MB" })); // req.body listener

// Start database connections and server
const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();

    // Initialize Redis-backed stores only after Redis is ready.
    const { globalLimiter } = await import("./middleware/redis.middleware.js");
    const { default: authRoutes } = await import("./routes/auth.routes.js");
    const { default: messageRoutes } = await import("./routes/message.routes.js");

    app.use("/api", globalLimiter);
    app.use("/api/auth", authRoutes);
    app.use("/api/messages", messageRoutes);

    if (process.env.NODE_ENV === "production") {
      app.use(express.static(path.join(__dirname, "../frontend/dist")));
      app.get("*", (_, res) => {
        res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
      });
    }

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
};

startServer();