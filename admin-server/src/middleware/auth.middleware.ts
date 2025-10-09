import { Request, Response, NextFunction } from 'express';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Example authentication logic
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Here you would typically verify the token and extract user information
    // For example purposes, we'll assume the token is valid
    req.user = { id: 1, name: 'John Doe' }; // Mock user data

    next();
};