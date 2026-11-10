import { Router } from "express";
import { chat } from "../controllers/agent.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { chatSchema } from "../validators/agent.validator.js";

const router = Router();

router.post("/chat", validate(chatSchema), chat);

export default router;