import type { Request, Response } from "express";

export const chat = (
  req: Request,
  res: Response
) => {
  const { message } = req.body;

  res.status(200).json({
    success: true,
    agent: "AgentMacArthur",
    receivedMessage: message,
    response: "Your request has been received.",
  });
};