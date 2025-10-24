import { NextFunction, Request, Response } from "express";
import { reinitStore } from "../logic/store";

export async function updateFontCache(req: Request, res: Response<string>, next: NextFunction) {
  try {
    await reinitStore();
  } catch (e) {
    return res.status(500).send(`Error updating font cache: ${(e as Error).message}`);
  }

  res.send("Font cache update triggered and completed successfully.");
}
