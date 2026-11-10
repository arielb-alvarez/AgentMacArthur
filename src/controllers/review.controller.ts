import type { Request, Response } from "express";

export const review = (
  req: Request,
  res: Response
) => {
  const { code, language } = req.body;

  res.status(200).json({
    success: true,
    agent: "AgentMacArthur",
    review: {
        language: language,
        receivedCode: code,
        message: "Code received for review.",
    },
  });
};