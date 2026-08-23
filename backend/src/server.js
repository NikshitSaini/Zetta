import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";

import connectDB from "./lib/db.js";
import { connectRedis } from "./lib/redis.js";
import { app, httpServer } from "./lib/socket.js";

dotenv.config();

const port = process.env.PORT || 3000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");

// Required on Render to correctly read client IPs behind reverse proxies
app.set("trust proxy", 1);

// Basic middleware
app.use(cors( { origin: process.env.CLIENT_URL, credentials: true })); // CORS configuration
app.use(cookieParser());
app.use(express.json({limit: "5mb"})); // req.body listener

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

    if (fs.existsSync(path.join(frontendDistPath, "index.html"))) {
      app.use(express.static(frontendDistPath));
      app.get("*", (_, res) => {
        res.sendFile(path.join(frontendDistPath, "index.html"));
      });
    }

    httpServer.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);
    process.exit(1);
  }
};

startServer();