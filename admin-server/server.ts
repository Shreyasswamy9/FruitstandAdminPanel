import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/database';
import axios from 'axios';
import { createServer } from 'net';

// Page route registrars
import { registerOrdersRoutes } from './pages/orders';
import { registerProductsRoutes } from './pages/products';
import { registerAnalyticsRoutes } from './pages/analytics';
import { registerCommunicationsRoutes } from './pages/communications';
import { registerActivityRoutes } from './pages/activity';
import { registerInventoryRoutes } from './pages/inventory';
import { registerCustomersRoutes } from './pages/customers';
import { registerCollectionsRoutes } from './pages/collections';
import { registerReviewsRoutes } from './pages/reviews';

// add this import
import supabase from './config/supabase';

dotenv.config();

const app = express();

// Session + security (kept)
interface SessionData { id: string; name: string; email: string; createdAt: number; lastActivity: number; ipAddress?: string; }
const sessions = new Map<string, SessionData>();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.lastActivity > SESSION_TIMEOUT) sessions.delete(id);
}, 60 * 60 * 1000);

// Activity logging (shared)
async function logActivity(userId: string, userEmail: string, action: string, details: any = {}) {
  try {
    const activityModel = (prisma as any).activityLog;
    if (activityModel?.create) {
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
  } catch {}
}

// Auth middlewares (shared)
function requireAuth(req: any, res: any, next: any) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.session;
  if (!sessionId || !sessions.has(sessionId)) return res.redirect('/?error=invalid_session');
  const s = sessions.get(sessionId)!;
  if (Date.now() - s.lastActivity > SESSION_TIMEOUT) { sessions.delete(sessionId); return res.redirect('/?error=session_expired'); }
  s.lastActivity = Date.now();
  // assign to typed request via any-cast to avoid TS errors
  (req as any).user = s;
  logActivity(s.id, s.email, 'PAGE_ACCESS', { page: req.path, ipAddress: req.ip, userAgent: req.get('User-Agent') });
  next();
}
function requireAdmin(req: any, res: any, next: any) {
  requireAuth(req, res, () => {
    const email = (req as any).user.email;
    const admin = email === 'shreyas@fruitstandny.com' || email.toLowerCase().includes('shreyas') || email === process.env.ADMIN_EMAIL;
    if (!admin) return res.status(403).send('Forbidden');
    logActivity((req as any).user.id, (req as any).user.email, 'ADMIN_ACCESS', { page: req.path, ipAddress: req.ip });
    next();
  });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Login (Microsoft + optional dev)
app.get('/', (req: any, res: any) => {
  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const details = typeof req.query.details === 'string' ? req.query.details : '';
  if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
    return res.status(500).send('<h1>Configuration error</h1><p>Azure OAuth not configured.</p>');
  }
  const authUrl =
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?client_id=${process.env.AZURE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.AZURE_REDIRECT_URI!)}&scope=openid%20profile%20email%20User.Read&response_mode=query`;
  res.send(`
    <!DOCTYPE html><html><head><title>Login</title>
    <style>body{font-family:Arial;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#667eea;color:#333}
    .box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 8px 25px rgba(0,0,0,.15);width:360px;text-align:center}
    a.btn{display:block;background:#0078d4;color:#fff;padding:14px;border-radius:6px;text-decoration:none;margin-top:15px}
    a.btn.dev{background:#6c757d}
    .err{background:#f8d7da;color:#721c24;padding:10px;border-radius:6px;font-size:13px;margin-bottom:10px}
    </style></head><body>
    <div class="box">
      <h1>🍎 Admin Panel</h1>
      ${error ? `<div class="err">${error}${details ? ` - ${details}` : ''}</div>` : ''}
      <a class="btn" href="${authUrl}">Sign in with Microsoft</a>
      ${process.env.ENABLE_DEV_LOGIN === 'true' ? `<a class="btn dev" href="/dev-login">Developer Login</a>` : ''}
    </div>
    </body></html>
  `);
});

// OAuth callback
app.get('/auth/callback', async (req: any, res: any) => {
  const { code, error, error_description } = req.query;
  if (error) return res.redirect(`/?error=oauth_error&details=${encodeURIComponent(error_description || error)}`);
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenResp = await axios.post(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        code: code as string,
        grant_type: 'authorization_code',
        redirect_uri: process.env.AZURE_REDIRECT_URI!
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const access = tokenResp.data.access_token;
    const userResp = await axios.get('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${access}` } });
    const ms = userResp.data;
    const email = ms.mail || ms.userPrincipalName;
    let user = { id: ms.id, name: ms.displayName, email };
    try {
      if ((prisma as any).user) {
        user = await (prisma as any).user.upsert({
          where: { email },
          update: { name: ms.displayName },
          create: { email, name: ms.displayName, password: 'oauth' }
        });
      }
    } catch {}
    const sessionId = Date.now() + Math.random().toString(36).slice(2);
    sessions.set(sessionId, { id: user.id.toString(), name: user.name, email: user.email, createdAt: Date.now(), lastActivity: Date.now(), ipAddress: req.ip });
    logActivity(user.id.toString(), email, 'LOGIN', { method: 'microsoft_oauth', ipAddress: req.ip });
    return res.redirect(`/dashboard?session=${sessionId}`);
  } catch {
    return res.redirect('/?error=oauth_failed');
  }
});

