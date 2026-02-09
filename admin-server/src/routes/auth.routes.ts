import { Router } from 'express';
import { login, logout, changePassword, getCurrentUser } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.post('/logout', logout);
router.post('/change-password', requireAuth, changePassword);
router.get('/me', requireAuth, getCurrentUser);

export default router;