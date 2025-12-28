import express from 'express';
import Stripe from 'stripe';

export function registerOrdersRoutes(
  app: any,
  {
    requireAuth,
    dataProvider,
    prisma,
    logActivity = () => {},
    supabase // <-- accept supabase client if provided
  }: {
    requireAuth: any;
    dataProvider?: {
      getOrderById: (id: string) => Promise<any>;
      fulfillOrder: (id: string) => Promise<any>;
    };
    prisma?: any;
    logActivity?: (...args: any[]) => void;
    supabase?: any;
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

    const canPersist = !!prisma?.order;
    if (!canPersist) {
      return res.json({ received: true, note: 'No DB client provided; webhook processed without persistence.' });
    }

    const usingSupabase = !!prisma;

    const findOrderByPi = async (piId: string) =>
      prisma.orders.findFirst({ where: { status: { endsWith: piId } } });

    const createOrder = async (amount: number, status: string, piId: string) => {
      const existing = await findOrderByPi(piId);
      if (existing) return existing;
      const order = await prisma.orders.create({ data: { total: amount, status: `${status}:${piId}` } });
      logActivity('system', 'stripe@webhook', 'ORDER_CREATE', { orderId: order.id, total: amount, status });
      return order;
    };

    const updateOrder = async (status: string, piId: string) => {
      const existing = await findOrderByPi(piId);
      if (!existing) return;
      const updated = await prisma.orders.update({ where: { id: existing.id }, data: { status: `${status}:${piId}` } });
      logActivity('system', 'stripe@webhook', 'ORDER_UPDATE', { orderId: updated.id, status });
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

  // Helper: map DB order row -> UI order shape (tailored to sample columns)
  const mapDbOrderToApi = (r: any) => {
    if (!r) return null;

    const createdAtRaw = r.created_at ?? r.createdAt ?? r.created_at_raw ?? null;
    const createdAt = createdAtRaw ? new Date(createdAtRaw).toISOString() : null;

    const total = typeof r.total_amount !== 'undefined' ? Number(r.total_amount)
      : typeof r.total === 'number' ? r.total
      : (typeof r.total_cents === 'number' ? r.total_cents / 100 : null);

    const subtotal = typeof r.subtotal === 'number' ? Number(r.subtotal)
      : (typeof r.subtotal_cents === 'number' ? r.subtotal_cents / 100 : null);

    const shipping = typeof r.shipping_amount === 'number' ? Number(r.shipping_amount)
      : (typeof r.shipping_cents === 'number' ? r.shipping_cents / 100 : 0);

    const tax = typeof r.tax_amount === 'number' ? Number(r.tax_amount)
      : (typeof r.tax_cents === 'number' ? r.tax_cents / 100 : 0);

    const statusRaw = r.status ?? r.payment_status ?? '';
    const paymentIntent = r.stripe_payment_intent_id ?? r.stripe_payment_intent ?? r.payment_intent ?? '';
    const checkoutSession = r.stripe_checkout_session_id ?? r.stripe_checkout_session ?? '';

    const shippingName = r.shipping_name ?? null;
    const customerEmail = r.shipping_email ?? r.customer_email ?? null;
    const orderNumber = r.order_number ?? null;

    return {
      id: String(r.id),
      order_number: orderNumber,
      user_id: r.user_id ?? null,
      total: total,
      subtotal_cents: subtotal != null ? Math.round(subtotal * 100) : null,
      shipping_cents: shipping != null ? Math.round(shipping * 100) : null,
      tax_cents: tax != null ? Math.round(tax * 100) : null,
      status: statusRaw,
      payment_status: r.payment_status ?? null,
      payment_intent: paymentIntent || checkoutSession || null,
      createdAt,
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
      customer: {
        name: shippingName,
        email: customerEmail,
        phone: r.shipping_phone ?? null
      },
      shipping_address: {
        address1: r.shipping_address_line1 ?? null,
        address2: r.shipping_address_line2 ?? null,
        city: r.shipping_city ?? null,
        province: r.shipping_state ?? null,
        postal_code: r.shipping_postal_code ?? null,
        country: r.shipping_country ?? null
      },
      tracking_number: r.tracking_number ?? null,
      carrier: r.carrier ?? null,
      label_url: r.label_url ?? null,
      timeline: Array.isArray(r.timeline) ? r.timeline : []
    };
  };

  // Orders API (Stripe only) - prefer Supabase
  app.get('/api/orders', requireAuth, async (_req: any, res: any) => {
    try {
      if (supabase) {
        // Fetch recent orders from Supabase and apply filter client-side
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.error('Error fetching orders from supabase', error);
          throw error;
        }

        const rows = (data || []).filter((r: any) =>
          (typeof r.status === 'string' && r.status.startsWith('stripe_')) ||
          !!r.stripe_payment_intent_id ||
          !!r.stripe_checkout_session_id ||
          r.status === 'pending'
        );

        const mapped = rows.map(mapDbOrderToApi);
        return res.json(mapped);
      }

      // Prisma fallback (unchanged)
      if (!prisma?.orders) return res.status(503).json({ error: 'DB not ready' });
      const rows = await prisma.orders.findMany({
        where: {
          OR: [
            { status: { startsWith: 'stripe_' } },
            { stripe_payment_intent_id: { not: null } },
            { stripe_checkout_session_id: { not: null } },
            { status: 'pending' }
          ]
        },
        orderBy: { created_at: 'desc' } as any
      });
      res.json((rows || []).map(mapDbOrderToApi));
    } catch (e) {
      console.error('Error fetching orders', e);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // /api/orders/stripe - same safer Supabase approach
  app.get('/api/orders/stripe', requireAuth, async (_req: any, res: any) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.error('Error fetching stripe orders from supabase', error);
          throw error;
        }

        const rows = (data || []).filter((r: any) =>
          (typeof r.status === 'string' && r.status.startsWith('stripe_')) ||
          !!r.stripe_payment_intent_id ||
          !!r.stripe_checkout_session_id ||
          r.status === 'pending'
        );

        return res.json(rows.map(mapDbOrderToApi));
      }

      if (prisma?.orders) {
        const rows = await prisma.orders.findMany({
          where: {
            OR: [
              { status: { startsWith: 'stripe_' } },
              { stripe_payment_intent_id: { not: null } },
              { stripe_checkout_session_id: { not: null } },
              { status: 'pending' }
            ]
          },
          orderBy: { created_at: 'desc' } as any
        });
        return res.json((rows || []).map(mapDbOrderToApi));
      }

      return res.json([]);
    } catch (e) {
      console.error('Error fetching stripe orders', e);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // API: get order details - prefer Supabase
  app.get('/api/orders/:id', requireAuth, async (req: any, res: any) => {
    try {
      const id = String(req.params.id);
      let order: any = null;

      if (dataProvider?.getOrderById) {
        order = await dataProvider.getOrderById(id);
      } else if (supabase) {
        const { data: raw, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (raw) order = mapDbOrderToApi(raw);
      } else if (prisma?.orders) {
        const raw = await prisma.orders.findUnique({ where: { id } as any });
        if (raw) order = mapDbOrderToApi(raw);
      } else {
        order = getMockOrder(id);
      }

      if (!order) return res.status(404).json({ error: 'Order not found' });
      res.json(order);
    } catch (e) {
      console.error('Failed to load order', e);
      res.status(500).json({ error: 'Failed to load order' });
    }
  });

  // API: fulfill order (Supabase preferred)
  app.post('/api/orders/:id/fulfill', requireAuth, async (req: any, res: any) => {
    try {
      const id = String(req.params.id);
      if (dataProvider?.fulfillOrder) {
        const updated = await dataProvider.fulfillOrder(id);
        return res.json({ ok: true, order: updated });
      }
      if (supabase) {
        const updates: any = { fulfillment_status: 'fulfilled', fulfilled_at: new Date().toISOString() };
        const { data, error } = await supabase.from('orders').update(updates).eq('id', id).select('*').maybeSingle();
        if (error) throw error;
        return res.json({ ok: true, order: mapDbOrderToApi(data) });
      }
      if (prisma?.orders) {
        const updatedRow = await prisma.orders.update({
          where: { id } as any,
          data: { fulfillment_status: 'fulfilled', fulfilled_at: new Date() }
        });
        return res.json({ ok: true, order: mapDbOrderToApi(updatedRow) });
      }

      const order = getMockOrder(id);
      order.fulfillment_status = 'fulfilled';
      (order as any).fulfilled_at = new Date().toISOString();
      res.json({ ok: true, order, note: 'Mock fulfillment (no persistence)' });
    } catch (e) {
      console.error('Failed to fulfill order', e);
      res.status(500).json({ error: 'Failed to fulfill order' });
    }
  });
}

export function generateOrdersPage(req: any) {
  const sessionSuffix = req?.query?.session ? `?session=${encodeURIComponent(String(req.query.session))}` : '';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Orders Management</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
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

        @media (max-width: 900px) {
          .orders-container { margin: 12px -16px; border-radius: 0; box-shadow: none; }
          .orders-table { width: 100%; border-spacing: 0; }
          .orders-table thead { display: none; }
          .orders-table tbody { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
          .orders-table tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); cursor: pointer; }
          .orders-table td { border-bottom: none; padding: 4px 0; font-size: 14px; }
          .orders-table td[data-label]::before { content: attr(data-label); display: block; font-weight: 600; color: #6c757d; margin-bottom: 4px; }
          .orders-table td:last-child { grid-column: 1 / -1; text-align: left; }
        }
        @media (max-width: 480px) {
          .note { font-size: 12px; }
          .header { flex-direction: column; align-items: flex-start; gap: 12px; }
          .header button { width: 100%; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 Orders Management</h1>
        <div>
          <a href="/dashboard${sessionSuffix}" class="back-btn">Back to Dashboard</a>
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
                <th>Order Number</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment Intent</th>
                <th>Customer Email</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="ordersTableBody">
              <tr><td colspan="8" class="center">Loading orders...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        // preserve session suffix for fetches and links
        const sess = ${JSON.stringify(sessionSuffix)};
        async function loadOrders() {
          const tbody = document.getElementById('ordersTableBody');
          tbody.innerHTML = '<tr><td colspan="8" class="center">Loading orders...</td></tr>';
          try {
            const res = await fetch('/api/orders' + (sess || ''), { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
            if (!res.ok) {
              if (res.status === 401) {
                // session invalid -> redirect to login page to get a new session
                window.location.href = '/?error=invalid_session';
                return;
              }
              throw new Error('Failed to fetch orders');
            }
            const orders = await res.json();

            if (!orders || orders.length === 0) {
              tbody.innerHTML = '<tr><td colspan="8" class="center">No Stripe orders found yet.</td></tr>';
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

              // ensure sessionSuffix appended to links so back/forward keeps session
              return \`
                <tr onclick="location.href='/orders/\${o.id}${sessionSuffix}'">
                  <td data-label="Order">\${o.order_number || ('#' + o.id.slice(-6))}</td>
                  <td data-label="Customer">\${o.customer?.email || '—'}</td>
                  <td data-label="Total">\${total}</td>
                  <td data-label="Status"><span class="status-chip status-\${statusKey}">\${statusLabel}</span></td>
                  <td data-label="Payment">\${piId ? \`\${piShort}\` : '-'}</td>
                  <td data-label="Created">\${created}</td>
                  <td data-label="Stripe">\${piId ? \`<a href="https://dashboard.stripe.com/\${location.hostname.includes('localhost') || location.hostname.endsWith('.ngrok-free.dev') ? 'test/' : ''}payments/\${piId}" target="_blank" rel="noopener">View in Stripe ↗</a>\` : '<span class="muted">No PI</span>'}</td>
                </tr>\`;
            }).join('');
          } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="8" class="center">Failed to load orders.</td></tr>';
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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

    @media (max-width: 900px) {
      .header { flex-direction: column; align-items: flex-start; gap: 12px; }
      .actions { flex-wrap: wrap; justify-content: flex-start; }
      .actions .btn { flex: 1 1 45%; min-width: 150px; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      .main { padding: 16px; }
      .card { padding: 16px; }
      table { display: block; overflow-x: auto; }
      th, td { white-space: nowrap; }
    }
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
