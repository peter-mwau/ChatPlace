import { RATE_LIMIT_WINDOW_MS } from "../config.js";
import { triggerAgentWebhook } from "../services/agentService.js";

const GENERAL_ROOM = "general";
const userLastRequest = new Map();
const userSockets = new Map();

function makeDmRoomId(userA, userB) {
    const sorted = [userA, userB].sort();
    return `dm:${sorted[0]}:${sorted[1]}`;
}

function addUserSocket(userId, socketId) {
    if (!userId) return;
    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
    if (!userId || !userSockets.has(userId)) return;
    const sockets = userSockets.get(userId);
    sockets.delete(socketId);
    if (sockets.size === 0) {
        userSockets.delete(userId);
    }
}

export function registerChatHandlers(io) {
    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}`);

        const userId = socket.handshake.auth?.userId;
        console.log(`User connected: ${userId}`);

        addUserSocket(userId, socket.id);
        socket.join(GENERAL_ROOM);

        io.emit("user_count", io.engine.clientsCount);

        socket.on("user_joined", (data) => {
            console.log(`${data.userName} joined the chat`);
            socket.broadcast.emit("user_joined", data);
        });

        socket.on("start_dm", ({ targetUserId }) => {
            if (!userId || !targetUserId) {
                socket.emit("dm_error", { message: "Missing target user." });
                return;
            }

            const roomId = makeDmRoomId(userId, targetUserId);
            socket.join(roomId);

            const targetSockets = userSockets.get(targetUserId);
            if (targetSockets) {
                for (const targetSocketId of targetSockets) {
                    io.sockets.sockets.get(targetSocketId)?.join(roomId);
                }
                io.to(roomId).emit("dm_ready", {
                    roomId,
                    members: [userId, targetUserId],
                });
            } else {
                socket.emit("dm_ready", {
                    roomId,
                    members: [userId, targetUserId],
                });
            }
        });

        socket.on("send_message", (data) => {
            console.log(data);

            const roomId = data.conversationId || GENERAL_ROOM;
            socket.to(roomId).emit("receive_message", {
                ...data,
                id: userId,
                replyTo: data.replyTo || null,
                replyToMessage: data.replyToMessage || null,
                timestamp: new Date().toISOString(),
            });

            if (roomId === GENERAL_ROOM && /@agent\b/i.test(data.message)) {
                const requestUserId = data.authorId;
                const now = Date.now();
                const lastRequestTime = userLastRequest.get(requestUserId) || 0;

                if (now - lastRequestTime < RATE_LIMIT_WINDOW_MS) {
                    console.log(`Rate limit exceeded for user: ${requestUserId}`);
                    socket.emit("receive_message", {
                        message: "Please wait a moment before asking the agent again.",
                        authorId: "system",
                        author: "System",
                        timestamp: new Date().toISOString(),
                    });
                    return;
                }

                userLastRequest.set(requestUserId, now);

                console.log("Agent mention detected!");
                socket.emit("agent_thinking");
                triggerAgentWebhook(data);
            }
        });

        socket.on("typing", (data) => {
            const roomId = data.conversationId || GENERAL_ROOM;
            socket.to(roomId).emit("user_typing", data);
        });

        socket.on("react_to_message", (data) => {
            const roomId = data.conversationId || GENERAL_ROOM;
            socket.to(roomId).emit("message_reacted", data);
        });

        socket.on("user_left", (data) => {
            console.log(`${data.userName} left the chat`);
            socket.broadcast.emit("user_left", data);
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${userId}`);
            removeUserSocket(userId, socket.id);
            io.emit("user_count", io.engine.clientsCount);
        });
    });
}
