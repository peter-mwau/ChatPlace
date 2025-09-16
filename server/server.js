// server.js
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import http from 'http';
import axios from 'axios'; // Import axios to make the webhook call

const app = express();
app.use(cors());
app.use(express.json()); // This is required to parse JSON in the agent callback

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        // origin: 'http://localhost:5173',
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// --- Configuration ---
const AGENT_SERVICE_URL = 'http://localhost:8000/webhook';
const AGENT_SERVICE_SECRET = 'your_super_secret_webhook_token_here'; // Must match the FastAPI .env file!
const AGENT_USER_ID = 'ai_agent_001'; // Define a special ID for the agent
const RATE_LIMIT_WINDOW_MS = 100000;

const userLastRequest = new Map();

// --- Helper Function to call the Agent Microservice ---
async function triggerAgentWebhook(messageData) {
    try {
        const payload = {
            thread_id: 'general', // You can make this dynamic based on rooms/channels later
            message_id: `msg_${Date.now()}`, // Generate a unique ID for this message
            query: messageData.message.replace(/@agent\b/i, '').trim(), // Remove the @agent tag
            user_id: messageData.authorId,
            user_name: messageData.author,
            // You could add context by sending the last few messages here
            // context: lastMessages
        };

        const headers = {
            'Authorization': `Bearer ${AGENT_SERVICE_SECRET}`
        };

        console.log('Sending webhook to agent service...');
        // Fire and forget - we don't wait for the response
        axios.post(AGENT_SERVICE_URL, payload, { headers })
            .then(response => {
                console.log('Agent service acknowledged request.');
            })
            .catch(error => {
                console.error('Error calling agent service:', error.message);
            });

    } catch (error) {
        console.error('Failed to trigger agent webhook:', error);
    }
}

// --- New Endpoint for the Agent Service to call back to ---
app.post('/api/agent-response', (req, res) => {
    // 1. Authenticate the request (very important!)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${AGENT_SERVICE_SECRET}`) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    // 2. The payload from our FastAPI service
    const { thread_id, text, agent_id } = req.body;
    console.log('Received response from agent:', text);

    // 3. Broadcast the agent's message to ALL connected clients
    io.emit('receive_message', {
        message: text,
        author: 'AI Agent',
        authorId: agent_id,
        timestamp: new Date().toISOString()
    });

    // 4. Acknowledge receipt
    res.json({ status: 'success', message: 'Agent response broadcasted' });
});

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Get user ID from auth data
    const userId = socket.handshake.auth.userId;
    console.log(`User connected: ${userId}`);

    // Broadcast updated user count
    io.emit('user_count', io.engine.clientsCount);

    // Handle user joined event
    socket.on('user_joined', (data) => {
        console.log(`${data.userName} joined the chat`);
        socket.broadcast.emit('user_joined', data);
    });

    socket.on('send_message', (data) => {
        console.log(data);

        // Broadcast the user's message to everyone else
        socket.broadcast.emit('receive_message', {
            ...data,
            id: userId,
            replyTo: data.replyTo || null,
            replyToMessage: data.replyToMessage || null,
            timestamp: new Date().toISOString() // Ensure timestamp is present
        });

        // Only apply rate limiting if @agent is mentioned
        if (/@agent\b/i.test(data.message)) {
            // --- RATE LIMITING CHECK START ---
            const userId = data.authorId;
            const now = Date.now();
            const lastRequestTime = userLastRequest.get(userId) || 0;

            if (now - lastRequestTime < RATE_LIMIT_WINDOW_MS) {
                console.log(`Rate limit exceeded for user: ${userId}`);
                socket.emit('receive_message', {
                    message: `Please wait a moment before asking the agent again.`,
                    authorId: 'system',
                    author: 'System',
                    timestamp: new Date().toISOString()
                });
                return;
            }

            userLastRequest.set(userId, now);
            // --- RATE LIMITING CHECK END ---

            console.log('Agent mention detected!');
            socket.emit('agent_thinking');
            triggerAgentWebhook(data);
        }
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
        socket.broadcast.emit('user_typing', data);
    });

    // Handle message reactions
    socket.on('react_to_message', (data) => {
        // Broadcast the reaction to all clients
        socket.broadcast.emit('message_reacted', data);
    });

    // Handle user left event
    socket.on('user_left', (data) => {
        console.log(`${data.userName} left the chat`);
        socket.broadcast.emit('user_left', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        // Broadcast updated user count
        io.emit('user_count', io.engine.clientsCount);
    });
});

app.get('/', (req, res) => {
    res.send('<h1>Chat Server with AI Agent Integration</h1>');
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});