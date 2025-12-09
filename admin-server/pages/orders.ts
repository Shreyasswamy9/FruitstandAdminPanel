import express from 'express';
import Stripe from 'stripe';
import shippoFactory from 'shippo';

type VariantInfo = {
  raw: any;
  summary: string;
  size?: string;
  color?: string;
};

function normalizeVariantDetails(details: any): VariantInfo {
  if (!details) {
    return { raw: null, summary: '' };
  }

  let parsed = details;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { raw: details, summary: String(details) };
    }
  }

  const options: string[] = [];
  let size: string | undefined;
  let color: string | undefined;

  const registerOption = (label: string | undefined, value: any) => {
    if (value === null || value === undefined) {
      return;
    }

    let resolvedValue: string | undefined;
    if (typeof value === 'object' && !Array.isArray(value)) {
      if ('value' in value && value.value != null) {
        resolvedValue = String(value.value);
      } else if ('label' in value && value.label != null) {
        resolvedValue = String(value.label);
      }
    }

    if (!resolvedValue) {
      resolvedValue = typeof value === 'string' ? value : JSON.stringify(value);
    }

    if (!resolvedValue) {
      return;
    }

    const labelText = label?.trim();
    if (labelText) {
      options.push(`${labelText}: ${resolvedValue}`);
      const normalized = labelText.toLowerCase();
      if (!size && normalized.includes('size')) {
        size = resolvedValue;
      }
      if (!color && (normalized.includes('color') || normalized.includes('colour'))) {
        color = resolvedValue;
      }
    } else {
      options.push(resolvedValue);
    }
  };

  const inspect = (input: any): void => {
    if (input === null || input === undefined) {
      return;
    }

    if (Array.isArray(input)) {
      input.forEach((entry) => {
        if (typeof entry === 'string') {
          registerOption(undefined, entry);
        } else if (typeof entry === 'object' && entry !== null) {
          const label = (entry as any).label ?? (entry as any).name ?? (entry as any).option ?? (entry as any).key;
          const value = (entry as any).value ?? (entry as any).option_value ?? (entry as any).value_label ?? (entry as any).content ?? (entry as any).selection;
          if (label || value) {
            registerOption(label, value ?? entry);
          } else {
            inspect(entry);
          }
        }
      });
      return;
    }

    if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (key === 'options' || key === 'variants' || key === 'attributes') {
          inspect(value);
          continue;
        }

        if (Array.isArray(value)) {
          inspect(value);
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          if ('label' in (value as any) || 'value' in (value as any)) {
            const label = (value as any).label ?? key;
            const innerValue = (value as any).value ?? (value as any).option_value ?? (value as any).content ?? value;
            registerOption(label, innerValue);
          } else {
            inspect(value);
          }
          continue;
        }

        registerOption(key, value);
      }
      return;
    }

    if (typeof input === 'string') {
      registerOption(undefined, input);
    }
  };

  inspect(parsed);

  return {
    raw: parsed,
    summary: options.join(', '),
    size,
    color
  };
}

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

  const shippoClient = process.env.SHIPPO_API_TOKEN
    ? shippoFactory(process.env.SHIPPO_API_TOKEN)
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
      const orders = await prisma.orders.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          order_number: true,
          total_amount: true,
          payment_status: true,
          status: true,
          created_at: true,
          shipping_name: true,
          fulfilled_at: true,
          shipped_at: true,
          fulfilled_by_name: true,
          fulfilled_by_id: true
        }
      });

      const serialized = orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        totalAmount: Number(o.total_amount),
        paymentStatus: o.payment_status,
        status: o.status,
        createdAt: o.created_at,
        receivedName: o.shipping_name,
        fulfilledAt: o.fulfilled_at,
        fulfilledById: o.fulfilled_by_id,
        fulfilledByName: o.fulfilled_by_name,
        shippedAt: o.shipped_at
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
      const order = await prisma.orders.findUnique({
        where: { id },
        include: {
          order_items: true,
          customer: {
            select: {
              email: true,
              raw_user_meta_data: true
            }
          },
          fulfilled_by: {
            select: {
              email: true,
              raw_user_meta_data: true
            }
          }
        }
      });

      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Serialize Decimals
      const serialized = {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        paymentStatus: order.payment_status,
        totalAmount: Number(order.total_amount),
        subtotal: Number(order.subtotal),
        tax_amount: Number(order.tax_amount ?? 0),
        shipping_amount: Number(order.shipping_amount ?? 0),
        discount_amount: Number(order.discount_amount ?? 0),
        shipping_name: order.shipping_name,
        shipping_email: order.shipping_email,
        shipping_phone: order.shipping_phone,
        shipping_address_line1: order.shipping_address_line1,
        shipping_address_line2: order.shipping_address_line2,
        shipping_city: order.shipping_city,
        shipping_state: order.shipping_state,
        shipping_postal_code: order.shipping_postal_code,
        shipping_country: order.shipping_country,
        tracking_number: order.tracking_number,
        carrier: order.carrier,
        notes: order.notes,
        created_at: order.created_at,
        updated_at: order.updated_at,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        tracking_url: order.tracking_url,
        label_url: order.label_url,
        fulfilled_at: order.fulfilled_at,
        fulfilled_by_id: order.fulfilled_by_id,
        fulfilled_by_name: order.fulfilled_by_name,
        shipped_at: order.shipped_at,
        customer_email: order.customer?.email ?? order.shipping_email,
        customer_name: order.shipping_name,
        fulfilled_by_email: order.fulfilled_by?.email,
        fulfilled_by_profile_name: order.fulfilled_by?.raw_user_meta_data?.name,
        trackingNumber: order.tracking_number,
        labelUrl: order.label_url,
        fulfilledAt: order.fulfilled_at,
        fulfilledById: order.fulfilled_by_id,
        fulfilledByName: order.fulfilled_by_name,
        shippedAt: order.shipped_at,
        customerEmail: order.customer?.email ?? order.shipping_email,
        customerName: order.shipping_name,
        fulfilledByEmail: order.fulfilled_by?.email,
        fulfilledByProfileName: order.fulfilled_by?.raw_user_meta_data?.name,
        order_items: order.order_items.map((i: any) => {
          const variant = normalizeVariantDetails(i.variant_details);
          return {
            ...i,
            unit_price: Number(i.unit_price),
            total_price: Number(i.total_price),
            variant_details: variant.raw,
            variantSummary: variant.summary,
            variant_summary: variant.summary,
            variantSize: variant.size,
            variant_size: variant.size,
            variantColor: variant.color,
            variant_color: variant.color
          };
        })
      };

      return res.json(serialized);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to load order' });
    }
  });

  // API: Mark Order Fulfilled
  app.post('/api/orders/:id/fulfill', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const actorId = req.user?.id;

      if (!actorId) {
        return res.status(401).json({ error: 'Missing user context for fulfillment' });
      }

      let actorName = req.user?.name as string | undefined;
      let actorEmail = req.user?.email as string | undefined;

      if (!actorName || !actorEmail) {
        const actorRecord = await prisma.users.findUnique({
          where: { id: actorId },
          select: {
            email: true,
            raw_user_meta_data: true
          }
        });

        actorEmail = actorEmail ?? actorRecord?.email ?? 'system@fruitstand.local';
        actorName = actorName ?? actorRecord?.raw_user_meta_data?.name ?? actorRecord?.email ?? 'Unknown User';
      }

      const now = new Date();
      const isValidActorId = typeof actorId === 'string' && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/.test(actorId);

      const updatePayload: any = {
        status: 'fulfilled',
        fulfilled_by_name: actorName,
        fulfilled_at: now,
        updated_at: now
      };

      if (isValidActorId) {
        updatePayload.fulfilled_by_id = actorId;
      }

      const updated = await prisma.orders.update({
        where: { id },
        data: updatePayload,
        select: {
          id: true,
          fulfilled_by_name: true,
          fulfilled_at: true,
          status: true
        }
      });

      const logActorId = typeof actorId === 'string' ? actorId : 'system';
      logActivity(logActorId, actorEmail ?? 'system@fruitstand.local', 'ORDER_FULFILL', { orderId: id });

      return res.json({
        ok: true,
        fulfilledByName: updated.fulfilled_by_name,
        fulfilledAt: updated.fulfilled_at,
        status: updated.status
      });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        return res.status(404).json({ error: 'Order not found' });
      }
      console.error(e);
      res.status(500).json({ error: 'Failed to mark order fulfilled' });
    }
  });

  // API: Undo Fulfillment
  app.post('/api/orders/:id/undo-fulfill', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const actorId = req.user?.id;

      if (!actorId) {
        return res.status(401).json({ error: 'Missing user context for undo' });
      }

      const existing = await prisma.orders.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          shipped_at: true
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (existing.status === 'shipped' || existing.shipped_at) {
        return res.status(400).json({ error: 'Cannot undo fulfillment on a shipped order' });
      }

      let actorEmail = req.user?.email as string | undefined;

      if (!actorEmail && typeof actorId === 'string' && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/.test(actorId)) {
        const actorRecord = await prisma.users.findUnique({
          where: { id: actorId },
          select: { email: true }
        });
        actorEmail = actorRecord?.email ?? 'system@fruitstand.local';
      }

      const now = new Date();
      const updated = await prisma.orders.update({
        where: { id },
        data: {
          status: 'pending',
          fulfilled_at: null,
          fulfilled_by_id: null,
          fulfilled_by_name: null,
          updated_at: now
        },
        select: {
          id: true,
          status: true
        }
      });

      const logActorId = typeof actorId === 'string' ? actorId : 'system';
      logActivity(logActorId, actorEmail ?? 'system@fruitstand.local', 'ORDER_UNDO_FULFILL', { orderId: id });

      return res.json({ ok: true, status: updated.status });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        return res.status(404).json({ error: 'Order not found' });
      }
      console.error(e);
      res.status(500).json({ error: 'Failed to undo fulfillment' });
    }
  });

  // API: Create Shipping Label (Shippo)
  app.post('/api/orders/:id/label', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!shippoClient) return res.status(500).json({ error: 'Shippo not configured' });

      const order = await prisma.orders.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Create shipment using individual address fields
      const shipment = await shippoClient.shipment.create({
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
      const transaction = await shippoClient.transaction.create({
        rate: rate.object_id,
        label_file_type: "PDF_4x6",
        async: false
      });

      if (transaction.status === 'SUCCESS') {
        const trackingNumber = transaction.tracking_number;
        const labelUrl = transaction.label_url;

        const actorId = req.user?.id;
        let actorName = req.user?.name as string | undefined;
        let actorEmail = req.user?.email as string | undefined;

        const isValidActorId = typeof actorId === 'string' && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$/.test(actorId);

        if ((!actorName || !actorEmail) && isValidActorId) {
          const actorRecord = await prisma.users.findUnique({
            where: { id: actorId },
            select: {
              email: true,
              raw_user_meta_data: true
            }
          });

          actorEmail = actorEmail ?? actorRecord?.email ?? 'system@fruitstand.local';
          actorName = actorName ?? actorRecord?.raw_user_meta_data?.name ?? actorRecord?.email ?? 'Unknown User';
        }

        const now = new Date();
        const updateData: any = {
          tracking_number: trackingNumber,
          label_url: labelUrl,
          status: 'shipped',
          updated_at: now,
          shipped_at: now
        };

        if (!order.fulfilled_at) {
          updateData.fulfilled_at = now;
          updateData.fulfilled_by_name = actorName ?? 'Unknown User';
          if (isValidActorId) {
            updateData.fulfilled_by_id = actorId;
          }
        }

        // Update order
        await prisma.orders.update({
          where: { id },
          data: updateData
        });

        const logActorId = actorId ?? 'system';
        const logActorEmail = actorEmail ?? 'system@fruitstand.local';
        logActivity(logActorId, logActorEmail, 'ORDER_SHIP', { orderId: id, trackingNumber });
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
        .status-flow { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
        .status-step { display: flex; align-items: flex-start; gap: 8px; color: #4a5568; }
        .status-step-dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5f5; margin-top: 4px; }
        .status-step.active .status-step-dot { background: #667eea; }
        .status-step-label { font-weight: 600; color: #2d3748; }
        .status-step-meta { font-size: 12px; color: #4a5568; }
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
                <th>Progress</th>
                <th>Payment</th>
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
            const formatDate = (value) => {
              if (!value) return '-';
              const date = new Date(value);
              return date.toLocaleString();
            };

            tbody.innerHTML = orders.map(o => {
              const receivedMeta = \`\${o.receivedName || '—'} • \${formatDate(o.createdAt)}\`;
              const fulfilledMeta = \`\${o.fulfilledByName ? 'by ' + o.fulfilledByName : 'Pending'}\${o.fulfilledAt ? ' • ' + formatDate(o.fulfilledAt) : ''}\`;
              const shippedMeta = o.shippedAt ? formatDate(o.shippedAt) : 'Awaiting label';
              const fulfilledClass = o.fulfilledAt ? 'active' : '';
              const shippedClass = o.shippedAt ? 'active' : '';
              const fulfilledClassAttr = fulfilledClass ? ' active' : '';
              const shippedClassAttr = shippedClass ? ' active' : '';

              return \`
                <tr onclick="location.href='/orders/\${o.id}' + session">
                  <td>\${o.orderNumber || o.id}</td>
                  <td>$\${(o.totalAmount || 0).toFixed(2)}</td>
                  <td>
                    <div class="status-flow">
                      <div class="status-step active">
                        <div class="status-step-dot"></div>
                        <div>
                          <div class="status-step-label">Received</div>
                          <div class="status-step-meta">\${receivedMeta}</div>
                        </div>
                      </div>
                      <div class="status-step\${fulfilledClassAttr}">
                        <div class="status-step-dot"></div>
                        <div>
                          <div class="status-step-label">Fulfilled</div>
                          <div class="status-step-meta">\${fulfilledMeta}</div>
                        </div>
                      </div>
                      <div class="status-step\${shippedClassAttr}">
                        <div class="status-step-dot"></div>
                        <div>
                          <div class="status-step-label">Shipped</div>
                          <div class="status-step-meta">\${shippedMeta}</div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span class="status status-\${(o.paymentStatus || 'pending').toLowerCase()}">\${o.paymentStatus}</span></td>
                  <td>\${formatDate(o.createdAt)}</td>
                </tr>
              \`;
            }).join('');
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
        .btn.secondary { background: #48bb78; }
        .btn.danger { background: #f56565; }
        .info-row { margin-bottom: 10px; }
        .info-label { font-weight: bold; font-size: 12px; color: #718096; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
        .status-flow { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
        .status-step { display: flex; align-items: flex-start; gap: 10px; color: #4a5568; }
        .status-step-dot { width: 12px; height: 12px; border-radius: 50%; background: #cbd5f5; margin-top: 4px; }
        .status-step.active .status-step-dot { background: #667eea; }
        .status-step-label { font-weight: 600; color: #2d3748; }
        .status-step-meta { font-size: 12px; color: #4a5568; }
        #label-link a { color: #4299e1; text-decoration: underline; }
        .variant-meta { font-size: 12px; color: #4a5568; margin-top: 4px; }
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
              <thead><tr><th>Product</th><th>Size</th><th>Color</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
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
            <div class="status-flow" id="status-flow"></div>

            <button id="fulfill-btn" class="btn secondary" onclick="fulfillOrder()">Mark as Fulfilled</button>
            <button id="undo-fulfill-btn" class="btn danger" style="display:none" onclick="undoFulfill()">Undo Fulfillment</button>
            <button id="ship-btn" class="btn" onclick="createLabel()">Create Shipping Label</button>
            <div id="label-link" style="margin-top:10px;text-align:center"></div>
          </div>
          
          <div class="card">
            <h3>Customer</h3>
            <div id="c-name" style="font-weight:600">-</div>
            <div id="c-email">-</div>
            <div id="c-address" style="font-size:13px;color:#666;margin-top:5px">-</div>
          </div>
        </div>
      </div>
      
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        const id = '${id}';
        
        const formatDateTime = (value) => {
          if (!value) return '-';
          return new Date(value).toLocaleString();
        };

        const buildStatusFlow = (order) => {
          const customerName = order.customerName || order.customer_name || order.shipping_name || '—';
          const receivedMeta = customerName + ' • ' + formatDateTime(order.created_at || order.createdAt);
          const fulfilledBy = order.fulfilledByName || order.fulfilled_by_name;
          const fulfilledMeta = (fulfilledBy ? 'by ' + fulfilledBy : 'Pending') + ((order.fulfilledAt || order.fulfilled_at) ? ' • ' + formatDateTime(order.fulfilledAt || order.fulfilled_at) : '');
          const shippedMeta = (order.shippedAt || order.shipped_at) ? formatDateTime(order.shippedAt || order.shipped_at) : 'Awaiting label';
          const shippedActive = Boolean(order.shippedAt || order.shipped_at || order.status === 'shipped');

          const steps = [
            { label: 'Received', active: true, meta: receivedMeta },
            { label: 'Fulfilled', active: Boolean(order.fulfilledAt || order.fulfilled_at), meta: fulfilledMeta },
            { label: 'Shipped', active: shippedActive, meta: shippedMeta }
          ];

          return steps.map(step => \`
              <div class="status-step \${step.active ? 'active' : ''}">
              <div class="status-step-dot"></div>
              <div>
                <div class="status-step-label">\${step.label}</div>
                <div class="status-step-meta">\${step.meta}</div>
              </div>
            </div>
          \`).join('');
        };

        const coerceVariantDetails = (details) => {
          if (!details) return { summary: '', size: '', color: '' };
          let parsed = details;
          if (typeof parsed === 'string') {
            try {
              parsed = JSON.parse(parsed);
            } catch {
              return { summary: String(details), size: '', color: '' };
            }
          }

          const options = [];
          let size = '';
          let color = '';

          const pushOption = (label, value) => {
            if (value === null || value === undefined) return;
            let resolved = undefined;
            if (typeof value === 'object' && !Array.isArray(value)) {
              if (value.value != null) {
                resolved = value.value;
              } else if (value.label != null) {
                resolved = value.label;
              }
            }
            if (resolved === undefined) {
              resolved = typeof value === 'string' ? value : JSON.stringify(value);
            }
            if (!resolved) return;

            if (label) {
              options.push(label + ': ' + resolved);
              const lower = label.toLowerCase();
              if (!size && lower.includes('size')) size = String(resolved);
              if (!color && (lower.includes('color') || lower.includes('colour'))) color = String(resolved);
            } else {
              options.push(String(resolved));
            }
          };

          const inspect = (input) => {
            if (!input) return;
            if (Array.isArray(input)) {
              input.forEach((entry) => {
                if (typeof entry === 'string') {
                  pushOption(undefined, entry);
                } else if (typeof entry === 'object' && entry !== null) {
                  const label = entry.label ?? entry.name ?? entry.option ?? entry.key;
                  const value = entry.value ?? entry.option_value ?? entry.value_label ?? entry.content ?? entry.selection;
                  if (label || value) {
                    pushOption(label, value ?? entry);
                  } else {
                    inspect(entry);
                  }
                }
              });
              return;
            }

            if (typeof input === 'object') {
              Object.entries(input).forEach(([key, value]) => {
                if (key === 'options' || key === 'variants' || key === 'attributes') {
                  inspect(value);
                  return;
                }
                if (Array.isArray(value)) {
                  inspect(value);
                  return;
                }
                if (typeof value === 'object' && value !== null) {
                  if ('label' in value || 'value' in value) {
                    const label = value.label ?? key;
                    const inner = value.value ?? value.option_value ?? value.content ?? value.selection ?? value;
                    pushOption(label, inner);
                  } else {
                    inspect(value);
                  }
                  return;
                }
                pushOption(key, value);
              });
              return;
            }

            if (typeof input === 'string') {
              pushOption(undefined, input);
            }
          };

          inspect(parsed);
          return {
            summary: options.join(', '),
            size,
            color
          };
        };

        const resolveVariantInfo = (item) => {
          const info = {
            summary: item.variantSummary || item.variant_summary || '',
            size: item.variantSize || item.variant_size || '',
            color: item.variantColor || item.variant_color || ''
          };

          const fallback = coerceVariantDetails(item.variant_details);
          return {
            summary: info.summary || fallback.summary,
            size: info.size || fallback.size,
            color: info.color || fallback.color
          };
        };

        function load() {
          fetch('/api/orders/' + id + session)
            .then(r => r.json())
            .then(o => {
              const paymentStatus = o.paymentStatus || o.payment_status || 'pending';
              const fulfillmentStatus = o.status || 'pending';
              const trackingNumber = o.trackingNumber || o.tracking_number;
              const labelUrl = o.labelUrl || o.label_url;

              document.getElementById('p-status').textContent = paymentStatus;
              document.getElementById('o-status').textContent = fulfillmentStatus;
              document.getElementById('tracking').textContent = trackingNumber || 'None';

              document.getElementById('status-flow').innerHTML = buildStatusFlow(o);

              const customerName = o.customerName || o.customer_name || o.shipping_name;
              const customerEmail = o.customerEmail || o.customer_email || o.shipping_email || o.email;
              document.getElementById('c-name').textContent = customerName || '—';
              document.getElementById('c-email').textContent = customerEmail || '—';

              document.getElementById('c-address').textContent = [
                o.shipping_address_line1,
                o.shipping_address_line2,
                o.shipping_city,
                o.shipping_state,
                o.shipping_postal_code,
                o.shipping_country
              ].filter(Boolean).join(', ');

              const items = o.order_items || [];
              document.getElementById('items-table').querySelector('tbody').innerHTML = items.map(i => {
                const productName = i.product_name || '-';
                const quantity = typeof i.quantity === 'number' ? i.quantity : 0;
                const unitPrice = typeof i.unit_price === 'number' ? i.unit_price : 0;
                const totalPrice = typeof i.total_price === 'number' ? i.total_price : unitPrice * quantity;
                const variant = resolveVariantInfo(i);

                const sizeText = variant.size || '—';
                const colorText = variant.color || '—';
                const additionalMeta = (variant.summary || '')
                  .split(',')
                  .map(part => part.trim())
                  .filter(Boolean)
                  .filter(part => {
                    const lower = part.toLowerCase();
                    return !lower.startsWith('size:') && !lower.startsWith('color:') && !lower.startsWith('colour:');
                  })
                  .join(', ');

                const metaHtml = additionalMeta ? '<div class="variant-meta">' + additionalMeta + '</div>' : '';

                return '<tr>' +
                  '<td>' + productName + metaHtml + '</td>' +
                  '<td>' + sizeText + '</td>' +
                  '<td>' + colorText + '</td>' +
                  '<td>' + quantity + '</td>' +
                  '<td>$' + unitPrice.toFixed(2) + '</td>' +
                  '<td>$' + totalPrice.toFixed(2) + '</td>' +
                '</tr>';
              }).join('');

              const shipBtn = document.getElementById('ship-btn');
              const fulfillBtn = document.getElementById('fulfill-btn');
              const undoBtn = document.getElementById('undo-fulfill-btn');
              const labelLink = document.getElementById('label-link');

              const isFulfilled = Boolean(o.fulfilledAt || o.fulfilled_at || fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'shipped');
              const isShipped = Boolean(o.shippedAt || o.shipped_at || fulfillmentStatus === 'shipped');

              if (shipBtn) {
                if (trackingNumber) {
                  shipBtn.style.display = 'none';
                } else {
                  shipBtn.style.display = 'block';
                  shipBtn.disabled = false;
                  shipBtn.textContent = 'Create Shipping Label';
                }
              }

              if (labelLink) {
                labelLink.innerHTML = labelUrl ? \`<a href="\${labelUrl}" target="_blank">Download Label</a>\` : '';
              }

              if (fulfillBtn) {
                if (isFulfilled) {
                  fulfillBtn.style.display = 'none';
                } else {
                  fulfillBtn.style.display = 'block';
                  fulfillBtn.disabled = false;
                  fulfillBtn.textContent = 'Mark as Fulfilled';
                }
              }

              if (undoBtn) {
                if (isFulfilled && !isShipped) {
                  undoBtn.style.display = 'block';
                  undoBtn.disabled = false;
                  undoBtn.textContent = 'Undo Fulfillment';
                } else {
                  undoBtn.style.display = 'none';
                }
              }
            });
        }
        
        function createLabel() {
          const btn = document.getElementById('ship-btn');
          if (!btn) return;
          btn.disabled = true;
          btn.textContent = 'Generating...';
          
          fetch('/api/orders/' + id + '/label' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                btn.style.display = 'none';
                document.getElementById('tracking').textContent = res.trackingNumber;
                document.getElementById('label-link').innerHTML = \`<a href="\${res.labelUrl}" target="_blank">Download Label</a>\`;
                load();
              } else {
                alert('Error: ' + (res.error || 'Failed'));
                btn.disabled = false;
                btn.textContent = 'Create Shipping Label';
              }
            });
        }

        function fulfillOrder() {
          const btn = document.getElementById('fulfill-btn');
          if (!btn) return;
          btn.disabled = true;
          btn.textContent = 'Marking...';

          fetch('/api/orders/' + id + '/fulfill' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                load();
              } else {
                alert('Error: ' + (res.error || 'Failed'));
                btn.disabled = false;
                btn.textContent = 'Mark as Fulfilled';
              }
            })
            .catch(() => {
              alert('Unable to mark as fulfilled');
              btn.disabled = false;
              btn.textContent = 'Mark as Fulfilled';
            });
        }

        function undoFulfill() {
          const btn = document.getElementById('undo-fulfill-btn');
          if (!btn) return;
          btn.disabled = true;
          btn.textContent = 'Reverting...';

          fetch('/api/orders/' + id + '/undo-fulfill' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                load();
              } else {
                alert('Error: ' + (res.error || 'Failed'));
                btn.disabled = false;
                btn.textContent = 'Undo Fulfillment';
              }
            })
            .catch(() => {
              alert('Unable to undo fulfillment');
              btn.disabled = false;
              btn.textContent = 'Undo Fulfillment';
            });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
