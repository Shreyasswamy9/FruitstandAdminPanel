import { Router } from 'express';
import { requireAuth } from './auth';

const router = Router();

router.get('/analytics', requireAuth, (req: any, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Analytics Dashboard</title></head>
    <body>
      <h1>📊 Analytics Dashboard</h1>
      <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}">Back to Dashboard</a>
      <p>Sales analytics and business insights will be displayed here.</p>
    </body>
    </html>
  `);
});

export default router;
