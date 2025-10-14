export function generateOrdersPage(req: any) {
  // Placeholder orders for testing
  const placeholderOrders = [
    {
      id: 'ord_1a2b3c4d5e6f',
      total: 45.99,
      status: 'pending',
      createdAt: new Date('2024-01-15'),
      customer: 'Alice Johnson',
      email: 'alice@example.com',
      paymentId: 'pi_1a2b3c4d5e',
      items: 'Organic Apples x3, Fresh Bananas x2',
      address: '123 Oak Street, San Francisco, CA 94102',
      fulfillment: 'pending'
    },
    {
      id: 'ord_2b3c4d5e6f7g',
      total: 78.50,
      status: 'processing',
      createdAt: new Date('2024-01-14'),
      customer: 'Bob Smith',
      email: 'bob@example.com',
      paymentId: 'pi_2b3c4d5e6f',
      items: 'Mixed Berry Box x2, Orange Juice x1, Honey x1',
      address: '456 Pine Avenue, Los Angeles, CA 90210',
      fulfillment: 'shipped'
    },
    {
      id: 'ord_3c4d5e6f7g8h',
      total: 32.25,
      status: 'completed',
      createdAt: new Date('2024-01-13'),
      customer: 'Carol Davis',
      email: 'carol@example.com',
      paymentId: 'pi_3c4d5e6f7g',
      items: 'Avocado x4, Lime x6',
      address: '789 Maple Drive, Seattle, WA 98101',
      fulfillment: 'delivered'
    },
    {
      id: 'ord_4d5e6f7g8h9i',
      total: 125.00,
      status: 'processing',
      createdAt: new Date('2024-01-12'),
      customer: 'David Wilson',
      email: 'david@example.com',
      paymentId: 'pi_4d5e6f7g8h',
      items: 'Premium Fruit Basket x1, Grape Juice x2',
      address: '321 Elm Street, Portland, OR 97201',
      fulfillment: 'pending'
    },
    {
      id: 'ord_5e6f7g8h9i0j',
      total: 89.75,
      status: 'completed',
      createdAt: new Date('2024-01-11'),
      customer: 'Emma Brown',
      email: 'emma@example.com',
      paymentId: 'pi_5e6f7g8h9i',
      items: 'Strawberries x3, Blueberries x2, Raspberries x1',
      address: '654 Cedar Lane, Denver, CO 80202',
      fulfillment: 'delivered'
    }
  ];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Orders Management</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn, .add-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
        .add-btn { background: #28a745; }
        .filter-btn { background: #17a2b8; }
        .orders-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-top: 20px; }
        .orders-table { width: 100%; }
        .orders-table th, .orders-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        .orders-table th { background: #f8f9fa; font-weight: bold; }
        .status-pending { color: #ffc107; font-weight: bold; }
        .status-processing { color: #17a2b8; font-weight: bold; }
        .status-completed { color: #28a745; font-weight: bold; }
        .status-cancelled { color: #dc3545; font-weight: bold; }
        .fulfillment-pending { color: #ff6b35; font-weight: bold; }
        .fulfillment-shipped { color: #1e88e5; font-weight: bold; }
        .fulfillment-delivered { color: #43a047; font-weight: bold; }
        .action-btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .view-btn { background: #17a2b8; color: white; }
        .edit-btn { background: #007bff; color: white; }
        .delete-btn { background: #dc3545; color: white; }
        .fulfill-btn { background: #28a745; color: white; }
        .filters { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .filter-group { display: inline-block; margin-right: 20px; }
        .filter-group select, .filter-group input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .order-details { display: none; background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .detail-row { margin: 5px 0; }
        .detail-label { font-weight: bold; display: inline-block; width: 150px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 Orders Management</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          <button class="add-btn" onclick="importStripeOrders()">Import from Stripe</button>
        </div>
      </div>
      
      <div class="main-content">
        <!-- Filters -->
        <div class="filters">
          <div class="filter-group">
            <label>Status:</label>
            <select id="statusFilter" onchange="filterOrders()">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Fulfillment:</label>
            <select id="fulfillmentFilter" onchange="filterOrders()">
              <option value="">All Fulfillment</option>
              <option value="pending">Pending</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Date Range:</label>
            <input type="date" id="dateFrom" onchange="filterOrders()">
            <span> to </span>
            <input type="date" id="dateTo" onchange="filterOrders()">
          </div>
        </div>

        <div class="orders-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Total</th>
                <th>Status</th>
                <th>Fulfillment</th>
                <th>Payment ID</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              ${placeholderOrders.map(order => `
                <tr class="order-row" data-status="${order.status}" data-fulfillment="${order.fulfillment}" data-date="${new Date(order.createdAt).toISOString().split('T')[0]}">
                  <td>
                    <strong>${order.id.substring(0, 8)}...</strong>
                    <div class="order-details" id="details-${order.id}">
                      <div class="detail-row">
                        <span class="detail-label">Full Order ID:</span>
                        <span>${order.id}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Payment Method:</span>
                        <span>Stripe (Card ending in 4242)</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Shipping Address:</span>
                        <span>${order.address}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Items:</span>
                        <span>${order.items}</span>
                      </div>
                      <div class="detail-row">
                        <span class="detail-label">Tracking Number:</span>
                        <span id="tracking-${order.id}">${order.fulfillment === 'shipped' || order.fulfillment === 'delivered' ? 'TRK' + Math.random().toString(36).substr(2, 9).toUpperCase() : 'Not yet shipped'}</span>
                      </div>
                    </div>
                  </td>
                  <td>${order.customer}</td>
                  <td>${order.email}</td>
                  <td>$${order.total.toFixed(2)}</td>
                  <td><span class="status-${order.status}">${order.status.toUpperCase()}</span></td>
                  <td><span class="fulfillment-${order.fulfillment}" id="fulfillment-${order.id}">${order.fulfillment.toUpperCase()}</span></td>
                  <td>${order.paymentId}</td>
                  <td>${new Date(order.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button class="action-btn view-btn" onclick="toggleDetails('${order.id}')">Details</button>
                    <button class="action-btn fulfill-btn" onclick="updateFulfillment('${order.id}')">Fulfill</button>
                    <button class="action-btn edit-btn" onclick="editOrder('${order.id}')">Edit</button>
                    <button class="action-btn delete-btn" onclick="deleteOrder('${order.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        function toggleDetails(orderId) {
          const details = document.getElementById('details-' + orderId);
          details.style.display = details.style.display === 'none' ? 'block' : 'none';
        }
        
        function updateFulfillment(orderId) {
          const currentStatus = document.getElementById('fulfillment-' + orderId);
          const statuses = ['pending', 'shipped', 'delivered'];
          const currentIndex = statuses.indexOf(currentStatus.textContent.toLowerCase());
          const nextIndex = (currentIndex + 1) % statuses.length;
          const nextStatus = statuses[nextIndex];
          
          currentStatus.textContent = nextStatus.toUpperCase();
          currentStatus.className = 'fulfillment-' + nextStatus;
          
          if (nextStatus === 'shipped') {
            const trackingElement = document.getElementById('tracking-' + orderId);
            trackingElement.textContent = 'TRK' + Math.random().toString(36).substr(2, 9).toUpperCase();
          }
          
          console.log('Updated fulfillment for order', orderId, 'to', nextStatus);
        }
        
        function importStripeOrders() {
          alert('Importing orders from Stripe... This would connect to Stripe API to fetch recent orders.');
        }
        
        function filterOrders() {
          const statusFilter = document.getElementById('statusFilter').value;
          const fulfillmentFilter = document.getElementById('fulfillmentFilter').value;
          const dateFrom = document.getElementById('dateFrom').value;
          const dateTo = document.getElementById('dateTo').value;
          
          const rows = document.querySelectorAll('.order-row');
          
          rows.forEach(row => {
            let show = true;
            
            if (statusFilter && row.dataset.status !== statusFilter) {
              show = false;
            }
            
            if (fulfillmentFilter && row.dataset.fulfillment !== fulfillmentFilter) {
              show = false;
            }
            
            if (dateFrom && row.dataset.date < dateFrom) {
              show = false;
            }
            
            if (dateTo && row.dataset.date > dateTo) {
              show = false;
            }
            
            row.style.display = show ? '' : 'none';
          });
        }
        
        function editOrder(orderId) {
          alert('Edit order: ' + orderId + ' - This would open an edit form');
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
  `;
}
