import express from 'express';
import Stripe from 'stripe';
import Shippo from 'shippo';

export function registerOrdersRoutes(
  app: any,
  {
    requireAuth,
    prisma,
    logActivity = () => { }
  }: {
    requireAuth: any;
    prisma?: any;
    logActivity?: (...args: any[]) => void;
  }
) {
  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

  const shippo = process.env.SHIPPO_API_TOKEN
    ? new Shippo({ shippoToken: process.env.SHIPPO_API_TOKEN })
    : null;

  // Page
  app.get('/orders', requireAuth, (req: any, res: any) => {
    res.send(generateOrdersPage(req));
  });

  // Page: order detail
  app.get('/orders/:id', requireAuth, (req: any, res: any) => {
    res.send(generateOrderDetailPage(req));
  });

  // API: Get Orders
  app.get('/api/orders', requireAuth, async (_req: any, res: any) => {
    try {
      const orders = await prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          paymentStatus: true,
          status: true, // Note: schema uses 'status' not 'orderStatus'
          createdAt: true
        }
      });

      // Serialize Decimals
      const serialized = orders.map((o: any) => ({
        ...o,
        totalAmount: Number(o.totalAmount)
      }));

      return res.json(serialized);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // API: Get Order Detail
  app.get('/api/orders/:id', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          order_items: true
        }
      });

      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Serialize Decimals
      const serialized = {
        ...order,
        totalAmount: Number(order.totalAmount),
        subtotal: Number(order.subtotal),
        tax_amount: Number(order.tax_amount),
        shipping_amount: Number(order.shipping_amount),
        order_items: order.order_items.map((i: any) => ({
          ...i,
          unit_price: Number(i.unit_price),
          total_price: Number(i.total_price)
        }))
      };

      return res.json(serialized);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load order' });
    }
  });

  // API: Create Shipping Label (Shippo)
  app.post('/api/orders/:id/label', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!shippo) return res.status(500).json({ error: 'Shippo not configured' });

      const order = await prisma.order.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Create shipment using individual address fields
      const shipment = await shippo.shipment.create({
        address_from: {
          name: "Fruitstand NY",
          street1: "123 Fruit Lane",
          city: "New York",
          state: "NY",
          zip: "10001",
          country: "US"
        },
        address_to: {
          name: order.shipping_name || order.shipping_email,
          street1: order.shipping_address_line1,
          street2: order.shipping_address_line2,
          city: order.shipping_city,
          state: order.shipping_state,
          zip: order.shipping_postal_code,
          country: order.shipping_country || 'US',
          email: order.shipping_email,
          phone: order.shipping_phone
        },
        parcels: [{
          length: "5",
          width: "5",
          height: "5",
          distance_unit: "in",
          weight: "2",
          mass_unit: "lb"
        }],
        async: false
      });

      if (!shipment.rates || shipment.rates.length === 0) {
        return res.status(400).json({ error: 'No rates found for this address' });
      }

      const rate = shipment.rates[0];
      const transaction = await shippo.transaction.create({
        rate: rate.object_id,
        label_file_type: "PDF_4x6",
        async: false
      });

      if (transaction.status === 'SUCCESS') {
        const trackingNumber = transaction.tracking_number;
        const labelUrl = transaction.label_url;

        // Update order
        await prisma.order.update({
          where: { id },
          data: {
            trackingNumber,
            status: 'shipped',
            // shippedAt is not in the pulled schema? 
            // Schema has `createdAt`, `updatedAt`. 
            // It doesn't seem to have `shippedAt`. 
            // I'll skip it or check if I missed it.
            // Schema has `status`.
          }
        });

        logActivity(req.user.id, req.user.email, 'ORDER_SHIP', { orderId: id, trackingNumber });
        return res.json({ ok: true, trackingNumber, labelUrl });
      } else {
        return res.status(400).json({ error: 'Failed to generate label', details: transaction.messages });
      }

    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Shipping error: ' + e.message });
    }
  });
}

function generateOrdersPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Orders</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main { padding: 30px; max-width: 1200px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; }
        .card { background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:hover { background: #f8f9fa; cursor: pointer; }
        .status { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .status-paid { background: #c6f6d5; color: #276749; }
        .status-pending { background: #bee3f8; color: #2b6cb0; }
        .status-failed { background: #fed7d7; color: #9b2c2c; }
        .status-shipped { background: #d6bcfa; color: #553c9a; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 Orders</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody id="orders-body">
              <tr><td colspan="5" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        fetch('/api/orders' + session)
          .then(r => r.json())
          .then(orders => {
            const tbody = document.getElementById('orders-body');
            if (!orders.length) {
              tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No orders found</td></tr>';
              return;
            }
            tbody.innerHTML = orders.map(o => \`
              <tr onclick="location.href='/orders/\${o.id}' + session">
                <td>\${o.orderNumber || o.id}</td>
                <td>$\${(o.totalAmount || 0).toFixed(2)}</td>
                <td><span class="status status-\${(o.paymentStatus || 'pending').toLowerCase()}">\${o.paymentStatus}</span></td>
                <td><span class="status status-\${(o.status || 'pending').toLowerCase()}">\${o.status}</span></td>
                <td>\${new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            \`).join('');
          });
      </script>
    </body>
    </html>
  `;
}

function generateOrderDetailPage(req: any) {
  const id = req.params.id;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Order ${id}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main { padding: 30px; max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; }
        .card { background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
        .btn { background: #4299e1; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 10px; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .info-row { margin-bottom: 10px; }
        .info-label { font-weight: bold; font-size: 12px; color: #718096; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Order Details</h1>
        <a href="/orders${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <div class="content">
          <div class="card">
            <h3>Items</h3>
            <table id="items-table">
              <thead><tr><th>Product</th><th>Qty</th><th>Price</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        
        <div class="sidebar">
          <div class="card">
            <h3>Status</h3>
            <div class="info-row"><div class="info-label">Payment</div><div id="p-status">-</div></div>
            <div class="info-row"><div class="info-label">Fulfillment</div><div id="o-status">-</div></div>
            <div class="info-row"><div class="info-label">Tracking</div><div id="tracking">-</div></div>
            
            <button id="ship-btn" class="btn" onclick="createLabel()">Create Shipping Label</button>
            <div id="label-link" style="margin-top:10px;text-align:center"></div>
          </div>
          
          <div class="card">
            <h3>Customer</h3>
            <div id="c-email">-</div>
            <div id="c-address" style="font-size:13px;color:#666;margin-top:5px">-</div>
          </div>
        </div>
      </div>
      
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        const id = '${id}';
        
        function load() {
          fetch('/api/orders/' + id + session)
            .then(r => r.json())
            .then(o => {
              document.getElementById('p-status').textContent = o.paymentStatus;
              document.getElementById('o-status').textContent = o.status;
              document.getElementById('tracking').textContent = o.trackingNumber || 'None';
              document.getElementById('c-email').textContent = o.shipping_email || o.email; // Fallback? Schema has shipping_email
              
              document.getElementById('c-address').textContent = [
                o.shipping_address_line1,
                o.shipping_address_line2,
                o.shipping_city,
                o.shipping_state,
                o.shipping_postal_code,
                o.shipping_country
              ].filter(Boolean).join(', ');
              
              const items = o.order_items || [];
              document.getElementById('items-table').querySelector('tbody').innerHTML = items.map(i => \`
                <tr>
                  <td>\${i.product_name}</td>
                  <td>\${i.quantity}</td>
                  <td>$\${(i.unit_price || 0).toFixed(2)}</td>
                </tr>
              \`).join('');

              if (o.trackingNumber) {
                document.getElementById('ship-btn').style.display = 'none';
              }
            });
        }
        
        function createLabel() {
          const btn = document.getElementById('ship-btn');
          btn.disabled = true;
          btn.textContent = 'Generating...';
          
          fetch('/api/orders/' + id + '/label' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                btn.style.display = 'none';
                document.getElementById('tracking').textContent = res.trackingNumber;
                document.getElementById('label-link').innerHTML = \`<a href="\${res.labelUrl}" target="_blank">Download Label</a>\`;
              } else {
                alert('Error: ' + (res.error || 'Failed'));
                btn.disabled = false;
                btn.textContent = 'Create Shipping Label';
              }
            });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
