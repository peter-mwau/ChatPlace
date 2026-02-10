import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import http from "http";
import { createAgentRouter } from "./routes/agentRoutes.js";
import { createHealthRouter } from "./routes/healthRoutes.js";
import { registerChatHandlers } from "./sockets/chatSocket.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

app.use("/api", createAgentRouter(io));
app.use("/", createHealthRouter());

registerChatHandlers(io);

server.listen(3000, () => {
    console.log("Server is running on port 3000");
});