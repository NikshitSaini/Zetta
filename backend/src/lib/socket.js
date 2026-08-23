import {Server} from 'socket.io';
import http from 'http';
import express from 'express';
import 'dotenv/config'
import {socketAuthMiddleware} from '../middleware/socket.auth.middleware.js';
const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true
  }
});

io.use(socketAuthMiddleware);

export function getRecieverSocketId(userId) {
    return UserSockerMap[userId];
}

const UserSockerMap={}

io.on('connection',(socket)=>{
    console.log(`User connected: ${socket.user.fullname}`);

    const userId = socket.user._id;
    UserSockerMap[userId] = socket.id;

    io.emit('getOnlineUsers', Object.keys(UserSockerMap));

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.fullname}`);
        delete UserSockerMap[userId];
        io.emit('getOnlineUsers', Object.keys(UserSockerMap));
    });
    
});

export {io,httpServer,UserSockerMap,app};
