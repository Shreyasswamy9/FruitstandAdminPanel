import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/database';
import { createServer } from 'net';
import { generateOrdersPage } from './pages/orders';
import { generateAnalyticsPage } from './pages/analytics';
import { generateCommunicationsPage } from './pages/communications';
import { generateActivityPage } from './pages/activity';
import axios from 'axios';

dotenv.config();

const app = express();

// Simple session storage (in production, use proper session management)
const sessions = new Map();

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

// Authentication middleware with activity logging
function requireAuth(req: any, res: any, next: any) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.session;
  if (sessionId && sessions.has(sessionId)) {
    req.user = sessions.get(sessionId);
    // Log page access
    logActivity(req.user.id, req.user.email, 'PAGE_ACCESS', {
      page: req.path,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  } else {
    res.redirect('/?error=unauthorized');
  }
}

// Admin authorization middleware
function requireAdmin(req: any, res: any, next: any) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.session;
  if (sessionId && sessions.has(sessionId)) {
    req.user = sessions.get(sessionId);
    
    // Check if user is admin (check against Microsoft email)
    const isShreyas = req.user.email === 'shreyas@fruitstandny.com' || 
                      req.user.email.toLowerCase().includes('shreyas') ||
                      req.user.email === process.env.ADMIN_EMAIL; // Allow env variable override
    
    if (isShreyas) {
      // Log admin access
      logActivity(req.user.id, req.user.email, 'ADMIN_ACCESS', {
        page: req.path,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    } else {
      // Log unauthorized admin attempt
      logActivity(req.user.id, req.user.email, 'ADMIN_ACCESS_DENIED', {
        page: req.path,
        ipAddress: req.ip,
        reason: 'insufficient_permissions'
      });
      res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Access Denied</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
            .error-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
            .error-icon { font-size: 64px; margin-bottom: 20px; }
            .error-title { color: #dc3545; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .error-message { color: #666; margin-bottom: 30px; }
            .back-btn { background: #667eea; color: white; padding: 12px 24px; border: none; border-radius: 5px; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <div class="error-icon">🔒</div>
            <div class="error-title">Access Denied</div>
            <div class="error-message">You don't have permission to access this admin feature. Only authorized administrators can view this page.</div>
            <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          </div>
        </body>
        </html>
      `);
    }
  } else {
    res.redirect('/?error=unauthorized');
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Landing page - Microsoft OAuth only
app.get('/', (req, res) => {
  const error = ((): string | undefined => {
    const v = req.query.error;
    if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
    if (typeof v === 'string') return v;
    return undefined;
  })();
  const details = ((): string | undefined => {
    const v = req.query.details;
    if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined;
    if (typeof v === 'string') return v;
    if (v !== undefined && v !== null) return String(v);
    return undefined;
  })();
  const decodedDetails = details ? (() => {
    try { return decodeURIComponent(details); } catch { return details; }
  })() : undefined;
  
  // Check if Azure credentials are configured
  const azureConfigured = process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET;
  
  if (!azureConfigured) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Configuration Error</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
          .error-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          .error-title { color: #dc3545; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-title">⚠️ Configuration Error</div>
          <p>Microsoft Azure OAuth is not configured. Please contact your administrator.</p>
        </div>
      </body>
      </html>
    `);
  }

  const microsoftAuthUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize?` +
    `client_id=${process.env.AZURE_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(process.env.AZURE_REDIRECT_URI!)}&` +
    `scope=openid%20profile%20email%20User.Read&` +
    `response_mode=query`;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fruitstand Admin - Login</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
        h1 { color: #333; margin-bottom: 30px; }
        .microsoft-btn { width: 100%; padding: 15px; background: #0078d4; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; text-decoration: none; display: block; margin-bottom: 20px; transition: background-color 0.2s; }
        .microsoft-btn:hover { background: #106ebe; }
        ${error ? `<div class="error">
          ❌ Authentication failed: ${error}<br>
          ${decodedDetails ? `Details: ${decodedDetails}` : 'Please try again or contact IT support.'}
        </div>` : ''}
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">🍎</div>
        <h1>Fruitstand Admin Panel</h1>
        <div class="company-info">
          Secure access with your Microsoft work account
        </div>
        
        ${error ? `<div class="error">
          ❌ Authentication failed: ${error}<br>
          ${details ? `Details: ${decodeURIComponent(details)}` : 'Please try again or contact IT support.'}
        </div>` : ''}
        
        <a href="${microsoftAuthUrl}" class="microsoft-btn">
          🏢 Sign in with Microsoft
        </a>
        
        <div class="secure-notice">
          🔒 This admin panel requires Microsoft authentication through your organization's Azure AD.
        </div>
      </div>
    </body>
    </html>
  `);
});

// Add a simple test route to verify server is working
app.get('/test', (req, res) => {
  res.send(`
    <h1>Server is working!</h1>
    <p>Time: ${new Date().toISOString()}</p>
    <p><a href="/">Go to Login</a></p>
  `);
});

// Git deployment test page
app.get('/git-test', (req, res) => {
  const deployTime = new Date().toISOString();
  const version = "v1.0.1"; // Change this number to test git pulls
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Git Deployment Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .status-box { padding: 20px; border-radius: 10px; margin: 20px 0; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
        code { background: #f8f9fa; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>🚀 Git Deployment Test Page</h1>
      
      <div class="status-box success">
        <h3>✅ Deployment Status: ACTIVE</h3>
        <p><strong>Version:</strong> ${version}</p>
        <p><strong>Deploy Time:</strong> ${deployTime}</p>
        <p><strong>Server:</strong> Fruitstand Admin Panel</p>
      </div>
      
      <div class="status-box info">
        <h3>📋 Test Instructions:</h3>
        <ol>
          <li>Make a change to this page in your code</li>
          <li>Commit and push to git</li>
          <li>Refresh this page</li>
          <li>Check if the changes appear automatically</li>
        </ol>
      </div>
      
      <div class="status-box info">
        <h3>🔗 Navigation:</h3>
        <p><a href="/">← Back to Login</a></p>
        <p><a href="/test">Server Test</a></p>
        <p><code>Last updated: ${new Date().toLocaleString()}</code></p>
      </div>
      
      <div class="status-box">
        <h3>🔄 Git Pull Test Results:</h3>
        <p id="git-status">Checking git status...</p>
      </div>
      
      <script>
        // Simple client-side test
        document.getElementById('git-status').innerHTML = 
          'If you can see version ${version}, git deployment is working! 🎉';
      </script>
    </body>
    </html>
  `);
});

// Main dashboard - protected route
app.get('/dashboard', requireAuth, (req: any, res) => {
  const user = req.user;
  const isAdmin = user.email === 'shreyas@fruitstandny.com' || user.email.toLowerCase().includes('shreyas');
  
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
          
          <div class="dashboard-card" onclick="location.href='/products${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">👕</div>
            <div class="card-title">Product Catalog</div>
            <div class="card-desc">Manage clothing items, sizes, and variants</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/analytics${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📈</div>
            <div class="card-title">Analytics</div>
            <div class="card-desc">Sales reports and business insights</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/activity${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📊</div>
            <div class="card-title">Activity Tracking</div>
            <div class="card-desc">Monitor all user actions and changes</div>
          </div>
          
          ${isAdmin ? `
          <div class="dashboard-card" onclick="location.href='/activity${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📊</div>
            <div class="card-title">Activity Tracking</div>
            <div class="card-desc">Monitor all user actions and changes (Admin Only)</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/admin/users${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">👥</div>
            <div class="card-title">User Management</div>
            <div class="card-desc">Manage user accounts and permissions (Admin Only)</div>
          </div>
          ` : ''}
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

// Page routes
app.get('/orders', requireAuth, (req: any, res) => {
  res.send(generateOrdersPage(req));
});

app.get('/analytics', requireAuth, (req: any, res) => {
  res.send(generateAnalyticsPage(req));
});

app.get('/communications', requireAuth, (req: any, res) => {
  res.send(generateCommunicationsPage(req));
});
app.get('/activity', requireAdmin, async (req: any, res) => {
  try {
    const activityModel = (prisma as any).activityLog;
    const activities = activityModel ? await activityModel.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500 // Limit to last 500 activities
    }) : [];
    
    res.send(generateActivityPage(req, activities));
  } catch (error) {
    res.status(500).send('Error loading activities');
  }
});

app.get('/products', requireAuth, async (req: any, res) => {
  try {
    const products = prisma.product ? await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    }) : [];
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Product Management</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
          .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
          .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
          .back-btn, .add-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
          .add-btn { background: #28a745; }
          .products-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-top: 20px; }
          .products-table { width: 100%; }
          .products-table th, .products-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
          .products-table th { background: #f8f9fa; font-weight: bold; }
          .product-form { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          .form-group textarea { height: 80px; resize: vertical; }
          .form-actions { display: flex; gap: 10px; }
          .action-btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
          .edit-btn { background: #007bff; color: white; }
          .delete-btn { background: #dc3545; color: white; }
          .in-stock { color: #28a745; font-weight: bold; }
          .out-of-stock { color: #dc3545; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>👕 Product Management</h1>
          <div>
            <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
            <button class="add-btn" onclick="toggleProductForm()">Add New Product</button>
          </div>
        </div>
        
        <div class="main-content">
          <!-- Add Product Form -->
          <div id="productForm" class="product-form" style="display: none;">
            <h3>Add New Product</h3>
            <form action="/products/create${req.query.session ? `?session=${req.query.session}` : ''}" method="POST">
              <div class="form-group">
                <label for="name">Product Name:</label>
                <input type="text" id="name" name="name" required>
              </div>
              <div class="form-group">
                <label for="description">Description:</label>
                <textarea id="description" name="description" placeholder="Product description..."></textarea>
              </div>
              <div class="form-group">
                <label for="price">Price ($):</label>
                <input type="number" step="0.01" id="price" name="price" required>
              </div>
              <div class="form-group">
                <label for="category">Category:</label>
                <select id="category" name="category" required>
                  <option value="">Select Category</option>
                  <option value="shirts">Shirts</option>
                  <option value="pants">Pants</option>
                  <option value="dresses">Dresses</option>
                  <option value="jackets">Jackets</option>
                  <option value="shoes">Shoes</option>
                  <option value="accessories">Accessories</option>
                </select>
              </div>
              <div class="form-group">
                <label for="inStock">In Stock:</label>
                <select id="inStock" name="inStock">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div class="form-actions">
                <button type="submit" class="add-btn">Create Product</button>
                <button type="button" onclick="toggleProductForm()" class="back-btn">Cancel</button>
              </div>
            </form>
          </div>

          <div class="products-container">
            <table class="products-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Description</th>
                  <th>Price</th>
                  <th>Category</th>
                  <th>Stock Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(product => `
                  <tr>
                    <td><strong>${product.name}</strong></td>
                    <td>${product.description || 'No description'}</td>
                    <td>$${product.price.toFixed(2)}</td>
                    <td>${product.category}</td>
                    <td><span class="${product.inStock ? 'in-stock' : 'out-of-stock'}">${product.inStock ? 'In Stock' : 'Out of Stock'}</span></td>
                    <td>${new Date(product.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button class="action-btn edit-btn" onclick="editProduct('${product.id}')">Edit</button>
                      <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">Delete</button>
                    </td>
                  </tr>
                `).join('')}
                ${products.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 30px;">No products found. Add your first product!</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
        
        <script>
          function toggleProductForm() {
            const form = document.getElementById('productForm');
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
          }
          
          function editProduct(productId) {
            alert('Edit product: ' + productId + ' - This would open an edit form');
          }
          
          function deleteProduct(productId) {
            if (confirm('Are you sure you want to delete this product?')) {
              fetch('/products/' + productId + '/delete${req.query.session ? `?session=${req.query.session}` : ''}', {
                method: 'POST'
              }).then(() => location.reload());
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading products');
  }
});

// API routes for orders
app.post('/orders/create', requireAuth, async (req: any, res) => {
  try {
    const { total, status } = req.body;
    let order;
    if (prisma.order) {
      order = await prisma.order.create({
        data: {
          total: parseFloat(total),
          status: status || 'pending'
        }
      });
      
      // Log order creation
      await logActivity(req.user.id.toString(), req.user.email, 'ORDER_CREATE', {
        orderId: order.id,
        total: parseFloat(total),
        status: status || 'pending',
        ipAddress: req.ip
      });
    }
    res.redirect(`/orders${req.query.session ? `?session=${req.query.session}` : ''}`);
  } catch (error) {
    res.status(500).send('Error creating order');
  }
});

app.post('/products/create', requireAuth, async (req: any, res) => {
  try {
    const { name, description, price, category, inStock } = req.body;
    let product;
    if (prisma.product) {
      product = await prisma.product.create({
        data: {
          name,
          description: description || null,
          price: parseFloat(price),
          category,
          inStock: inStock === 'true'
        }
      });
      
      // Log product creation
      await logActivity(req.user.id.toString(), req.user.email, 'PRODUCT_CREATE', {
        productId: product.id,
        name,
        price: parseFloat(price),
        category,
        ipAddress: req.ip
      });
    }
    res.redirect(`/products${req.query.session ? `?session=${req.query.session}` : ''}`);
  } catch (error) {
    res.status(500).send('Error creating product');
  }
});

app.post('/products/:id/delete', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    let product;
    if (prisma.product) {
      // Get product info before deleting for logging
      product = await prisma.product.findUnique({ where: { id } });
      await prisma.product.delete({ where: { id } });
      
      // Log product deletion
      await logActivity(req.user.id.toString(), req.user.email, 'PRODUCT_DELETE', {
        productId: id,
        productName: product?.name || 'unknown',
        ipAddress: req.ip
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting product' });
  }
});

// Add fulfillment update endpoint with logging
app.post('/orders/:id/fulfillment', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (prisma.order) {
      const order = await prisma.order.findUnique({ where: { id } });
      if (order) {
        await prisma.order.update({
          where: { id },
          data: { status }
        });
        
        // Log fulfillment update
        await logActivity(req.user.id.toString(), req.user.email, 'FULFILLMENT_UPDATE', {
          orderId: id,
          oldStatus: order.status,
          newStatus: status,
          ipAddress: req.ip
        });
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error updating fulfillment' });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  const sessionId = req.query.session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.redirect('/');
});

// API routes
app.get('/api/orders', async (req, res) => {
  try {
    if (prisma.order) {
      const orders = await prisma.order.findMany();
      res.json(orders);
    } else {
      res.status(503).json({ error: 'Database not ready' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    if (prisma.user) {
      const users = await prisma.user.findMany();
      res.json(users);
    } else {
      res.status(503).json({ error: 'Database not ready' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    if (prisma.product) {
      const products = await prisma.product.findMany();
      res.json(products);
    } else {
      res.status(503).json({ error: 'Database not ready' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Function to find an available port
function findAvailablePort(startPort: number = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any)?.port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      findAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}

// Start server with dynamic port
findAvailablePort().then((port) => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`🚀 Server also accessible at http://192.168.1.50:${port}`);
    console.log(`🚀 Server also accessible at http://fruitstand.local:${port}`);
    console.log(`📊 Admin Panel API ready`);
  });
}).catch((err) => {
  console.error('Failed to find available port:', err);
});
