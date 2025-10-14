import { Router } from 'express';
import prisma from '../config/database';

const router = Router();

// Simple session storage (in production, use proper session management)
export const sessions = new Map();

// Authentication middleware
export function requireAuth(req: any, res: any, next: any) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.session;
  if (sessionId && sessions.has(sessionId)) {
    req.user = sessions.get(sessionId);
    next();
  } else {
    res.redirect('/?error=unauthorized');
  }
}

// Landing page - Login form
router.get('/', (req, res) => {
  const error = req.query.error;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fruitstand Admin - Login</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; color: #555; font-weight: bold; }
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        button { width: 100%; padding: 12px; background: #667eea; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; }
        button:hover { background: #5a6fd8; }
        .error { color: red; text-align: center; margin-bottom: 20px; }
        .logo { text-align: center; font-size: 48px; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">🍎</div>
        <h1>Fruitstand Admin Panel</h1>
        ${error ? `<div class="error">Invalid credentials. Please try again.</div>` : ''}
        <form action="/login" method="POST">
          <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required>
          </div>
          <button type="submit">Login</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    if (prisma.user) {
      const user = await prisma.user.findUnique({ where: { email } });
      
      if (user && user.password === password) {
        const sessionId = Date.now().toString() + Math.random().toString();
        sessions.set(sessionId, { id: user.id, name: user.name, email: user.email });
        res.redirect(`/dashboard?session=${sessionId}`);
      } else {
        res.redirect('/?error=invalid');
      }
    } else {
      res.redirect('/?error=database');
    }
  } catch (error) {
    res.redirect('/?error=server');
  }
});

// Logout route
router.get('/logout', (req, res) => {
  const sessionId = req.query.session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.redirect('/');
});

export default router;
