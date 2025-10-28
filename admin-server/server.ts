import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/database';
import axios from 'axios';

dotenv.config();

const app = express();

// Enhanced session storage with expiration and security
interface SessionData {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  lastActivity: number;
  ipAddress?: string;
}

const sessions = new Map<string, SessionData>();

// Session configuration
const SESSION_TIMEOUT = 1 * 60 * 60 * 1000; // 1 hour in milliseconds
const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour cleanup interval

// Clear all sessions on server restart for security
sessions.clear();
console.log('🔄 All sessions cleared on server restart');

// Activity logging function
async function logActivity(userId: string, userEmail: string, action: string, details: any = {}) {
  try {
    const activityModel = (prisma as any).activityLog;
    if (activityModel && typeof activityModel.create === 'function') {
      await activityModel.create({
        data: {
          userId,
          userEmail,
          action,
          details: JSON.stringify(details),
          timestamp: new Date(),
          ipAddress: details.ipAddress || 'unknown'
        }
      });
    }
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Session cleanup function
function cleanupExpiredSessions() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [sessionId, sessionData] of sessions.entries()) {
    if (now - sessionData.lastActivity > SESSION_TIMEOUT) {
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
  }
}

// Run session cleanup periodically
setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL);

// Helper to get session ID from request
function getSessionId(req: any): string | undefined {
  const headerAuth = req.headers?.authorization;
  if (headerAuth && typeof headerAuth === 'string') {
    return headerAuth.replace('Bearer ', '');
  }
  
  const sessionQuery = req.query?.session;
  if (typeof sessionQuery === 'string') return sessionQuery;
  if (Array.isArray(sessionQuery)) return sessionQuery[0];
  
  return undefined;
}

// Authentication middleware
function requireAuth(req: any, res: any, next: any) {
  const sessionId = getSessionId(req);
  const clientIP = req.ip || req.connection.remoteAddress;
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.redirect('/?error=unauthorized');
  }
  
  const sessionData = sessions.get(sessionId)!;
  const now = Date.now();
  
  // Check session expiration
  if (now - sessionData.lastActivity > SESSION_TIMEOUT) {
    sessions.delete(sessionId);
    return res.redirect('/?error=session_expired');
  }
  
  // Update session activity
  sessionData.lastActivity = now;
  sessions.set(sessionId, sessionData);
  
  req.user = sessionData;
  
  // Log page access
  logActivity(req.user.id, req.user.email, 'PAGE_ACCESS', {
    page: req.path,
    ipAddress: clientIP,
    userAgent: req.get('User-Agent')
  });
  
  next();
}

// Admin authorization middleware
function requireAdmin(req: any, res: any, next: any) {
  const sessionId = getSessionId(req);
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.redirect('/?error=unauthorized');
  }
  
  const sessionData = sessions.get(sessionId)!;
  req.user = sessionData;
  
  // Check if user is admin
  const isAdmin = req.user.email === 'shreyas@fruitstandny.com' || 
                  req.user.email.toLowerCase().includes('shreyas') ||
                  req.user.email === process.env.ADMIN_EMAIL;
  
  if (!isAdmin) {
    return res.status(403).send('Access Denied: Admin privileges required');
  }
  
  next();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Landing page - Login with Microsoft
app.get('/', (req, res) => {
  const error = req.query.error as string;
  
  const microsoftAuthUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${process.env.AZURE_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(process.env.AZURE_REDIRECT_URI!)}&` +
    `scope=openid%20profile%20email%20User.Read&` +
    `response_mode=query&` +
    `prompt=login`;

  const devLoginEnabled = process.env.ENABLE_DEV_LOGIN === 'true' || process.env.NODE_ENV !== 'production';

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fruitstand Admin - Login</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
        .logo { font-size: 48px; margin-bottom: 10px; }
        h1 { color: #333; margin-bottom: 30px; }
        .microsoft-btn { width: 100%; padding: 15px; background: #0078d4; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; text-decoration: none; display: block; margin-bottom: 12px; }
        .microsoft-btn:hover { background: #106ebe; }
        .error { color: #dc3545; margin-bottom: 20px; padding: 10px; background: #f8d7da; border-radius: 5px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">🍎</div>
        <h1>Fruitstand Admin Panel</h1>
        
        ${error ? `<div class="error">❌ ${error}</div>` : ''}
        
        <a href="${microsoftAuthUrl}" class="microsoft-btn">
          🏢 Sign in with Microsoft
        </a>

        ${devLoginEnabled ? `
          <a href="/dev-login" style="width:100%;display:block;padding:15px;background:#6c757d;color:#fff;border:none;border-radius:5px;font-size:16px;text-decoration:none;">
            🐞 Dev Login (No Microsoft)
          </a>
          <div style="margin-top:8px;font-size:12px;color:#666;">Dev login enabled (testing only)</div>
        ` : ''}
      </div>
    </body>
    </html>
  `);
});

