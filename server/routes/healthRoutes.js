import { Router } from "express";

export function createHealthRouter() {
    const router = Router();

    router.get("/", (req, res) => {
        res.send("<h1>Chat Server with AI Agent Integration</h1>");
    });

    return router;
}
