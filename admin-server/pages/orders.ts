import express from 'express';
import Stripe from 'stripe';

export function registerOrdersRoutes(
  app: any,
  {
    requireAuth,
    dataProvider,
    prisma,
    supabase, // NEW: prefer Supabase
    logActivity = () => {}
  }: {
    requireAuth: any;
    dataProvider?: {
      getOrderById: (id: string) => Promise<any>;
      fulfillOrder: (id: string) => Promise<any>;
    };
    prisma?: any;
    supabase?: any; // Supabase client (server-side)
    logActivity?: (...args: any[]) => void;
  }
) {
  // Ensure a valid apiVersion is provided to the Stripe client to satisfy TypeScript/Runtime
  const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-10-29.clover' })
    : null;

  // Page
  app.get('/orders', requireAuth, (req: any, res: any) => {
    res.send(generateOrdersPage(req));
  });

  // Page: order detail
  app.get('/orders/:id', requireAuth, (req: any, res: any) => {
    res.send(generateOrderDetailPage(req));
  });

  // Stripe webhook (raw body)
  app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req: any, res: any) => {
    if (!stripe) return res.status(500).send('Stripe not configured');
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(400).send('Missing webhook secret');
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).send('Missing signature');

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (e: any) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }

    const canPersist = !!supabase || !!prisma?.order;
    if (!canPersist) {
      return res.json({ received: true, note: 'No DB client provided; webhook processed without persistence.' });
    }

    const usingSupabase = !!supabase;

    const findOrderByPi = async (piId: string) => {
      if (usingSupabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('payment_intent', piId)
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
      } else {
        return prisma.order.findFirst({ where: { status: { endsWith: piId } } });
      }
    };

    const createOrder = async (amount: number, status: string, piId: string) => {
      const existing = await findOrderByPi(piId);
      if (existing) return existing;

      if (usingSupabase) {
        const { data, error } = await supabase
          .from('orders')
          .insert([{ total: amount, status, payment_intent: piId }])
          .select('*')
          .maybeSingle();
        if (error) throw error;
        logActivity('system', 'stripe@webhook', 'ORDER_CREATE', { orderId: data?.id, total: amount, status });
        return data;
      } else {
        const order = await prisma.order.create({ data: { total: amount, status: `${status}:${piId}` } });
        logActivity('system', 'stripe@webhook', 'ORDER_CREATE', { orderId: order.id, total: amount, status });
        return order;
      }
    };

    const updateOrder = async (status: string, piId: string) => {
      if (usingSupabase) {
        const { data: existing, error: findErr } = await supabase
          .from('orders')
          .select('id')
          .eq('payment_intent', piId)
          .maybeSingle();
        if (findErr && findErr.code !== 'PGRST116') throw findErr;
        if (!existing) return;

        const { data, error } = await supabase
          .from('orders')
          .update({ status })
          .eq('payment_intent', piId)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        logActivity('system', 'stripe@webhook', 'ORDER_UPDATE', { orderId: data?.id, status });
      } else {
        const existing = await prisma.order.findFirst({ where: { status: { endsWith: piId } } });
        if (!existing) return;
        const updated = await prisma.order.update({ where: { id: existing.id }, data: { status: `${status}:${piId}` } });
        logActivity('system', 'stripe@webhook', 'ORDER_UPDATE', { orderId: updated.id, status });
      }
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const amount = ((s.amount_total ?? 0) / 100) || 0;
        const piId = String(s.payment_intent || '');
        if (piId) await createOrder(amount, s.payment_status === 'paid' ? 'stripe_paid' : 'stripe_pending', piId);
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const amount = ((pi.amount_received ?? pi.amount) / 100) || 0;
        await createOrder(amount, 'stripe_paid', pi.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await updateOrder('stripe_failed', pi.id);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : (charge.payment_intent as any)?.id;
        if (piId) await updateOrder('stripe_refunded', piId);
        break;
      }
    }
    res.json({ received: true });
  });

  // Orders API (Stripe only)
  app.get('/api/orders', requireAuth, async (_req: any, res: any) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('id,total,status,payment_intent,created_at')
          .like('status', 'stripe_%')
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        const mapped = (data || []).map((r: any) => ({
          id: r.id,
          total: typeof r.total === 'number' ? r.total : Number(r.total ?? 0),
          status: `${r.status || 'stripe_pending'}:${r.payment_intent || ''}`,
          createdAt: r.created_at
        }));
        return res.json(mapped);
      }
      if (prisma?.order) {
        const orders = await prisma.order.findMany({
          where: { status: { startsWith: 'stripe_' } },
          orderBy: { createdAt: 'desc' }
        });
        return res.json(orders);
      }
      return res.json([]);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/stripe', requireAuth, async (_req: any, res: any) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('id,total,status,payment_intent,created_at')
          .like('status', 'stripe_%')
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        const mapped = (data || []).map((r: any) => ({
          id: r.id,
          total: typeof r.total === 'number' ? r.total : Number(r.total ?? 0),
          status: `${r.status || 'stripe_pending'}:${r.payment_intent || ''}`,
          createdAt: r.created_at
        }));
        return res.json(mapped);
      }
      if (prisma?.order) {
        const orders = await prisma.order.findMany({
          where: { status: { startsWith: 'stripe_' } },
          orderBy: { createdAt: 'desc' }
        });
        return res.json(orders);
      }
      return res.json([]);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // API: get order details
  app.get('/api/orders/:id', requireAuth, async (req: any, res: any) => {
    try {
      const id = String(req.params.id);
      let order: any = null;

      if (dataProvider?.getOrderById) {
        order = await dataProvider.getOrderById(id);
      } else if (supabase) {
        const { data: raw, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', isNaN(Number(id)) ? id : Number(id))
          .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;

        if (raw) {
          const statusRaw = String(raw.status || '');
          const isPaid = statusRaw.startsWith('stripe_paid') || statusRaw.startsWith('stripe_refunded');
          const created = raw.created_at || raw.createdAt || new Date().toISOString();
          const totalDollars = Number(raw.total ?? 0);
          const totalCents = Math.round(totalDollars * 100);

          order = {
            id: String(raw.id),
            created_at: typeof created === 'string' ? created : new Date(created).toISOString(),
            financial_status: isPaid ? 'paid' : 'unpaid',
            fulfillment_status: raw.fulfillment_status || 'unfulfilled',
            customer: raw.customer || null,
            shipping_address: raw.shipping_address || null,
            billing_address: raw.billing_address || null,
            items: Array.isArray(raw.items) ? raw.items : [],

            subtotal_cents: Number.isFinite(raw.subtotal_cents) ? raw.subtotal_cents : totalCents,
            shipping_cents: Number.isFinite(raw.shipping_cents) ? raw.shipping_cents : 0,
            tax_cents: Number.isFinite(raw.tax_cents) ? raw.tax_cents : 0,
            total_cents: Number.isFinite(raw.total_cents) ? raw.total_cents : totalCents,

            timeline: Array.isArray(raw.timeline) && raw.timeline.length
              ? raw.timeline
              : [
                {
                  title: 'Order created',
                  when: new Date(created).toLocaleString(),
                  note: statusRaw || 'Created from Stripe webhook'
                }
              ]
          };
        }
      } else if (prisma?.order) {
        // Fetch the raw order record from DB
        const raw = await prisma.order.findFirst({
          where: { id: (isNaN(Number(id)) ? id : Number(id)) } as any
        });

        if (raw) {
          const statusRaw = String(raw.status || '');
          const isPaid = statusRaw.startsWith('stripe_paid') || statusRaw.startsWith('stripe_refunded');
          const created = (raw.createdAt || raw.created_at || new Date()) as any;
          const totalDollars = Number(raw.total ?? 0);
          const totalCents = Math.round(totalDollars * 100);

          // Map DB record into the UI shape expected by the detail page
          order = {
            id: String(raw.id),
            created_at: created instanceof Date ? created.toISOString() : String(created),
            financial_status: isPaid ? 'paid' : 'unpaid',
            fulfillment_status: 'unfulfilled',
            customer: null,
            shipping_address: null,
            billing_address: null,
            items: [],

            subtotal_cents: totalCents, // without item lines we mirror total
            shipping_cents: 0,
            tax_cents: 0,
            total_cents: totalCents,

            timeline: [
              {
                title: 'Order created',
                when:
                  created instanceof Date
                    ? created.toLocaleString()
                    : String(created),
                note: statusRaw || 'Created from Stripe webhook'
              }
            ]
          };
        }
      } else {
        order = getMockOrder(id);
      }

      if (!order) return res.status(404).json({ error: 'Order not found' });
      res.json(order);
    } catch {
      res.status(500).json({ error: 'Failed to load order' });
    }
  });

  // API: fulfill order (kept simple; wire your own business logic)
  app.post('/api/orders/:id/fulfill', requireAuth, async (req: any, res: any) => {
    try {
      const id = String(req.params.id);
      if (dataProvider?.fulfillOrder) {
        const updated = await dataProvider.fulfillOrder(id);
        return res.json({ ok: true, order: updated });
      }
      if (supabase) {
        const { data: existing, error: findErr } = await supabase
          .from('orders')
          .select('id,fulfillment_status')
          .eq('id', isNaN(Number(id)) ? id : Number(id))
          .maybeSingle();
        if (findErr && findErr.code !== 'PGRST116') throw findErr;
        if (!existing) return res.status(404).json({ error: 'Order not found' });

        const { data, error } = await supabase
          .from('orders')
          .update({ fulfillment_status: 'fulfilled', fulfilled_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ ok: true, order: data });
      }
      if (prisma?.order) {
        // Example minimal Prisma update (adjust to your schema)
        const updated = await prisma.order.update({
          where: { id: (isNaN(Number(id)) ? id : Number(id)) } as any,
          data: { status: 'stripe_paid' } // placeholder
        });
        return res.json({ ok: true, order: updated });
      }
      const order = getMockOrder(id);
      order.fulfillment_status = 'fulfilled';
      (order as any).fulfilled_at = new Date().toISOString();
      res.json({ ok: true, order, note: 'Mock fulfillment (no persistence)' });
    } catch {
      res.status(500).json({ error: 'Failed to fulfill order' });
    }
  });
}

