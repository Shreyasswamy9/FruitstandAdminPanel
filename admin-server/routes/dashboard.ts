import { Router } from 'express';
import { requireAuth } from './auth';

const router = Router();

// Main dashboard - protected route
router.get('/dashboard', requireAuth, (req: any, res) => {
  const user = req.user;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fruitstand Admin Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .user-info { display: flex; align-items: center; gap: 10px; }
        .main-content { padding: 30px; max-width: 1200px; margin: 0 auto; }
        .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 20px; }
        .dashboard-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); text-align: center; cursor: pointer; transition: transform 0.2s; }
        .dashboard-card:hover { transform: translateY(-5px); }
        .card-icon { font-size: 48px; margin-bottom: 15px; }
        .card-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
        .card-desc { color: #666; font-size: 14px; }
        .logout-btn { background: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        .logout-btn:hover { background: #c82333; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🍎 Fruitstand Admin Dashboard</h1>
        <div class="user-info">
          <span>Welcome, ${user.name}</span>
          <button class="logout-btn" onclick="logout()">Logout</button>
        </div>
      </div>
      
      <div class="main-content">
        <h2>Dashboard Overview</h2>
        <div class="dashboard-grid">
          <div class="dashboard-card" onclick="location.href='/orders${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📦</div>
            <div class="card-title">Orders Management</div>
            <div class="card-desc">View and manage customer orders</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/reviews${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">⭐</div>
            <div class="card-title">Reviews</div>
            <div class="card-desc">Monitor customer reviews and ratings</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/analytics${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📊</div>
            <div class="card-title">Analytics</div>
            <div class="card-desc">Sales reports and business insights</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/communications${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">💬</div>
            <div class="card-title">Communications</div>
            <div class="card-desc">Customer messages and notifications</div>
          </div>
        </div>
      </div>
      
      <script>
        function logout() {
          window.location.href = '/logout';
        }
      </script>
    </body>
    </html>
  `);
});

export default router;
