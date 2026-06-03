import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { env } from './env.ts'

interface MyTokenPayload {
  userId: string;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHead = req.headers.authorization

  if (!authHead || !authHead.startsWith("Bearer ")) {
    res.status(401).json({ message: "Invalid authorization" })
    return;
  }

  const token = authHead.split(" ")[1]
  if (!token) {
    res.status(401).json({ message: "Incorrect token" })
    return
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as MyTokenPayload
    const userId = decoded.userId;

    if (userId) {
      req.userId = userId;
      next();
    } else {
      res.status(403).json({ message: "Token is invalid!" })
    }
  } catch (error) {
    console.error(error)
    res.status(403).json({ message: "Invalid or Expired token" })
  }
}


