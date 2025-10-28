import axios from 'axios';

export async function generateOrdersPage(req: any) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  // Normalize query params
  const getQ = (v: any) => Array.isArray(v) ? (typeof v[0] === 'string' ? v[0] : String(v[0])) : (typeof v === 'string' ? v : undefined);
  const action = getQ(req.query?.action);
  const actId = getQ(req.query?.id);
  const newStatus = getQ(req.query?.status);
  const tracking = getQ(req.query?.trackingNumber);
  const sessionValRaw = req.query?.session;
  const sessionId = Array.isArray(sessionValRaw) ? (typeof sessionValRaw[0] === 'string' ? sessionValRaw[0] : String(sessionValRaw[0])) : (typeof sessionValRaw === 'string' ? sessionValRaw : undefined);
  const sessionQuery = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';

  let flash: { type: 'success' | 'error', message: string } | null = null;
  let selectedOrder: any = null;

  // Handle page actions server-side (stay on /orders)
  if (STRIPE_SECRET_KEY && action && actId) {
    try {
      if (action === 'updateFulfillment' && newStatus) {
        await axios.post(
          `https://api.stripe.com/v1/payment_intents/${actId}`,
          new URLSearchParams({ 'metadata[fulfillment_status]': newStatus }),
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        flash = { type: 'success', message: `Fulfillment updated to "${newStatus}" for ${actId}` };
      } else if (action === 'updateTracking') {
        await axios.post(
          `https://api.stripe.com/v1/payment_intents/${actId}`,
          new URLSearchParams({ 'metadata[tracking_number]': tracking || '' }),
          { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        flash = { type: 'success', message: `Tracking number updated for ${actId}` };
      } else if (action === 'view') {
        const d = await axios.get(`https://api.stripe.com/v1/payment_intents/${actId}`, {
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        selectedOrder = d.data;
      }
    } catch (e: any) {
      console.error('Order action error:', e?.response?.data || e?.message || e);
      flash = { type: 'error', message: 'Action failed. Please try again.' };
    }
  }

  try {
    // Only fetch orders from Stripe - remove fake database orders
    let stripeOrders = [];
    
    // Get orders from Stripe
    if (STRIPE_SECRET_KEY) {
      try {
        const stripeResponse = await axios.get('https://api.stripe.com/v1/payment_intents?limit=100', {
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        
        stripeOrders = stripeResponse.data.data.map((intent: any) => ({
          id: intent.id,
          amount: intent.amount / 100, // Convert from cents
          currency: intent.currency.toUpperCase(),
          status: intent.status,
          created: new Date(intent.created * 1000),
          customerEmail: intent.receipt_email || intent.metadata?.email || 'Unknown',
          customerName: intent.metadata?.customer_name || intent.shipping?.name || 'Unknown',
          shippingAddress: intent.shipping?.address ? {
            line1: intent.shipping.address.line1,
            line2: intent.shipping.address.line2,
            city: intent.shipping.address.city,
            state: intent.shipping.address.state,
            postal_code: intent.shipping.address.postal_code,
            country: intent.shipping.address.country
          } : null,
          phone: intent.metadata?.phone || intent.shipping?.phone || null,
          items: (() => {
            try {
              return intent.metadata?.items ? JSON.parse(intent.metadata.items) : [];
            } catch (e) {
              console.error('Failed to parse items metadata:', e);
              return [];
            }
          })(),
          fulfillmentStatus: intent.metadata?.fulfillment_status || 'pending',
          trackingNumber: intent.metadata?.tracking_number || null,
          source: 'stripe'
        }));
      } catch (stripeError) {
        console.error('Failed to fetch Stripe orders:', stripeError);
      }
    }
    
    // Only use Stripe orders - no database orders
    const allOrders = stripeOrders.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Fulfillment</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
          .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
          .main-content { padding: 30px; max-width: 1600px; margin: 0 auto; }
          .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
          .orders-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-top: 20px; }
          .orders-table { width: 100%; font-size: 12px; }
          .orders-table th, .orders-table td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
          .orders-table th { background: #f8f9fa; font-weight: bold; position: sticky; top: 0; }
          .status-badge { padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; }
          .status-succeeded { background: #d4edda; color: #155724; }
          .status-pending { background: #fff3cd; color: #856404; }
          .status-failed { background: #f8d7da; color: #721c24; }
          .status-processing { background: #d1ecf1; color: #0c5460; }
          .fulfillment-select { padding: 4px; font-size: 11px; border: 1px solid #ddd; border-radius: 3px; }
          .fulfillment-pending { background: #fff3cd; }
          .fulfillment-processing { background: #d1ecf1; }
          .fulfillment-shipped { background: #d4edda; }
          .fulfillment-delivered { background: #c3e6cb; }
          .action-btn { padding: 4px 8px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 10px; }
          .view-btn { background: #007bff; color: white; }
          .tracking-input { width: 120px; font-size: 10px; padding: 2px; }
          .source-badge { padding: 2px 6px; border-radius: 8px; font-size: 9px; }
          .source-stripe { background: #6772e5; color: white; }
          .order-details { font-size: 10px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
          .filters { margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
          .filter-group { display: inline-block; margin-right: 15px; }
          .filter-group select, .filter-group input { padding: 5px; margin-left: 5px; }
          .stats-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
          .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); text-align: center; }
          .stat-number { font-size: 24px; font-weight: bold; color: #667eea; }
          .stat-label { color: #666; font-size: 14px; }
          .no-orders-message { text-align: center; padding: 40px; color: #666; }
          .stripe-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #6772e5; }
          .flash { padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-size: 13px; }
          .flash-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .flash-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .detail-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); margin-bottom: 20px; }
          .json-viewer { background: #f8f9fa; padding: 12px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; font-size: 12px; max-height: 320px; overflow: auto; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📦 Order Fulfillment Center</h1>
          <div>
            <a href="/dashboard${sessionQuery}" class="back-btn">Back to Dashboard</a>
          </div>
        </div>
        
        <div class="main-content">
          <div class="stripe-info">
            <strong>📊 Real-time Stripe Orders</strong> - Displaying live orders from your Stripe account. 
            ${!STRIPE_SECRET_KEY ? '<span style="color: #dc3545;">⚠️ Stripe not configured</span>' : `<span style="color: #28a745;">✅ Connected to Stripe</span>`}
          </div>

          ${flash ? `<div class="flash ${flash.type === 'success' ? 'flash-success' : 'flash-error'}">${flash.message}</div>` : ''}

          ${selectedOrder ? `
          <div class="detail-box">
            <h3>Order Details: ${selectedOrder.id}</h3>
            <p><strong>Amount:</strong> $${((selectedOrder.amount||0)/100).toFixed(2)} ${selectedOrder.currency?.toUpperCase() || ''}</p>
            <p><strong>Status:</strong> ${selectedOrder.status}</p>
            <p><strong>Fulfillment:</strong> ${selectedOrder.metadata?.fulfillment_status || 'pending'}</p>
            <p><strong>Tracking #:</strong> ${selectedOrder.metadata?.tracking_number || 'Not assigned'}</p>
            ${selectedOrder.shipping ? `
              <p><strong>Ship To:</strong> ${selectedOrder.shipping.name || ''}, ${selectedOrder.shipping.address?.line1 || ''} ${selectedOrder.shipping.address?.line2 || ''}, ${selectedOrder.shipping.address?.city || ''}, ${selectedOrder.shipping.address?.state || ''} ${selectedOrder.shipping.address?.postal_code || ''}, ${selectedOrder.shipping.address?.country || ''}</p>
            ` : ''}
            <div class="json-viewer">${JSON.stringify(selectedOrder, null, 2)}</div>
          </div>
          ` : ''}

          <!-- Statistics Cards -->
          <div class="stats-cards">
            <div class="stat-card">
              <div class="stat-number">${allOrders.length}</div>
              <div class="stat-label">Total Orders</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${allOrders.filter(o => (o.fulfillmentStatus || 'pending') === 'pending').length}</div>
              <div class="stat-label">Pending Fulfillment</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">${allOrders.filter(o => (o.fulfillmentStatus || 'pending') === 'shipped').length}</div>
              <div class="stat-label">Shipped Orders</div>
            </div>
            <div class="stat-card">
              <div class="stat-number">$${allOrders.reduce((sum, o) => sum + (o.amount || 0), 0).toFixed(2)}</div>
              <div class="stat-label">Total Revenue</div>
            </div>
          </div>

          <!-- Filters -->
          <div class="filters">
            <div class="filter-group">
              <label>Status:</label>
              <select id="statusFilter" onchange="filterOrders()">
                <option value="">All Statuses</option>
                <option value="succeeded">Succeeded</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="requires_payment_method">Requires Payment</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Fulfillment:</label>
              <select id="fulfillmentFilter" onchange="filterOrders()">
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Search:</label>
              <input type="text" id="searchFilter" placeholder="Customer name/email" onkeyup="filterOrders()">
            </div>
          </div>

          <div class="orders-container">
            ${allOrders.length === 0 ? `
              <div class="no-orders-message">
                <h3>No Orders Found</h3>
                <p>No orders have been placed through Stripe yet.</p>
                ${!STRIPE_SECRET_KEY ? '<p><strong>Note:</strong> Make sure your Stripe Secret Key is configured in the .env file.</p>' : ''}
              </div>
            ` : `
            <table class="orders-table" id="ordersTable">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Payment Status</th>
                  <th>Fulfillment Status</th>
                  <th>Shipping Address</th>
                  <th>Tracking Number</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${allOrders.map(order => {
                  const orderDate = new Date(order.created);
                  const items = order.items || [];
                  const itemsDisplay = items.length > 0 ? 
                    items.map(item => `${item.name || item.product_name || 'Unknown Item'} (${item.quantity || 1})`).join(', ') : 
                    'N/A';
                  const shippingAddr = order.shippingAddress;
                  const addressDisplay = shippingAddr ? 
                    `${shippingAddr.line1 || ''}${shippingAddr.line2 ? ', ' + shippingAddr.line2 : ''}, ${shippingAddr.city || ''}, ${shippingAddr.state || ''} ${shippingAddr.postal_code || ''}` : 
                    'No address';
                  
                  return `
                    <tr data-status="${order.status}" data-fulfillment="${order.fulfillmentStatus || 'pending'}" data-customer="${((order.customerName || '') + ' ' + (order.customerEmail || '')).toLowerCase()}">
                      <td><strong>${order.id}</strong><br><span class="source-badge source-stripe">STRIPE</span></td>
                      <td>${orderDate.toLocaleDateString()}<br><small>${orderDate.toLocaleTimeString()}</small></td>
                      <td>
                        <strong>${order.customerName || 'Unknown'}</strong><br>
                        <small>${order.customerEmail || 'No email'}</small>
                      </td>
                      <td>${order.phone || 'N/A'}</td>
                      <td class="order-details" title="${itemsDisplay}">${itemsDisplay}</td>
                      <td><strong>$${(order.amount || 0).toFixed(2)} ${order.currency}</strong></td>
                      <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                      <td>
                        <select class="fulfillment-select fulfillment-${order.fulfillmentStatus || 'pending'}" 
                                onchange="updateFulfillment('${order.id}', this.value)">
                          <option value="pending" ${(order.fulfillmentStatus || 'pending') === 'pending' ? 'selected' : ''}>Pending</option>
                          <option value="processing" ${order.fulfillmentStatus === 'processing' ? 'selected' : ''}>Processing</option>
                          <option value="shipped" ${order.fulfillmentStatus === 'shipped' ? 'selected' : ''}>Shipped</option>
                          <option value="delivered" ${order.fulfillmentStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
                        </select>
                      </td>
                      <td class="order-details" title="${addressDisplay}">${addressDisplay}</td>
                      <td>
                        <input type="text" class="tracking-input" value="${order.trackingNumber || ''}" 
                               placeholder="Enter tracking #" 
                               onchange="updateTracking('${order.id}', this.value)">
                      </td>
                      <td>
                        <button class="action-btn view-btn" onclick="viewOrder('${order.id}')">View</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            `}
          </div>
        </div>
        
        <script>
          // Preserve session across actions
          const sessionQuery = '${sessionQuery}';
          function qsSep() { return sessionQuery ? '&' : '?'; }

          // Replace fetch calls with simple navigations to the same /orders route,
          // keeping all logic in this page module (no server.ts changes).
          function updateFulfillment(orderId, status) {
            window.location.href = '/orders' + sessionQuery + qsSep() + 
              'action=updateFulfillment&id=' + encodeURIComponent(orderId) + 
              '&status=' + encodeURIComponent(status);
          }
          
          function updateTracking(orderId, trackingNumber) {
            window.location.href = '/orders' + sessionQuery + qsSep() + 
              'action=updateTracking&id=' + encodeURIComponent(orderId) + 
              '&trackingNumber=' + encodeURIComponent(trackingNumber || '');
          }
          
          function viewOrder(orderId) {
            window.location.href = '/orders' + sessionQuery + qsSep() + 
              'action=view&id=' + encodeURIComponent(orderId);
          }
          
          function filterOrders() {
            const statusFilter = document.getElementById('statusFilter').value;
            const fulfillmentFilter = document.getElementById('fulfillmentFilter').value;
            const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
            
            const rows = document.querySelectorAll('#ordersTable tbody tr');
            rows.forEach(row => {
              if (!row || !row.getAttribute) return;
              const status = row.getAttribute('data-status');
              const fulfillment = row.getAttribute('data-fulfillment');
              const customer = row.getAttribute('data-customer');
              
              const statusMatch = !statusFilter || status === statusFilter;
              const fulfillmentMatch = !fulfillmentFilter || fulfillment === fulfillmentFilter;
              const searchMatch = !searchFilter || (customer || '').includes(searchFilter);
              
              row.style.display = statusMatch && fulfillmentMatch && searchMatch ? '' : 'none';
            });
          }
        </script>
      </body>
      </html>
    `;
  } catch (error) {
    console.error('Error loading orders:', error);
    return '<h1>Error loading orders</h1>';
  }
}
