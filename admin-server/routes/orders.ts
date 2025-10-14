import { Router } from 'express';
import { requireAuth } from './auth';
import prisma from '../config/database';

const router = Router();

// Orders management page
router.get('/orders', requireAuth, async (req: any, res) => {
  try {
    const orders = prisma.order ? await prisma.order.findMany({
      orderBy: { createdAt: 'desc' }
    }) : [];
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orders Management</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
          .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
          .main-content { padding: 30px; max-width: 1200px; margin: 0 auto; }
          .back-btn, .add-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
          .add-btn { background: #28a745; }
          .orders-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
          .orders-table { width: 100%; }
          .orders-table th, .orders-table td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
          .orders-table th { background: #f8f9fa; font-weight: bold; }
          .status-pending { color: #ffc107; font-weight: bold; }
          .status-completed { color: #28a745; font-weight: bold; }
          .status-cancelled { color: #dc3545; font-weight: bold; }
          .action-btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
          .edit-btn { background: #007bff; color: white; }
          .delete-btn { background: #dc3545; color: white; }
          .order-form { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
          .form-group { margin-bottom: 15px; }
          .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          .form-actions { display: flex; gap: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📦 Orders Management</h1>
          <div>
            <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
            <button class="add-btn" onclick="toggleOrderForm()">Add New Order</button>
          </div>
        </div>
        
        <div class="main-content">
          <!-- Add Order Form -->
          <div id="orderForm" class="order-form" style="display: none;">
            <h3>Add New Order</h3>
            <form action="/orders/create${req.query.session ? `?session=${req.query.session}` : ''}" method="POST">
              <div class="form-group">
                <label for="total">Total Amount ($):</label>
                <input type="number" step="0.01" id="total" name="total" required>
              </div>
              <div class="form-group">
                <label for="status">Status:</label>
                <select id="status" name="status" required>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div class="form-actions">
                <button type="submit" class="add-btn">Create Order</button>
                <button type="button" onclick="toggleOrderForm()" class="back-btn">Cancel</button>
              </div>
            </form>
          </div>

          <div class="orders-container">
            <table class="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(order => `
                  <tr>
                    <td>${order.id.substring(0, 8)}...</td>
                    <td>$${order.total.toFixed(2)}</td>
                    <td><span class="status-${order.status}">${order.status.toUpperCase()}</span></td>
                    <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button class="action-btn edit-btn" onclick="editOrder('${order.id}')">Edit</button>
                      <button class="action-btn delete-btn" onclick="deleteOrder('${order.id}')">Delete</button>
                    </td>
                  </tr>
                `).join('')}
                ${orders.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 30px;">No orders found</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
        
        <script>
          function toggleOrderForm() {
            const form = document.getElementById('orderForm');
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
          }
          
          function editOrder(orderId) {
            alert('Edit order: ' + orderId);
          }
          
          function deleteOrder(orderId) {
            if (confirm('Are you sure you want to delete this order?')) {
              fetch('/orders/' + orderId + '/delete${req.query.session ? `?session=${req.query.session}` : ''}', {
                method: 'POST'
              }).then(() => location.reload());
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading orders');
  }
});

// Create new order
router.post('/orders/create', requireAuth, async (req: any, res) => {
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

// Delete order
router.post('/orders/:id/delete', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    if (prisma.order) {
      await prisma.order.delete({ where: { id } });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting order' });
  }
});

export default router;
