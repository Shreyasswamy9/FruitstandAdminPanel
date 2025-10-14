import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prisma from './config/database';
import { createServer } from 'net';
import { generateOrdersPage } from './pages/orders';

dotenv.config();

const app = express();

// Simple session storage (in production, use proper session management)
const sessions = new Map();

// Authentication middleware
function requireAuth(req: any, res: any, next: any) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '') || req.query.session;
  if (sessionId && sessions.has(sessionId)) {
    req.user = sessions.get(sessionId);
    next();
  } else {
    res.redirect('/?error=unauthorized');
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Landing page - Login form
app.get('/', (req, res) => {
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
        input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; box-sizing: border-box; }
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
app.post('/login', async (req, res) => {
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

// Main dashboard - protected route
app.get('/dashboard', requireAuth, (req: any, res) => {
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
          <!-- Existing cards -->
          <div class="dashboard-card" onclick="location.href='/orders${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📦</div>
            <div class="card-title">Orders Management</div>
            <div class="card-desc">View and manage customer orders</div>
          </div>
          
          <!-- New fashion-specific cards -->
          <div class="dashboard-card" onclick="location.href='/products${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">👕</div>
            <div class="card-title">Product Catalog</div>
            <div class="card-desc">Manage clothing items, sizes, and variants</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/inventory${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📊</div>
            <div class="card-title">Inventory & Stock</div>
            <div class="card-desc">Track stock levels by size and color</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/collections${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">🎨</div>
            <div class="card-title">Collections</div>
            <div class="card-desc">Manage seasonal collections and lookbooks</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/customers${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">👥</div>
            <div class="card-title">Customer Management</div>
            <div class="card-desc">View customer profiles and purchase history</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/promotions${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">🏷️</div>
            <div class="card-title">Promotions & Discounts</div>
            <div class="card-desc">Create and manage discount codes</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/returns${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">↩️</div>
            <div class="card-title">Returns & Exchanges</div>
            <div class="card-desc">Process returns and size exchanges</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/content${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📸</div>
            <div class="card-title">Content Management</div>
            <div class="card-desc">Manage product photos and descriptions</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/shipping${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">🚚</div>
            <div class="card-title">Shipping & Logistics</div>
            <div class="card-desc">Configure shipping zones and rates</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/suppliers${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">🏭</div>
            <div class="card-title">Supplier Management</div>
            <div class="card-desc">Manage vendors and purchase orders</div>
          </div>
          
          <!-- Existing cards -->
          <div class="dashboard-card" onclick="location.href='/reviews${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">⭐</div>
            <div class="card-title">Reviews</div>
            <div class="card-desc">Monitor customer reviews and ratings</div>
          </div>
          
          <div class="dashboard-card" onclick="location.href='/analytics${req.query.session ? `?session=${req.query.session}` : ''}'">
            <div class="card-icon">📈</div>
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

// Page routes
app.get('/orders', requireAuth, (req: any, res) => {
  res.send(generateOrdersPage(req));
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
    if (prisma.order) {
      await prisma.order.create({
        data: {
          total: parseFloat(total),
          status: status || 'pending'
        }
      });
    }
    res.redirect(`/orders${req.query.session ? `?session=${req.query.session}` : ''}`);
  } catch (error) {
    res.status(500).send('Error creating order');
  }
});

// API routes for products
app.post('/products/create', requireAuth, async (req: any, res) => {
  try {
    const { name, description, price, category, inStock } = req.body;
    if (prisma.product) {
      await prisma.product.create({
        data: {
          name,
          description: description || null,
          price: parseFloat(price),
          category,
          inStock: inStock === 'true'
        }
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
    if (prisma.product) {
      await prisma.product.delete({ where: { id } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting product' });
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
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📊 Admin Panel API ready`);
  });
}).catch((err) => {
  console.error('Failed to find available port:', err);
});