// Dev login
app.get('/dev-login', (req: any, res: any) => {
  if (process.env.ENABLE_DEV_LOGIN !== 'true') return res.status(403).send('Disabled');
  const err = typeof req.query.error === 'string' ? req.query.error : '';
  res.send(`
    <!DOCTYPE html><html><head><title>Dev Login</title>
    <style>body{font-family:Arial;background:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh}
    .box{background:#fff;padding:30px;border-radius:10px;box-shadow:0 8px 20px rgba(0,0,0,.1);width:340px}
    .err{background:#f8d7da;color:#721c24;padding:8px;border-radius:6px;font-size:12px;margin-bottom:8px}
    input,button{width:100%;padding:10px;margin-top:10px;border-radius:6px;border:1px solid #ccc}
    button{background:#6c757d;color:#fff;border:none;cursor:pointer}
    a{display:block;margin-top:10px;font-size:12px;text-decoration:none;color:#0078d4}
    </style></head><body>
    <div class="box">
      <h2>🛠️ Dev Login</h2>
      ${err ? `<div class="err">${err}</div>` : ''}
      <form method="POST" action="/dev-login">
        <input name="password" type="password" required placeholder="Dev password"/>
        <button type="submit">Login</button>
      </form>
      <a href="/">← Back</a>
    </div>
    </body></html>
  `);
});
app.post('/dev-login', (req: any, res: any) => {
  if (process.env.ENABLE_DEV_LOGIN !== 'true') return res.status(403).send('Disabled');
  const pass = req.body?.password;
  if (!process.env.DEV_ADMIN_PASSWORD || pass !== process.env.DEV_ADMIN_PASSWORD) return res.redirect('/dev-login?error=Invalid+password');
  const sessionId = Date.now() + Math.random().toString(36).slice(2);
  sessions.set(sessionId, { id: 'dev', name: 'Dev Admin', email: process.env.ADMIN_EMAIL || 'dev@local', createdAt: Date.now(), lastActivity: Date.now(), ipAddress: req.ip });
  logActivity('dev', process.env.ADMIN_EMAIL || 'dev@local', 'LOGIN', { method: 'dev_login', ipAddress: req.ip });
  res.redirect(`/dashboard?session=${sessionId}`);
});

