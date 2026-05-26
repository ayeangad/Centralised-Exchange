import jwt from "jsonwebtoken"
import type { Request, Response, NextFunction } from "express";

interface MyTokenPayload {
  userId: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.token as string;

  try {
    const decoded = jwt.verify(token, "angadsecretcode123") as MyTokenPayload
    const userId = decoded.userId;

    if (userId) {
      req.userId = userId;
      next();
    } else {
      res.status(403).json({ message: "Token is invalid!" })
    }
  } catch (e) {
    res.status(403).json({ message: "Invalid or Expired token" })
  }
}


