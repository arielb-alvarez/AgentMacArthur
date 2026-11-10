import { Router } from "express";
import { chat } from "../controllers/agent.controller.js";

const router = Router();

router.post("/chat", chat);

export default router;