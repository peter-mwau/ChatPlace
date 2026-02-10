import axios from "axios";
import { AGENT_SERVICE_SECRET, AGENT_SERVICE_URL } from "../config.js";

export async function triggerAgentWebhook(messageData) {
    try {
        const payload = {
            thread_id: "general",
            message_id: `msg_${Date.now()}`,
            query: messageData.message.replace(/@agent\b/i, "").trim(),
            user_id: messageData.authorId,
            user_name: messageData.author,
        };

        const headers = {
            Authorization: `Bearer ${AGENT_SERVICE_SECRET}`,
        };

        console.log("Sending webhook to agent service...");
        axios
            .post(AGENT_SERVICE_URL, payload, { headers })
            .then(() => {
                console.log("Agent service acknowledged request.");
            })
            .catch((error) => {
                console.error("Error calling agent service:", error.message);
            });
    } catch (error) {
        console.error("Failed to trigger agent webhook:", error);
    }
}
