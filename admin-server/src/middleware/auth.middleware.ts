import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = {
        id: 'system-user',
        name: 'Authenticated User',
    };

    next();
};

// Session-based auth middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    next();
};