// Main dashboard - the central hub
app.get('/dashboard', requireAuth, (req: any, res) => {
  const user = req.user;
  const isAdmin = user.email === 'shreyas@fruitstandny.com' || 
                  user.email.toLowerCase().includes('shreyas') ||
                  user.email === process.env.ADMIN_EMAIL;
  
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
        .dashboard-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); text-align: center; transition: transform 0.2s; text-decoration: none; color: inherit; display: block; }
        .dashboard-card:hover { transform: translateY(-5px); }
        .card-icon { font-size: 48px; margin-bottom: 15px; }
        .card-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
        .card-desc { color: #666; font-size: 14px; }
        .logout-btn { background: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        .admin-badge { background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🍎 Fruitstand Admin Dashboard</h1>
        <div class="user-info">
          <span>Welcome, ${user.name} ${isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</span>
          <button class="logout-btn" onclick="window.location.href='/logout'">Logout</button>
        </div>
      </div>
      
      <div class="main-content">
        <h2>Admin Panel</h2>
        <div class="dashboard-grid">
          <a class="dashboard-card" href="/orders${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">📦</div>
            <div class="card-title">Orders Management</div>
            <div class="card-desc">View and manage customer orders from Stripe</div>
          </a>

          <a class="dashboard-card" href="/products${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">👕</div>
            <div class="card-title">Product Catalog</div>
            <div class="card-desc">Manage clothing items and inventory</div>
          </a>

          <a class="dashboard-card" href="/analytics${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">📈</div>
            <div class="card-title">Analytics</div>
            <div class="card-desc">Sales reports and business insights</div>
          </a>

          <a class="dashboard-card" href="/communications${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">📧</div>
            <div class="card-title">Communications</div>
            <div class="card-desc">Customer messaging and notifications</div>
          </a>

          <a class="dashboard-card" href="/inventory${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">🏷️</div>
            <div class="card-title">Inventory</div>
            <div class="card-desc">Stock levels and low stock alerts</div>
          </a>

          <a class="dashboard-card" href="/customers${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">👥</div>
            <div class="card-title">Customers</div>
            <div class="card-desc">Profiles and purchase history</div>
          </a>

          <a class="dashboard-card" href="/collections${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">🎨</div>
            <div class="card-title">Collections</div>
            <div class="card-desc">Seasonal collections and lookbooks</div>
          </a>

          <a class="dashboard-card" href="/reviews${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">⭐</div>
            <div class="card-title">Reviews</div>
            <div class="card-desc">Customer reviews and ratings</div>
          </a>
          
          ${isAdmin ? `
          <a class="dashboard-card" href="/activity${getSessionId(req) ? `?session=${getSessionId(req)}` : ''}">
            <div class="card-icon">📊</div>
            <div class="card-title">Activity Tracking <span class="admin-badge">ADMIN</span></div>
            <div class="card-desc">Monitor all user actions and system changes</div>
          </a>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Logout
app.get('/logout', (req, res) => {
  const sessionId = getSessionId(req);
  if (sessionId && sessions.has(sessionId)) {
    const sessionData = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (sessionData) {
      logActivity(sessionData.id, sessionData.email, 'LOGOUT', {
        sessionDuration: Date.now() - sessionData.createdAt,
        ipAddress: req.ip
      });
    }
  }
  res.redirect('/');
});

// Dev login (testing only): creates a temporary session and redirects to dashboard
app.get('/dev-login', (req, res) => {
  const enabled = process.env.ENABLE_DEV_LOGIN === 'true' || process.env.NODE_ENV !== 'production';
  if (!enabled) {
    return res.status(403).send('Dev login is disabled. Set ENABLE_DEV_LOGIN=true or use NODE_ENV!=production.');
  }

  const email = process.env.ADMIN_EMAIL || 'shreyas@fruitstandny.com';
  const now = Date.now();
  const sessionId = now.toString() + Math.random().toString(36).substring(2);

  const sessionData: SessionData = {
    id: 'dev-' + now,
    name: 'Dev User',
    email,
    createdAt: now,
    lastActivity: now,
    ipAddress: req.ip
  };

  sessions.set(sessionId, sessionData);

  logActivity(sessionData.id, sessionData.email, 'LOGIN_DEV', {
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.redirect(`/dashboard?session=${encodeURIComponent(sessionId)}`);
});

// Microsoft OAuth callback
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query as any;
  
  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect('/?error=no_authorization_code');
  }

  try {
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, 
      new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        code: code as string,
        grant_type: 'authorization_code',
        redirect_uri: process.env.AZURE_REDIRECT_URI!
      })
    );

    const { access_token } = tokenResponse.data;

    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const msUser = userResponse.data;
    const userEmail = msUser.mail || msUser.userPrincipalName;

    let user: any;
    try {
      if ((prisma as any).user) {
        user = await (prisma as any).user.upsert({
          where: { email: userEmail },
          update: { name: msUser.displayName },
          create: { email: userEmail, name: msUser.displayName, password: 'oauth' }
        });
      } else {
        user = { id: msUser.id, name: msUser.displayName, email: userEmail };
      }
    } catch {
      user = { id: msUser.id, name: msUser.displayName, email: userEmail };
    }

    const sessionId = Date.now().toString() + Math.random().toString(36).substring(2);
    const now = Date.now();
    sessions.set(sessionId, {
      id: user.id.toString(),
      name: user.name,
      email: user.email,
      createdAt: now,
      lastActivity: now,
      ipAddress: req.ip
    });

    await logActivity(user.id.toString(), user.email, 'LOGIN', {
      method: 'microsoft_oauth',
      ipAddress: req.ip
    });

    res.redirect(`/dashboard?session=${sessionId}`);
  } catch (err) {
    console.error('OAuth error:', (err as any)?.response?.data || (err as any)?.message || err);
    res.redirect('/?error=authentication_failed');
  }
});

// Start server
const PORT = Number(process.env.PORT) || 3005;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Fruitstand Admin Panel running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
});

// Page routes - delegate to page generators (no logic here)
app.get('/orders', requireAuth, async (req: any, res) => {
  const { generateOrdersPage } = await import('./pages/orders');
  res.send(await generateOrdersPage(req));
});
app.get('/products', requireAuth, async (req: any, res) => {
  const { generateProductsPage } = await import('./pages/products');
  res.send(await generateProductsPage(req));
});
app.get('/analytics', requireAuth, async (req: any, res) => {
  const { generateAnalyticsPage } = await import('./pages/analytics');
  res.send(generateAnalyticsPage(req));
});
app.get('/communications', requireAuth, async (req: any, res) => {
  const { generateCommunicationsPage } = await import('./pages/communications');
  res.send(generateCommunicationsPage(req));
});
app.get('/activity', requireAdmin, async (req: any, res) => {
  try {
    const activityModel = (prisma as any).activityLog;
    const activities = activityModel ? await activityModel.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500
    }) : [];
    const { generateActivityPage } = await import('./pages/activity');
    res.send(generateActivityPage(req, activities));
  } catch (error) {
    res.status(500).send('Error loading activities');
  }
});

// NEW: link remaining pages
app.get('/inventory', requireAuth, async (req: any, res) => {
  const { generateInventoryPage } = await import('./pages/inventory');
  res.send(generateInventoryPage(req));
});
app.get('/customers', requireAuth, async (req: any, res) => {
  const { generateCustomersPage } = await import('./pages/customers');
  res.send(generateCustomersPage(req));
});
app.get('/collections', requireAuth, async (req: any, res) => {
  const { generateCollectionsPage } = await import('./pages/collections');
  res.send(generateCollectionsPage(req));
});
app.get('/reviews', requireAuth, async (req: any, res) => {
  const { generateReviewsPage } = await import('./pages/reviews');
  res.send(generateReviewsPage(req));
});
