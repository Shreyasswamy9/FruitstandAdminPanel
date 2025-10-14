import { Router } from 'express';
import { requireAuth } from './auth';

const router = Router();

router.get('/reviews', requireAuth, (req: any, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Reviews Management</title></head>
    <body>
      <h1>⭐ Reviews Management</h1>
      <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}">Back to Dashboard</a>
      <p>Customer reviews and ratings will be displayed here.</p>
    </body>
    </html>
  `);
});

export default router;
