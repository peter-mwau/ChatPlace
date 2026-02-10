import { Router } from "express";
import { AGENT_SERVICE_SECRET } from "../config.js";

export function createAgentRouter(io) {
    const router = Router();

    router.post("/agent-response", (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${AGENT_SERVICE_SECRET}`) {
            return res.status(401).json({ error: "Invalid token" });
        }

        const { text, agent_id } = req.body;
        console.log("Received response from agent:", text);

        io.emit("receive_message", {
            message: text,
            author: "AI Agent",
            authorId: agent_id,
            timestamp: new Date().toISOString(),
        });

        return res.json({ status: "success", message: "Agent response broadcasted" });
    });

    return router;
}