// Dashboard (links only)
app.get('/dashboard', requireAuth, (req: any, res: any) => {
  const s = req.query.session ? `?session=${req.query.session}` : '';
  const user = (req as any).user;
  const isAdmin = user.email === 'shreyas@fruitstandny.com' || user.email.toLowerCase().includes('shreyas') || user.email === process.env.ADMIN_EMAIL;
  res.send(`
    <!DOCTYPE html><html><head><title>Dashboard</title>
    <style>
      body{font-family:Arial;margin:0;background:#f5f5f5}
      .header{background:#667eea;color:#fff;padding:18px;display:flex;justify-content:space-between;align-items:center}
      .grid{max-width:1100px;margin:25px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;padding:0 20px}
      .card{background:#fff;padding:16px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.08);text-decoration:none;color:#333;display:block}
      .card:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px)}
      .icon{font-size:26px} .title{font-weight:600;margin:6px 0 4px;font-size:15px} .desc{font-size:12px;color:#666}
      .logout{background:#dc3545;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer}
    </style></head><body>
    <div class="header">
      <div>🍎 Admin Panel</div>
      <div>${user.name} <button class="logout" onclick="logout()">Logout</button></div>
    </div>
    <div class="grid">
      <a class="card" href="/orders${s}"><div class="icon">📦</div><div class="title">Orders</div><div class="desc">Stripe orders</div></a>
      <a class="card" href="/products${s}"><div class="icon">👕</div><div class="title">Products</div><div class="desc">Catalog</div></a>
      <a class="card" href="/analytics${s}"><div class="icon">📈</div><div class="title">Analytics</div><div class="desc">Insights</div></a>
      <a class="card" href="/communications${s}"><div class="icon">💬</div><div class="title">Comms</div><div class="desc">Messages</div></a>
      <a class="card" href="/customers${s}"><div class="icon">👥</div><div class="title">Customers</div><div class="desc">Profiles</div></a>
      <a class="card" href="/collections${s}"><div class="icon">🎨</div><div class="title">Collections</div><div class="desc">Seasonal</div></a>
      <a class="card" href="/inventory${s}"><div class="icon">📊</div><div class="title">Inventory</div><div class="desc">Stock</div></a>
      <a class="card" href="/reviews${s}"><div class="icon">⭐</div><div class="title">Reviews</div><div class="desc">Feedback</div></a>
      ${isAdmin ? `<a class="card" href="/activity${s}"><div class="icon">🛡️</div><div class="title">Activity</div><div class="desc">Audit log</div></a>` : ''}
    </div>
    <script>
      function logout(){
        const p=new URLSearchParams(window.location.search);const ss=p.get('session');
        location.href= ss? '/logout?session='+encodeURIComponent(ss):'/logout';
      }
    </script>
    </body></html>
  `);
});

// Logout
app.get('/logout', (req: any, res: any) => {
  const sid = req.headers.authorization?.replace('Bearer ','') || req.query.session;
  if (sid && sessions.has(sid)) {
    const u = sessions.get(sid)!;
    logActivity(u.id, u.email, 'LOGOUT', { ipAddress: req.ip, duration: Date.now() - u.createdAt });
    sessions.delete(sid);
  }
  res.redirect('/');
});

// Delegate page-specific routes
registerOrdersRoutes(app, {
  requireAuth,
  dataProvider: {
    getOrderById: async (id: string) => {
      try {
        return await (prisma as any).order.findUnique({ where: { id } });
      } catch {
        return null;
      }
    },
    fulfillOrder: async (id: string) => {
      try {
        return await (prisma as any).order.update({ where: { id }, data: { status: 'fulfilled' } });
      } catch {
        return null;
      }
    }
  },
  prisma,
  logActivity,
  supabase // <-- provide Supabase client so orders endpoints use it
});
registerProductsRoutes(app, { prisma, logActivity, requireAuth, requireAdmin });
registerAnalyticsRoutes(app, { requireAuth });
registerCommunicationsRoutes(app, { requireAuth });
registerActivityRoutes(app, { prisma, logActivity, requireAdmin });
registerInventoryRoutes(app, { requireAuth });
registerCustomersRoutes(app, { requireAuth });
registerCollectionsRoutes(app, { requireAuth });
registerReviewsRoutes(app, { requireAuth });

// Port
function findAvailablePort(startPort = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => findAvailablePort(startPort + 1).then(resolve).catch(reject));
  });
}
findAvailablePort().then(port => {
  app.listen(port, '0.0.0.0', () => console.log(`Server http://localhost:${port}`));
}).catch(err => console.error('Port error', err));
