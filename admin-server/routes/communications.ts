import { Router } from 'express';
import { requireAuth } from './auth';

const router = Router();

router.get('/communications', requireAuth, (req: any, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Communications</title></head>
    <body>
      <h1>💬 Communications</h1>
      <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}">Back to Dashboard</a>
      <p>Customer communications will be displayed here.</p>
    </body>
    </html>
  `);
});

export default router;