export function generateOrdersPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Orders Management</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn, .refresh-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
        .refresh-btn { background: #28a745; }
        .orders-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-top: 20px; }
        .orders-table { width: 100%; }
        .orders-table th, .orders-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        .orders-table th { background: #f8f9fa; font-weight: bold; }
        .status-chip { padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 12px; display: inline-block; }
        .status-stripe_paid { background: #d4edda; color: #155724; }
        .status-stripe_pending { background: #fff3cd; color: #856404; }
        .status-stripe_failed { background: #f8d7da; color: #721c24; }
        .status-stripe_refunded { background: #d1ecf1; color: #0c5460; }
        .muted { color: #6c757d; font-size: 12px; }
        .note { margin-top: 10px; color: #666; font-size: 13px; }
        .center { text-align: center; padding: 30px; color: #666; }
        .small { font-size: 12px; color: #555; }
        .pi { font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 Orders Management</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          <button class="refresh-btn" onclick="loadOrders()">Refresh</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="note">Only Stripe orders are shown. Data is sourced from Stripe webhooks stored in the database.</div>
        <div class="orders-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment Intent</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              <tr><td colspan="6" class="center">Loading orders...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        async function loadOrders() {
          const tbody = document.getElementById('ordersTableBody');
          tbody.innerHTML = '<tr><td colspan="6" class="center">Loading orders...</td></tr>';
          try {
            const res = await fetch('/api/orders${req.query.session ? `?session=${req.query.session}` : ''}', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Failed to fetch orders');
            const orders = await res.json();

            if (!orders || orders.length === 0) {
              tbody.innerHTML = '<tr><td colspan="6" class="center">No Stripe orders found yet.</td></tr>';
              return;
            }

            tbody.innerHTML = orders.map(o => {
              const status = (o.status || '');
              const parts = status.split(':');
              const statusKey = parts[0] || 'stripe_pending';
              const piId = parts[1] || '';
              const piShort = piId ? piId.substring(0, 10) + '...' : '-';
              const created = o.createdAt ? new Date(o.createdAt).toLocaleString() : '-';
              const total = (typeof o.total === 'number') ? '$' + o.total.toFixed(2) : '-';
              const statusLabel = statusKey.replace('stripe_', '').replace('_', ' ').toUpperCase();

              return \`
                <tr onclick="location.href='/orders/\${o.id}'">
                  <td><strong>\${o.id}</strong></td>
                  <td>\${total}</td>
                  <td><span class="status-chip status-\${statusKey}">\${statusLabel}</span></td>
                  <td class="pi">\${piId ? \`\${piShort}\` : '-'}</td>
                  <td>\${created}</td>
                  <td class="small">
                    \${piId ? \`<a href="https://dashboard.stripe.com/\${location.hostname.includes('localhost') || location.hostname.endsWith('.ngrok-free.dev') ? 'test/' : ''}payments/\${piId}" target="_blank" rel="noopener">View in Stripe ↗</a>\` : '<span class="muted">No PI</span>'}
                  </td>
                </tr>\`;
            }).join('');
          } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" class="center">Failed to load orders.</td></tr>';
          }
        }

        // Initial load
        loadOrders();
      </script>
    </body>
    </html>
  `;
}

export function generateOrderDetailPage(req: any) {
  const sessionSuffix = req?.query?.session ? `?session=${encodeURIComponent(String(req.query.session))}` : '';
  const id = String(req.params?.id || '');
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Order ${id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
    .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
    .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
    .main { padding: 24px; max-width: 1100px; margin: 0 auto; }
    .card { background: white; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 700; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .muted { color: #6c757d; font-size: 12px; }
    .status-pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .pill-paid { background: #d4edda; color: #155724; }
    .pill-unpaid { background: #f8d7da; color: #721c24; }
    .pill-fulfilled { background: #d1ecf1; color: #0c5460; }
    .pill-unfulfilled { background: #fff3cd; color: #856404; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
    th { background: #f8f9fa; font-weight: 700; }
    .actions { display: flex; gap: 8px; }
    .btn { background: #28a745; color: #fff; border: none; padding: 10px 14px; border-radius: 6px; cursor: pointer; }
    .btn.secondary { background: #17a2b8; }
    .btn.danger { background: #dc3545; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .right { text-align: right; }
    .row { display: flex; gap: 16px; }
    .row > div { flex: 1; }
    .kv { margin: 0; }
    .kv dt { font-weight: 600; }
    .kv dd { margin: 0 0 8px 0; }
    .notice { padding: 10px; border-radius: 6px; background: #fff3cd; color: #856404; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧾 Order #${escapeHtml(id)}</h1>
    <div>
      <a href="/orders${sessionSuffix}" class="back-btn">Back to Orders</a>
    </div>
  </div>
  <div class="main">
    <div class="card">
      <div class="row">
        <div>
          <div class="title">Status</div>
          <div id="status-paid" class="status-pill">Loading...</div>
          <div id="status-fulfillment" class="status-pill" style="margin-left:8px;">Loading...</div>
          <div class="notice" id="mock-note" style="display:none;">This is mock data. Wire dataProvider.getOrderById/fulfillOrder to use real data.</div>
        </div>
        <div class="right">
          <div class="actions">
            <button id="btn-fulfill" class="btn">Mark Fulfilled</button>
            <button id="btn-refund" class="btn danger" disabled>Refund (wire backend)</button>
            <button id="btn-resend" class="btn secondary" disabled>Resend Email (wire backend)</button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="title">Customer</div>
        <dl class="kv">
          <dt>Name</dt><dd id="cust-name">Loading...</dd>
          <dt>Email</dt><dd id="cust-email">Loading...</dd>
          <dt>Phone</dt><dd id="cust-phone">Loading...</dd>
        </dl>
      </div>
      <div class="card">
        <div class="title">Shipping Address</div>
        <div id="addr-ship">Loading...</div>
      </div>
      <div class="card">
        <div class="title">Billing Address</div>
        <div id="addr-bill">Loading...</div>
      </div>
    </div>

    <div class="card">
      <div class="title">Items</div>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Variant</th>
            <th>Qty</th>
            <th class="right">Price</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody id="items-body">
          <tr><td colspan="5" class="muted">Loading...</td></tr>
        </tbody>
        <tfoot>
          <tr><td colspan="4" class="right">Subtotal</td><td class="right" id="subtotal">—</td></tr>
          <tr><td colspan="4" class="right">Shipping</td><td class="right" id="shipping">—</td></tr>
          <tr><td colspan="4" class="right">Tax</td><td class="right" id="tax">—</td></tr>
          <tr><td colspan="4" class="right"><strong>Total</strong></td><td class="right" id="total"><strong>—</strong></td></tr>
        </tfoot>
      </table>
    </div>

    <div class="card">
      <div class="title">Timeline</div>
      <div id="timeline">
        <div class="muted">Loading...</div>
      </div>
    </div>
  </div>

  <script>
    // Avoid server-side interpolation inside client script
    var sess = '${sessionSuffix}';
    var orderId = (window.location.pathname.split('/').pop() || '').trim();

    function fmtMoney(cents) {
      if (cents == null) return '—';
      var v = Number(cents) / 100;
      return '$' + v.toFixed(2);
    }
    function escape(s) {
      var div = document.createElement('div');
      div.textContent = String(s == null ? '' : s);
      return div.innerHTML;
    }
    function setPill(id, isGood, labels) {
      var el = document.getElementById(id);
      if (!el) return;
      el.className = 'status-pill ' + (isGood ? labels.goodClass : labels.badClass);
      el.textContent = isGood ? labels.good : labels.bad;
    }

    function load() {
      fetch('/api/orders/' + encodeURIComponent(orderId) + (sess || ''))
        .then(function(r){ return r.json(); })
        .then(function(o){
          if (o && o.__mock) document.getElementById('mock-note').style.display = 'block';

          // Status
          var paid = String(o.financial_status || '').toLowerCase() === 'paid';
          var fulfilled = String(o.fulfillment_status || '').toLowerCase() === 'fulfilled';
          setPill('status-paid', paid, { good: 'Paid', bad: 'Unpaid', goodClass: 'pill-paid', badClass: 'pill-unpaid' });
          setPill('status-fulfillment', fulfilled, { good: 'Fulfilled', bad: 'Unfulfilled', goodClass: 'pill-fulfilled', badClass: 'pill-unfulfilled' });

          // Customer
          var cust = o.customer || {};
          document.getElementById('cust-name').textContent = (cust.first_name || '') + (cust.last_name ? ' ' + cust.last_name : '');
          document.getElementById('cust-email').textContent = cust.email || '—';
          document.getElementById('cust-phone').textContent = cust.phone || '—';

          // Addresses
          function fmtAddr(a){
            if (!a) return '—';
            var parts = [a.name, a.address1, a.address2, a.city, a.province, a.postal_code, a.country].filter(Boolean);
            return parts.join(', ');
          }
          document.getElementById('addr-ship').textContent = fmtAddr(o.shipping_address);
          document.getElementById('addr-bill').textContent = fmtAddr(o.billing_address);

          // Items
          var tbody = document.getElementById('items-body');
          if (Array.isArray(o.items) && o.items.length) {
            var html = '';
            for (var i=0;i<o.items.length;i++){
              var it = o.items[i];
              var lineTotal = (Number(it.price_cents || 0) * Number(it.quantity || 0));
              html += '<tr>' +
                '<td>' + escape(it.title || '') + '</td>' +
                '<td>' + escape(it.variant || '') + '</td>' +
                '<td>' + escape(it.quantity || 0) + '</td>' +
                '<td class="right">' + fmtMoney(it.price_cents) + '</td>' +
                '<td class="right">' + fmtMoney(lineTotal) + '</td>' +
              '</tr>';
            }
            tbody.innerHTML = html;
          } else {
            tbody.innerHTML = '<tr><td colspan="5" class="muted">No items</td></tr>';
          }

          // Totals
          document.getElementById('subtotal').textContent = fmtMoney(o.subtotal_cents);
          document.getElementById('shipping').textContent = fmtMoney(o.shipping_cents);
          document.getElementById('tax').textContent = fmtMoney(o.tax_cents);
          document.getElementById('total').textContent = fmtMoney(o.total_cents);

          // Timeline
          var tl = document.getElementById('timeline');
          var events = Array.isArray(o.timeline) ? o.timeline : [];
          if (!events.length) {
            tl.innerHTML = '<div class="muted">No events yet.</div>';
          } else {
            var thtml = '';
            for (var j=0;j<events.length;j++){
              var ev = events[j];
              thtml += '<div><strong>' + escape(ev.title || 'Event') + '</strong> — ' + escape(ev.when || '') + '<div class="muted">' + escape(ev.note || '') + '</div></div>';
            }
            tl.innerHTML = thtml;
          }

          // Enable fulfill if unfulfilled
          var btn = document.getElementById('btn-fulfill');
          btn.disabled = fulfilled;
          btn.onclick = function(){
            btn.disabled = true;
            fetch('/api/orders/' + encodeURIComponent(orderId) + '/fulfill' + (sess || ''), { method: 'POST' })
              .then(function(r){ return r.json(); })
              .then(function(resp){
                load(); // refresh
              })
              .catch(function(){ btn.disabled = false; });
          };
        })
        .catch(function(){
          alert('Failed to load order');
        });
    }

    // kick off
    load();
  </script>
</body>
</html>
`;
}

// Simple HTML escape for server-side templating
function escapeHtml(s: any) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// Mock order for demo/fallback
function getMockOrder(id: string) {
  const now = new Date();
  return {
    __mock: true,
    id,
    created_at: now.toISOString(),
    financial_status: 'paid',
    fulfillment_status: 'unfulfilled',
    fulfilled_at: null,
    customer: { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '+1 555 000 1234' },
    shipping_address: { name: 'Jane Doe', address1: '123 Main St', address2: 'Apt 4', city: 'San Francisco', province: 'CA', postal_code: '94107', country: 'USA' },
    billing_address: { name: 'Jane Doe', address1: '123 Main St', address2: 'Apt 4', city: 'San Francisco', province: 'CA', postal_code: '94107', country: 'USA' },
    items: [
      { title: 'Fruit Box', variant: 'Large', quantity: 1, price_cents: 2999 },
      { title: 'Smoothie Add-on', variant: 'Mango', quantity: 2, price_cents: 499 }
    ],
    subtotal_cents: 2999 + 2*499,
    shipping_cents: 599,
    tax_cents: 412,
    total_cents: 2999 + 2*499 + 599 + 412,
    timeline: [
      { title: 'Order placed', when: now.toLocaleString(), note: 'Order received' }
    ]
  };
}
