import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { randomUUID } from 'crypto';

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const { user, requiresPasswordChange } = await AuthService.login(email, password);

        // Create session
        const sessionId = randomUUID();
        req.session = req.session || {};
        req.session.userId = user.id;
        req.session.email = user.email || '';
        req.session.sessionId = sessionId;

        res.status(200).json({ 
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
            },
            requiresPasswordChange
        });
    } catch (error: any) {
        res.status(401).json({ error: error.message || 'Invalid credentials' });
    }
};

export const logout = async (req: Request, res: Response) => {
    req.session = null;
    res.status(200).json({ message: 'Logout successful' });
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters long' });
        }

        await AuthService.changePassword(userId, currentPassword, newPassword);

        res.status(200).json({ message: 'Password changed successfully' });
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Failed to change password' });
    }
};

export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        const userId = req.session?.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = await AuthService.getUserById(userId);

        res.status(200).json({ 
            user: {
                id: user.id,
                email: user.email,
                requiresPasswordChange: user.recovery_token?.startsWith('TEMP_PASSWORD_') || false
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to get user' });
    }
};