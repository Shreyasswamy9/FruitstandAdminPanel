import crypto from 'crypto';
import express from 'express';
import Stripe from 'stripe';
import * as ShippoModule from 'shippo';
import mailchimp from '@mailchimp/mailchimp_marketing';

const { Shippo } = ShippoModule as any;

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
    ? new Shippo({ apiKeyHeader: process.env.SHIPPO_API_TOKEN })
    : null;

  // Verify token is loaded
  if (process.env.SHIPPO_API_TOKEN && shippoClient) {
    console.log('✅ Shippo configured with token:', process.env.SHIPPO_API_TOKEN.substring(0, 20) + '...');
  } else if (process.env.SHIPPO_API_TOKEN) {
    console.warn('⚠️ Shippo token exists but client failed to initialize');
  } else {
    console.log('ℹ️ Shippo not configured (SHIPPO_API_TOKEN not set)');
  }

  if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_SERVER_PREFIX) {
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX
    });
  }

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
          shipping_address_line1: true,
          shipping_address_line2: true,
          shipping_city: true,
          shipping_state: true,
          shipping_postal_code: true,
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
        shippingAddress: [o.shipping_address_line1, o.shipping_address_line2, o.shipping_city, o.shipping_state, o.shipping_postal_code].filter(Boolean).join(', '),
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

  // API: Remove Shipped Status
  app.post('/api/orders/:id/unship', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const actorId = req.user?.id;

      if (!actorId) {
        return res.status(401).json({ error: 'Missing user context for unship' });
      }

      const existing = await prisma.orders.findUnique({
        where: { id },
        select: {
          id: true,
          shipped_at: true,
          fulfilled_at: true
        }
      });

      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (!existing.shipped_at) {
        return res.status(400).json({ error: 'Order is not shipped' });
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
      const status = existing.fulfilled_at ? 'fulfilled' : 'pending';

      const updated = await prisma.orders.update({
        where: { id },
        data: {
          status,
          shipped_at: null,
          tracking_number: null,
          tracking_url: null,
          label_url: null,
          carrier: null,
          updated_at: now
        },
        select: {
          id: true,
          status: true
        }
      });

      const logActorId = typeof actorId === 'string' ? actorId : 'system';
      logActivity(logActorId, actorEmail ?? 'system@fruitstand.local', 'ORDER_UNSHIP', { orderId: id });

      return res.json({ ok: true, status: updated.status });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        return res.status(404).json({ error: 'Order not found' });
      }
      console.error(e);
      res.status(500).json({ error: 'Failed to remove shipped status' });
    }
  });

  // Predefined package templates
  const PACKAGE_TEMPLATES = [
    { name: 'Apple Mailer', length: 16, width: 12, height: 3, weight: 28, unit: 'oz' },
    { name: 'Hat Box', length: 8, width: 8, height: 9, weight: 5, unit: 'oz' },
    { name: 'Orange Mailer', length: 16, width: 12, height: 1, weight: 0, unit: 'oz' },
    { name: 'T Shirt in 17x12 with bag', length: 20, width: 14.25, height: 1, weight: 17, unit: 'oz' },
    { name: 'Hoodie in packaging (with bag and 17 x12 envelope)', length: 20, width: 14.25, height: 1, weight: 31.6, unit: 'oz' },
    { name: 'Hat Order', length: 12.5, width: 9.5, height: 2, weight: 4.5, unit: 'oz' },
    { name: 'Medium Size T-Shirt in Packaging', length: 14, width: 10, height: 3, weight: 9, unit: 'oz' },
    { name: 'FRUITSTAND FRUITPAK™', length: 8, width: 5, height: 0.6, weight: 2.5, unit: 'oz' }
  ];

  // Helper to convert oz to lbs
  const ozToLbs = (oz: number) => {
    const lbs = oz / 16;
    const safe = Number.isFinite(lbs) ? Math.max(lbs, 0.1) : 0.1;
    return safe.toFixed(2);
  };

  // API: Get Parcel Templates
  app.get('/api/parcel-templates', requireAuth, async (req: any, res: any) => {
    try {
      // Get custom templates from database if you add them
      const customTemplates: any[] = [];

      // Combine predefined and custom templates
      const formatted = [
        ...PACKAGE_TEMPLATES.map((t) => ({
          name: t.name,
          length: t.length,
          width: t.width,
          height: t.height,
          weight: ozToLbs(t.weight),
          custom: false
        })),
        ...customTemplates
      ];

      return res.json({ ok: true, templates: formatted });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to get templates: ' + e.message });
    }
  });

  // API: Get Shipping Rates (with configurable package dimensions)
  app.post('/api/orders/:id/shipping-rates', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!shippoClient) {
        console.error('Shippo client not initialized');
        return res.status(500).json({ error: 'Shippo not configured' });
      }

      const order = await prisma.orders.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Get package dimensions from request body, with defaults
      const { length = "5", width = "5", height = "5", weight = "2", addressFrom, addressTo: bodyAddressTo } = req.body;
      const parsedWeight = Number.parseFloat(weight);
      const safeWeight = Number.isFinite(parsedWeight) ? Math.max(parsedWeight, 0.1).toFixed(2) : '0.1';

      console.log('Shipping rates request:', { length, width, height, weight, addressFrom });

      // Normalize address: merge street2 into street1 to prevent carriers from reordering
      const normalizeAddress = (addr: any) => {
        if (!addr) return addr;
        const normalized = { ...addr };
        if (normalized.street1 && normalized.street2) {
          normalized.street1 = `${normalized.street1} ${normalized.street2}`;
          delete normalized.street2;
        }
        return normalized;
      };

      // Use custom address if provided, otherwise use default
      let fromAddress = addressFrom || {
        name: "FRUITSTAND",
        street1: "37-30 Review Avenue",
        street2: "Suite 202",
        city: "Long Island City",
        state: "NY",
        zip: "11101",
        country: "US"
      };
      
      // Normalize the return address
      fromAddress = normalizeAddress(fromAddress);

      try {
        console.log('Creating shipment with address:', fromAddress);
        // Build resolved destination: use client-supplied addressTo if provided, fall back to order fields
        const resolvedAddressTo = {
          name: bodyAddressTo?.name || order.shipping_name || order.shipping_email,
          street1: bodyAddressTo?.street1 || order.shipping_address_line1,
          street2: bodyAddressTo?.street2 || order.shipping_address_line2,
          city: bodyAddressTo?.city || order.shipping_city,
          state: bodyAddressTo?.state || order.shipping_state,
          zip: bodyAddressTo?.zip || order.shipping_postal_code,
          country: bodyAddressTo?.country || order.shipping_country || 'US',
          email: order.shipping_email,
          phone: order.shipping_phone
        };
        // Create shipment using individual address fields
        const shipment = await shippoClient.shipments.create({
          addressFrom: fromAddress,
          addressTo: resolvedAddressTo,
          parcels: [{
            length: String(length),
            width: String(width),
            height: String(height),
            distanceUnit: "in",
            weight: String(safeWeight),
            massUnit: "lb"
          }],
          async: false
        });
        console.log('Shipment created:', JSON.stringify(shipment, null, 2));

        if (!shipment.rates || shipment.rates.length === 0) {
          console.error('No rates in shipment response');
          return res.status(400).json({ error: 'No rates found for this address' });
        }

        // Format rates for frontend selection
        const formattedRates = shipment.rates.map((rate: any) => ({
          object_id: rate.objectId || rate.object_id,
          provider: rate.provider,
          servicelevel: {
            name: rate.servicelevel?.name || 'Unknown Service',
            token: rate.servicelevel?.token || 'unknown'
          },
          amount: rate.amount,
          currency: rate.currency,
          estimated_days: rate.estimatedDays || rate.estimated_days
        }));

        // Log all rates for debugging
        console.log('Formatted rates:', JSON.stringify(formattedRates, null, 2));

        // Helper to normalize strings for matching
        const normalize = (str: string | undefined) =>
          (str || '').toLowerCase().replace(/\s|_|-/g, '');

        // Find USPS Ground Advantage rate robustly
        let defaultRate = formattedRates.find((rate: {
          object_id: string;
          provider: string;
          servicelevel: { name: string; token: string };
          amount: string;
          currency: string;
          estimated_days: number;
        }) => {
          const provider = normalize(rate.provider);
          const token = normalize(rate.servicelevel?.token);
          const name = normalize(rate.servicelevel?.name);
          return provider === 'usps' && (
            token.includes('groundadvantage') ||
            name.includes('groundadvantage')
          );
        });

        // Fallback: first USPS rate if Ground Advantage not found
        if (!defaultRate) {
          defaultRate = formattedRates.find((rate: any) => normalize(rate.provider) === 'usps');
        }

        return res.json({
          ok: true,
          rates: formattedRates,
          defaultRateId: defaultRate?.object_id,
          shipmentId: (shipment as any).object_id,
          packageDimensions: {
            length,
            width,
            height,
            weight 
          }
        });
      } catch (shippoError: any) {
        console.error('Shippo API Error:', shippoError);
        console.error('Shippo error message:', shippoError.message);
        console.error('Shippo error details:', shippoError.details || shippoError.response?.data);
        return res.status(500).json({ error: 'Shippo API Error: ' + (shippoError.message || 'Unknown error'), details: shippoError.details });
      }
    } catch (e: any) {
      console.error('Shipping rates endpoint error:', e);
      res.status(500).json({ error: 'Failed to get shipping rates: ' + e.message });
    }
  });

  // API: Purchase Label with Selected Rate
  app.post('/api/orders/:id/purchase-label', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!shippoClient) return res.status(500).json({ error: 'Shippo not configured' });

      const order = await prisma.orders.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const { rateId, labelFileType = 'PDF_4x6' } = req.body;
      if (!rateId) {
        return res.status(400).json({ error: 'Rate ID is required' });
      }

      // Create transaction to purchase label
      const transaction = await shippoClient.transactions.create({
        rate: rateId,
        labelFileType: labelFileType,
        async: false
      });

      console.log('Transaction response:', JSON.stringify(transaction, null, 2));

      if (transaction.status === 'SUCCESS') {
        const trackingNumber = transaction.trackingNumber || transaction.tracking_number;
        const labelUrl = transaction.labelUrl || transaction.label_url;

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
        console.error('Transaction failed. Status:', transaction.status, 'Messages:', transaction.messages);
        return res.status(400).json({ error: 'Failed to generate label', status: transaction.status, details: transaction.messages });
      }

    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Shipping error: ' + e.message });
    }
  });

  // API: Download shipping label (proxy through server)
  app.get('/api/orders/:id/download-label', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const order = await prisma.orders.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!order.label_url) return res.status(404).json({ error: 'No label available' });

      // Fetch the PDF from Shippo
      const labelResponse = await fetch(order.label_url);
      if (!labelResponse.ok) {
        return res.status(500).json({ error: 'Failed to fetch label' });
      }

      // Get the PDF content
      const pdfBuffer = await labelResponse.arrayBuffer();

      // Prepare a safe filename using the customer's name, fallback to tracking number or order ID
      let baseName = order.shipping_name
        ? `${order.shipping_name.replace(/[^a-zA-Z0-9-_]/g, '_')}-shipping-label`
        : order.tracking_number
          ? `${order.tracking_number}-shipping-label`
          : `${id}-shipping-label`;
      baseName = baseName.replace(/_+/g, '_'); // Collapse multiple underscores
      const filename = `${baseName}.pdf`;

      // Set headers to force download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.byteLength);

      res.send(Buffer.from(pdfBuffer));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Download error: ' + e.message });
    }
  });

  // API: Send Shipping Email via Mailchimp
  app.post('/api/orders/:id/send-shipping-email', requireAuth, async (req: any, res: any) => {
    try {
      if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER_PREFIX) {
        return res.status(500).json({ error: 'Mailchimp not configured' });
      }

      if (!process.env.MAILCHIMP_SHIPPING_JOURNEY_ID || !process.env.MAILCHIMP_SHIPPING_STEP_ID) {
        return res.status(500).json({ error: 'Mailchimp shipping journey not configured' });
      }

      const id = req.params.id;
      const order = await prisma.orders.findUnique({
        where: { id },
        include: {
          customer: {
            select: { email: true }
          }
        }
      });

      if (!order) return res.status(404).json({ error: 'Order not found' });

      const email = order.customer?.email ?? order.shipping_email;
      if (!email) return res.status(400).json({ error: 'Customer email not found for this order' });

      const trackingNumber = order.tracking_number;
      if (!trackingNumber) return res.status(400).json({ error: 'Tracking number not found for this order' });

      const orderNumber = order.order_number ?? id;
      const labelUrl = order.label_url ?? undefined;

      if (!process.env.MAILCHIMP_LIST_ID) {
        return res.status(500).json({ error: 'Mailchimp list ID not configured' });
      }

      try {
        const subscriberHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
        await mailchimp.lists.setListMember(process.env.MAILCHIMP_LIST_ID, subscriberHash, {
          email_address: email,
          status_if_new: 'subscribed',
          merge_fields: { TEXTAREAY: String(trackingNumber) }
        });
      } catch (e: any) {
        console.error('Mailchimp setListMember failed:', e?.response?.body?.detail || e?.message || e);
        return res.status(500).json({ error: 'Failed to update Mailchimp list member', details: e?.response?.body || e?.message || e });
      }

      await mailchimp.customerJourneys.trigger(
        process.env.MAILCHIMP_SHIPPING_JOURNEY_ID,
        process.env.MAILCHIMP_SHIPPING_STEP_ID,
        {
          email_address: email,
          event: {
            name: 'order_shipped',
            properties: {
              ORDERNUMBER: orderNumber,
              TRACKINGNUMBER: trackingNumber,
              ORDERID: id,
              LABELURL: labelUrl
            }
          }
        }
      );

      return res.json({ ok: true });
    } catch (e: any) {
      console.error('Mailchimp shipping email failed:', e);
      return res.status(500).json({ error: 'Failed to send shipping email', details: e?.response?.body || e?.message || e });
    }
  });

  // API: Create Shipping Label (Shippo) - Legacy endpoint kept for backwards compatibility
  app.post('/api/orders/:id/label', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      if (!shippoClient) return res.status(500).json({ error: 'Shippo not configured' });

      const order = await prisma.orders.findUnique({ where: { id } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      // Normalize address: merge street2 into street1 to prevent carriers from reordering
      const normalizeAddress = (addr: any) => {
        if (!addr) return addr;
        const normalized = { ...addr };
        if (normalized.street1 && normalized.street2) {
          normalized.street1 = `${normalized.street1} ${normalized.street2}`;
          delete normalized.street2;
        }
        return normalized;
      };

      // Create shipment using individual address fields
      let fromAddress = {
        name: "FRUITSTAND",
        street1: "37-30 Review Avenue",
        street2: "Suite 202",
        city: "Long Island City",
        state: "NY",
        zip: "11101",
        country: "US"
      };
      
      // Normalize the return address
      fromAddress = normalizeAddress(fromAddress);

      const shipment = await shippoClient.shipments.create({
        addressFrom: fromAddress,
        addressTo: {
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
          distanceUnit: "in",
          weight: "2",
          massUnit: "lb"
        }],
        async: false
      });

      if (!shipment.rates || shipment.rates.length === 0) {
        return res.status(400).json({ error: 'No rates found for this address' });
      }

      const rate = shipment.rates[0];
      const transaction = await shippoClient.transactions.create({
        rate: rate.objectId || rate.object_id,
        labelFileType: "PDF_4x6",
        async: false
      });

      if (transaction.status === 'SUCCESS') {
        const trackingNumber = transaction.trackingNumber || transaction.tracking_number;
        const labelUrl = transaction.labelUrl || transaction.label_url;

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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orders</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        * { box-sizing: border-box; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; flex-wrap: wrap; gap: 8px; }
        .main { padding: 16px; max-width: 1200px; margin: 0 auto; }
        .search-container { margin-bottom: 16px; }
        .search-input { width: 100%; padding: 12px 16px; font-size: 15px; border: 2px solid #e0e0e0; border-radius: 10px; -webkit-appearance: none; appearance: none; transition: border-color 0.3s; }
        .search-input:focus { outline: none; border-color: #667eea; }
        .search-info { margin-top: 8px; font-size: 13px; color: #666; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:active { background: #f8f9fa; }
        .order-cell { cursor: pointer; }
        .customer-name { font-weight: 600; color: #333; margin-bottom: 4px; }
        .customer-address { font-size: 12px; color: #666; line-height: 1.4; }
        .status { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .status-received { background: #e2e8f0; color: #334155; }
        .status-fulfilled { background: #bfdbfe; color: #1e3a8a; }
        .status-shipped { background: #bbf7d0; color: #166534; }
        .status-flow { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
        .status-step { display: flex; align-items: flex-start; gap: 8px; color: #4a5568; }
        .status-step-dot { width: 10px; height: 10px; border-radius: 50%; background: #cbd5f5; margin-top: 4px; }
        .status-step.active .status-step-dot { background: #667eea; }
        .status-step-label { font-weight: 600; color: #2d3748; }
        .status-step-meta { font-size: 12px; color: #4a5568; }
        .no-results { text-align: center; padding: 40px 20px; color: #999; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 20px; margin: 0; }
          .main { padding: 12px; }
          table { font-size: 13px; }
          th, td { padding: 10px 8px; }
          .card { border-radius: 10px; }
          .search-input { padding: 11px 14px; font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="margin: 0;">📦 Orders</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <div class="search-container">
          <input type="text" id="searchInput" class="search-input" placeholder="🔍 Search by order number, customer name, or address...">
          <div class="search-info" id="searchInfo"></div>
        </div>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Address</th>
                <th>Total</th>
                <th>Status Timeline</th>
                <th>Current Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody id="orders-body">
              <tr><td colspan="7" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        let allOrders = [];

        fetch('/api/orders' + session)
          .then(r => r.json())
          .then(orders => {
            allOrders = orders;
            renderOrders(orders);
          });

        document.getElementById('searchInput').addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase().trim();
          
          if (!query) {
            renderOrders(allOrders);
            return;
          }

          const filtered = allOrders.filter(o => {
            const orderNumber = (o.orderNumber || o.id).toString().toLowerCase();
            const customerName = (o.receivedName || '').toLowerCase();
            const address = (o.shippingAddress || '').toLowerCase();
            
            return orderNumber.includes(query) || customerName.includes(query) || address.includes(query);
          });

          renderOrders(filtered, query);
        });

        function renderOrders(orders, searchQuery = '') {
          const tbody = document.getElementById('orders-body');
          const searchInfo = document.getElementById('searchInfo');

          if (!orders.length) {
            tbody.innerHTML = searchQuery 
              ? \`<tr><td colspan="7" style="text-align:center">No orders found matching "\${searchQuery}"</td></tr>\`
              : '<tr><td colspan="7" style="text-align:center">No orders found</td></tr>';
            searchInfo.textContent = searchQuery ? \`Found 0 results\` : '';
            return;
          }

          searchInfo.textContent = searchQuery ? \`Found \${orders.length} result\${orders.length === 1 ? '' : 's'}\` : '';

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
            const lifecycleStatus = o.shippedAt ? 'Shipped' : (o.fulfilledAt ? 'Fulfilled' : 'Received');
            const lifecycleStatusClass = lifecycleStatus.toLowerCase();

            return \`
              <tr onclick="location.href='/orders/\${o.id}' + session">
                <td style="font-weight: 600;">\${o.orderNumber || o.id}</td>
                <td>
                  <div class="customer-name">\${o.receivedName || '-'}</div>
                </td>
                <td>
                  <div class="customer-address">\${o.shippingAddress || '-'}</div>
                </td>
                <td>$\${(o.totalAmount || 0).toFixed(2)}</td>
                <td>
                  <div class="status-flow">
                    <div class="status-step active">
                      <div class="status-step-dot"></div>
                      <div>
                        <div class="status-step-label">Received</div>
                        <div class="status-step-meta">\${formatDate(o.createdAt)}</div>
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
                <td><span class="status status-\${lifecycleStatusClass}">\${lifecycleStatus}</span></td>
                <td>\${formatDate(o.createdAt)}</td>
              </tr>
            \`;
          }).join('');
        }
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order ${id}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; flex-wrap: wrap; gap: 8px; }
        .header h1 { font-size: 20px; margin: 0; }
        .main { padding: 16px; max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 16px; margin-bottom: 16px; min-width: 0; }
        .btn { background: #4299e1; color: white; border: none; padding: 14px 18px; border-radius: 10px; cursor: pointer; width: 100%; margin-top: 10px; min-height: 44px; touch-action: manipulation; font-size: 16px; font-weight: 600; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn:active { opacity: 0.85; }
        .btn.secondary { background: #48bb78; }
        .btn.danger { background: #f56565; }
        .info-row { margin-bottom: 12px; }
        .info-label { font-weight: bold; font-size: 12px; color: #718096; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
        .status-flow { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
        .status-step { display: flex; align-items: flex-start; gap: 10px; color: #4a5568; }
        .status-step-dot { width: 12px; height: 12px; border-radius: 50%; background: #cbd5f5; margin-top: 4px; }
        .status-step.active .status-step-dot { background: #667eea; }
        .status-step-label { font-weight: 600; color: #2d3748; }
        .status-step-meta { font-size: 12px; color: #4a5568; }
        #label-link { margin-top: 12px; }
        .label-actions { display: flex; flex-direction: column; gap: 10px; max-width: 260px; margin: 0 auto; align-items: stretch; }
        .label-actions .action-btn { display: flex; align-items: center; justify-content: center; width: 100%; max-width: 100%; padding: 12px 16px; border-radius: 8px; font-weight: 600; font-size: 15px; border: 2px solid transparent; text-decoration: none; cursor: pointer; transition: all 0.2s ease; box-sizing: border-box; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label-actions .action-btn:hover { transform: translateY(-1px); filter: brightness(0.98); }
        .label-actions .action-btn:active { transform: translateY(0); }
        .action-btn.success { background: #22c55e; color: white; border-color: #16a34a; }
        .action-btn.primary { background: #2563eb; color: white; border-color: #1d4ed8; }
        .action-btn.info { background: #0ea5e9; color: white; border-color: #0284c7; }
        .variant-meta { font-size: 12px; color: #4a5568; margin-top: 4px; }
        @media (max-width: 768px) {
          .main { grid-template-columns: 1fr; padding: 12px; gap: 12px; }
          .card { padding: 14px; }
          .btn { padding: 14px 16px; font-size: 15px; }
          .label-actions { max-width: 100%; }
          table { display: block; width: 100%; font-size: 13px; }
          thead { display: none; }
          tbody, tr { display: block; width: 100%; }
          tr { border-bottom: 1px solid #eee; padding: 10px 0; margin-bottom: 8px; }
          td { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border: none; font-size: 13px; }
          td::before { content: attr(data-label); font-weight: 600; color: #4a5568; flex: 0 0 100px; }
          td:last-child { border-bottom: none; }
        }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .main { padding: 10px; gap: 10px; }
          .card { padding: 12px; border-radius: 10px; }
          .btn { padding: 12px 14px; font-size: 15px; min-height: 44px; }
          table { font-size: 12px; }
          td { gap: 8px; padding: 4px 0; }
          td::before { flex: 0 0 90px; font-size: 12px; }
        }
        .ship-rate-btn.selected {
          border-color: #2563eb !important;
          background: linear-gradient(90deg,#e0e7ff 60%,#f8fafc 100%) !important;
          box-shadow: 0 2px 8px #c7d2fe !important;
        }
        .ship-rate-btn {
          transition: all 0.18s;
        }
        .ship-rate-btn:hover:not(:disabled) {
          border-color: #667eea;
          box-shadow: 0 2px 10px rgba(102, 126, 234, 0.2);
        }
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
            <button id="fulfill-btn" class="btn secondary" onclick="fulfillOrder()">Mark as Fulfilled</button>
            <button id="undo-fulfill-btn" class="btn danger" style="display:none" onclick="undoFulfill()">Remove Fulfilled</button>
            <button id="undo-ship-btn" class="btn danger" style="display:none" onclick="undoShip()">Remove Shipped</button>
            <button id="ship-btn" class="btn" onclick="openLabelModal()">Create Shipping Label</button>
            <div id="label-link"></div>

            <div class="info-row"><div class="info-label">Current Status</div><div id="lifecycle-status">-</div></div>
            <div class="info-row"><div class="info-label">Tracking ID</div><div id="tracking-container" style="display:flex;align-items:center;gap:8px"><code id="tracking" style="padding:4px 8px;background:#f5f5f5;border-radius:4px;font-family:monospace;font-size:12px;flex:1;word-break:break-all">-</code><button onclick="copyTracking()" style="padding:4px 8px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0">Copy</button></div></div>
            <div class="status-flow" id="status-flow"></div>
          </div>
          
          <div class="card">
            <h3>Customer</h3>
            <div id="c-name" style="font-weight:600">-</div>
            <div id="c-email">-</div>
            <div id="c-address" style="font-size:13px;color:#666;margin-top:5px">-</div>
          </div>
        </div>
      </div>

      <!-- Shipping Label Modal -->
      <div id="label-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;overflow:hidden">
        <div style="background:white;border-radius:12px;padding:0;max-width:520px;width:95%;height:auto;max-height:95vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden">
          
          <!-- Header with step indicator -->
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;border-radius:12px 12px 0 0">
            <h2 style="margin:0;font-size:22px">Create Shipping Label</h2>
            <div style="margin-top:12px;display:flex;gap:8px">
              <div style="flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;transition:all 0.3s" id="step-indicator-1"></div>
              <div style="flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;transition:all 0.3s" id="step-indicator-2"></div>
              <div style="flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;transition:all 0.3s" id="step-indicator-3"></div>
              <div style="flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;transition:all 0.3s" id="step-indicator-4"></div>
              <div style="flex:1;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;transition:all 0.3s" id="step-indicator-5"></div>
            </div>
          </div>

          <!-- Content -->
          <div style="overflow-y:auto;flex:1;padding:24px">
            
            <!-- Step 1: Template Selection -->
            <div id="step-1" style="display:block">
              <h3 style="margin:0 0 16px 0;color:#2d3748">📦 Select Package Template</h3>
              <div id="template-buttons" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px"></div>
              <div style="padding:12px;background:#f0f7ff;border-left:4px solid #4299e1;border-radius:6px;font-size:13px;color:#2c5aa0">
                ℹ️ Templates store pre-set dimensions and weight for quick access.
              </div>
            </div>

            <!-- Step 2: Dimensions & Weight -->
            <div id="step-2" style="display:none">
              <h3 style="margin:0 0 16px 0;color:#2d3748">📏 Package Dimensions & Weight</h3>
              <div style="margin-bottom:16px">
                <label style="display:block;margin-bottom:8px;font-weight:600;font-size:13px;color:#2d3748">Dimensions (inches)</label>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                  <div>
                    <input type="number" id="pkg-length" value="5" min="1" placeholder="Length" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px;box-sizing:border-box;font-size:13px">
                    <div style="font-size:11px;color:#718096;margin-top:4px;text-align:center;font-weight:600">L</div>
                  </div>
                  <div>
                    <input type="number" id="pkg-width" value="5" min="1" placeholder="Width" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px;box-sizing:border-box;font-size:13px">
                    <div style="font-size:11px;color:#718096;margin-top:4px;text-align:center;font-weight:600">W</div>
                  </div>
                  <div>
                    <input type="number" id="pkg-height" value="5" min="1" placeholder="Height" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px;box-sizing:border-box;font-size:13px">
                    <div style="font-size:11px;color:#718096;margin-top:4px;text-align:center;font-weight:600">H</div>
                  </div>
                </div>
              </div>
              <div style="margin-bottom:16px">
                <label style="display:block;margin-bottom:8px;font-weight:600;font-size:13px;color:#2d3748">Weight (lbs)</label>
                <input type="number" id="pkg-weight" value="2" min="0.1" step="0.1" placeholder="Weight" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:6px;box-sizing:border-box;font-size:13px">
              </div>
            </div>

            <!-- Step 3: Shipping Service -->
            <div id="step-3" style="display:none">
              <h3 style="margin:0 0 16px 0;color:#2d3748">🚚 Select Shipping Service</h3>
              <div id="service-options" style="width:100%;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px"></div>
            </div>

            <!-- Step 4: Addresses -->
            <div id="step-4" style="display:none">
              <h3 style="margin:0 0 16px 0;color:#2d3748">📍 Confirm Addresses</h3>
              
              <div style="margin-bottom:16px;padding:12px;background:#f0fff4;border-radius:8px;border-left:4px solid #48bb78">
                <label style="display:block;margin-bottom:10px;font-weight:600;font-size:13px;color:#2d3748">📬 Ship To (Customer Address)</label>
                <div style="display:grid;gap:8px;font-size:13px">
                  <input type="text" id="dest-name" placeholder="Customer name" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <input type="text" id="dest-street1" placeholder="Street address" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <input type="text" id="dest-street2" placeholder="Apt/Unit (optional)" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
                    <input type="text" id="dest-city" placeholder="City" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                    <input type="text" id="dest-state" placeholder="State" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <input type="text" id="dest-zip" placeholder="ZIP" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                    <input type="text" id="dest-country" placeholder="US" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  </div>
                </div>
              </div>

              <div style="padding:12px;background:#f0f4ff;border-radius:8px;border-left:4px solid #667eea">
                <label style="display:block;margin-bottom:10px;font-weight:600;font-size:13px;color:#2d3748">📦 Return Address (Your Address)</label>
                <div style="display:grid;gap:8px;font-size:13px">
                  <input type="text" id="ship-name" value="FRUITSTAND" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <input type="text" id="ship-street1" value="37-30 Review Avenue" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <input type="text" id="ship-street2" value="Ste 202" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
                    <input type="text" id="ship-city" value="Long Island City" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                    <input type="text" id="ship-state" value="NY" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                  </div>
                  <input type="text" id="ship-zip" value="11101" style="padding:8px;border:2px solid #ddd;border-radius:6px;box-sizing:border-box">
                </div>
              </div>
            </div>

            <!-- Step 5: Review & Purchase -->
            <div id="step-5" style="display:none">
              <h3 style="margin:0 0 16px 0;color:#2d3748">✅ Review & Purchase Label</h3>
              <div style="padding:16px;background:#f9fafb;border:2px solid #e2e8f0;border-radius:8px;font-size:13px;line-height:1.6;color:#2d3748">
                <div style="margin-bottom:12px">
                  <strong>Template:</strong> <span id="review-template">-</span>
                </div>
                <div style="margin-bottom:12px">
                  <strong>Dimensions:</strong> <span id="review-dimensions">-</span>
                </div>
                <div style="margin-bottom:12px">
                  <strong>Weight:</strong> <span id="review-weight">-</span> lbs
                </div>
                <div style="margin-bottom:12px;padding-top:12px;border-top:1px solid #e2e8f0">
                  <strong>Shipping Service:</strong> <span id="review-service">-</span>
                </div>
                <div style="padding-top:12px;border-top:1px solid #e2e8f0">
                  <strong>Delivery to:</strong> <span id="review-address">-</span>
                </div>
              </div>
            </div>

          </div>

          <!-- Footer with buttons -->
          <div style="padding:16px 24px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;background:#f9fafb;border-radius:0 0 12px 12px">
            <button onclick="closeLabelModal()" style="background:#e2e8f0;color:#2d3748;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.2s;white-space:nowrap">Cancel</button>
            <button id="prev-btn" onclick="previousStep()" style="background:#cbd5e0;color:#2d3748;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.2s;white-space:nowrap;display:none">← Back</button>
            <button id="next-btn" onclick="nextStep()" style="background:#667eea;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.2s;white-space:nowrap">Next →</button>
            <button id="purchase-btn" onclick="purchaseLabel()" style="background:#48bb78;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.2s;white-space:nowrap;display:none">Purchase</button>
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

        function copyTracking() {
          const trackingEl = document.getElementById('tracking');
          const trackingText = trackingEl.textContent;
          if (trackingText && trackingText !== '-') {
            navigator.clipboard.writeText(trackingText).then(() => {
              const btn = event.target;
              const originalText = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => {
                btn.textContent = originalText;
              }, 2000);
            });
          }
        }

        function load() {
          fetch('/api/orders/' + id + session)
            .then(r => r.json())
            .then(o => {
              window.currentOrder = o;
              const fulfillmentStatus = o.status || 'pending';
              const trackingNumber = o.trackingNumber || o.tracking_number;
              const labelUrl = o.labelUrl || o.label_url;
              const lifecycleStatus = (o.shippedAt || o.shipped_at)
                ? 'Shipped'
                : ((o.fulfilledAt || o.fulfilled_at || fulfillmentStatus === 'fulfilled') ? 'Fulfilled' : 'Received');

              document.getElementById('lifecycle-status').textContent = lifecycleStatus;
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
                  '<td data-label="Product">' + productName + metaHtml + '</td>' +
                  '<td data-label="Size">' + sizeText + '</td>' +
                  '<td data-label="Color">' + colorText + '</td>' +
                  '<td data-label="Qty">' + quantity + '</td>' +
                  '<td data-label="Unit">$' + unitPrice.toFixed(2) + '</td>' +
                  '<td data-label="Total">$' + totalPrice.toFixed(2) + '</td>' +
                '</tr>';
              }).join('');

              const shipBtn = document.getElementById('ship-btn');
              const fulfillBtn = document.getElementById('fulfill-btn');
              const undoBtn = document.getElementById('undo-fulfill-btn');
              const undoShipBtn = document.getElementById('undo-ship-btn');
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
                if (labelUrl) {
                  labelLink.innerHTML = \`<div class="label-actions">
                    <button onclick="downloadLabel('\${labelUrl}')" class="action-btn success">Download Label</button>
                    <button onclick="openLabelModal()" class="action-btn primary">Create New Label</button>
                    <button id="send-email-btn" onclick="sendShippingEmail()" class="action-btn info">Send Shipping Email</button>
                  </div>\`;
                } else {
                  labelLink.innerHTML = '';
                }
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
                } else {
                  undoBtn.style.display = 'none';
                }
              }

              if (undoShipBtn) {
                if (isShipped) {
                  undoShipBtn.style.display = 'block';
                  undoShipBtn.disabled = false;
                } else {
                  undoShipBtn.style.display = 'none';
                }
              }
            });
        }
        
        let currentStep = 1;
        let selectedTemplate = null;

        function openLabelModal() {
          currentStep = 1;
          document.getElementById('label-modal').style.display = 'flex';
          showStep(1);

          // Pre-populate Ship To fields from order data
          if (window.currentOrder) {
            const o = window.currentOrder;
            document.getElementById('dest-name').value = o.shipping_name || '';
            document.getElementById('dest-street1').value = o.shipping_address_line1 || '';
            document.getElementById('dest-street2').value = o.shipping_address_line2 || '';
            document.getElementById('dest-city').value = o.shipping_city || '';
            document.getElementById('dest-state').value = o.shipping_state || '';
            document.getElementById('dest-zip').value = o.shipping_postal_code || '';
            document.getElementById('dest-country').value = o.shipping_country || 'US';
          }

          // Load templates
          loadParcelTemplates();
        }

        function closeLabelModal() {
          document.getElementById('label-modal').style.display = 'none';
        }

        function showStep(step) {
          currentStep = step;
          for (let i = 1; i <= 5; i++) {
            const elem = document.getElementById('step-' + i);
            if (elem) elem.style.display = i === step ? 'block' : 'none';
          }
          
          // Update indicators
          for (let i = 1; i <= 5; i++) {
            const indicator = document.getElementById('step-indicator-' + i);
            if (indicator) {
              indicator.style.background = i <= step ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
            }
          }

          // Update button visibility
          document.getElementById('prev-btn').style.display = step > 1 ? 'block' : 'none';
          document.getElementById('next-btn').style.display = step < 5 ? 'block' : 'none';
          document.getElementById('purchase-btn').style.display = step === 5 ? 'block' : 'none';

          // Load shipping rates for step 3
          if (step === 3) {
            const length = document.getElementById('pkg-length').value || '5';
            const width = document.getElementById('pkg-width').value || '5';
            const height = document.getElementById('pkg-height').value || '5';
            const weight = document.getElementById('pkg-weight').value || '2';
            loadShippingRates(length, width, height, weight);
          }

          // Populate review for step 5
          if (step === 5) {
            populateReview();
          }
        }

        function nextStep() {
          if (currentStep === 1 && !selectedTemplate) {
            alert('Please select a template');
            return;
          }
          if (currentStep === 2) {
            const l = document.getElementById('pkg-length').value;
            const w = document.getElementById('pkg-width').value;
            const h = document.getElementById('pkg-height').value;
            const wt = document.getElementById('pkg-weight').value;
            if (!l || !w || !h || !wt) {
              alert('Please fill in all dimensions and weight');
              return;
            }
          }
          if (currentStep === 3) {
            const optionsDiv = document.getElementById('service-options');
            if (!optionsDiv.dataset.selected) {
              alert('Please select a shipping service');
              return;
            }
          }
          if (currentStep === 4) {
            const dName = document.getElementById('dest-name').value;
            const dStreet1 = document.getElementById('dest-street1').value;
            const dCity = document.getElementById('dest-city').value;
            const dState = document.getElementById('dest-state').value;
            const dZip = document.getElementById('dest-zip').value;
            const sName = document.getElementById('ship-name').value;
            const sStreet1 = document.getElementById('ship-street1').value;
            const sCity = document.getElementById('ship-city').value;
            const sState = document.getElementById('ship-state').value;
            const sZip = document.getElementById('ship-zip').value;
            if (!dName || !dStreet1 || !dCity || !dState || !dZip || !sName || !sStreet1 || !sCity || !sState || !sZip) {
              alert('Please fill in all required address fields');
              return;
            }
          }
          showStep(currentStep + 1);
        }

        function previousStep() {
          if (currentStep > 1) {
            showStep(currentStep - 1);
          }
        }

        function populateReview() {
          const tName = selectedTemplate ? selectedTemplate.name : '-';
          const l = document.getElementById('pkg-length').value;
          const w = document.getElementById('pkg-width').value;
          const h = document.getElementById('pkg-height').value;
          const wt = document.getElementById('pkg-weight').value;
          const optionsDiv = document.getElementById('service-options');
          const selectedBtn = optionsDiv.querySelector('.ship-rate-btn.selected');
          const serviceName = selectedBtn ? selectedBtn.innerText.split('\\n')[0] : '-';
          const dName = document.getElementById('dest-name').value;
          const dStreet1 = document.getElementById('dest-street1').value;
          const dCity = document.getElementById('dest-city').value;
          const dState = document.getElementById('dest-state').value;
          const dZip = document.getElementById('dest-zip').value;

          document.getElementById('review-template').innerText = tName;
          document.getElementById('review-dimensions').innerText = l + '" × ' + w + '" × ' + h + '"';
          document.getElementById('review-weight').innerText = wt;
          document.getElementById('review-service').innerText = serviceName;
          document.getElementById('review-address').innerText = dName + ', ' + dStreet1 + ', ' + dCity + ', ' + dState + ' ' + dZip;
        }

        function loadParcelTemplates() {
          const container = document.getElementById('template-buttons');
          container.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:#888">Loading templates...</div>';

          fetch('/api/parcel-templates' + session)
            .then(r => r.json())
            .then(res => {
              if (res.ok && res.templates && res.templates.length > 0) {
                let html = '';
                let orangeMailerIndex = -1;
                res.templates.forEach((t, idx) => {
                  if (t.name.toLowerCase().includes('orange mailer')) {
                    orangeMailerIndex = idx;
                  }
                  const isSelected = orangeMailerIndex === idx;
                  const borderColor = isSelected ? '#667eea' : '#e2e8f0';
                  const bgGradient = isSelected ? 'linear-gradient(135deg,#e0e7ff 0%,#f8fafc 100%)' : '#fff';
                  const boxShadow = isSelected ? '0 4px 12px #c7d2fe' : '0 1px 3px #e2e8f0';
                  const checkmark = isSelected ? '<span style="position:absolute;top:8px;right:8px;background:#667eea;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px">✓</span>' : '';
                  html += '<button type="button" onclick="selectTemplate(' + idx + ', this)" class="template-btn' + (isSelected ? ' selected' : '') + '" data-idx="' + idx + '" data-length="' + t.length + '" data-width="' + t.width + '" data-height="' + t.height + '" data-weight="' + t.weight + '" data-name="' + t.name + '" style="border:2px solid ' + borderColor + ';background:' + bgGradient + ';padding:14px 12px;border-radius:10px;cursor:pointer;text-align:center;font-size:13px;font-weight:600;transition:all 0.2s;box-shadow:' + boxShadow + ';position:relative;color:#2d3748;line-height:1.4">' + t.name + '<br/><span style="font-size:11px;color:#718096;font-weight:500">' + t.length + '" × ' + t.width + '" × ' + t.height + '"<br/>' + t.weight + ' lbs</span>' + checkmark + '</button>';
                });
                container.innerHTML = html;
                if (orangeMailerIndex !== -1) {
                  selectTemplate(orangeMailerIndex, container.children[orangeMailerIndex]);
                }
              } else {
                container.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:#e53e3e">No templates found</div>';
              }
            })
            .catch(err => {
              console.error(err);
              container.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:#e53e3e">Error loading templates</div>';
            });
        }

        function selectTemplate(idx, btn) {
          const btns = document.querySelectorAll('.template-btn');
          btns.forEach(b => {
            b.classList.remove('selected');
            b.style.borderColor = '#e2e8f0';
            b.style.background = '#fff';
            b.style.boxShadow = '0 1px 3px #e2e8f0';
            const checkmark = b.querySelector('span');
            if (checkmark && checkmark.innerText === '✓') checkmark.remove();
          });
          
          btn.classList.add('selected');
          btn.style.borderColor = '#667eea';
          btn.style.background = 'linear-gradient(135deg,#e0e7ff 0%,#f8fafc 100%)';
          btn.style.boxShadow = '0 4px 12px #c7d2fe';
          
          const checkSpan = document.createElement('span');
          checkSpan.style.cssText = 'position:absolute;top:8px;right:8px;background:#667eea;color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px';
          checkSpan.innerText = '✓';
          btn.appendChild(checkSpan);

          const length = btn.getAttribute('data-length');
          const width = btn.getAttribute('data-width');
          const height = btn.getAttribute('data-height');
          const weight = btn.getAttribute('data-weight');
          const name = btn.getAttribute('data-name');

          document.getElementById('pkg-length').value = length;
          document.getElementById('pkg-width').value = width;
          document.getElementById('pkg-height').value = height;
          document.getElementById('pkg-weight').value = weight;

          selectedTemplate = { name: name, length: length, width: width, height: height, weight: weight };
        }

        function refreshRates() {
          const length = document.getElementById('pkg-length').value || '5';
          const width = document.getElementById('pkg-width').value || '5';
          const height = document.getElementById('pkg-height').value || '5';
          const weight = document.getElementById('pkg-weight').value || '2';
          
          loadShippingRates(length, width, height, weight);
        }

        function loadShippingRates(length, width, height, weight) {
          const optionsDiv = document.getElementById('service-options');
          optionsDiv.innerHTML = '<div style="padding:16px;text-align:center;color:#888;grid-column:1/-1">Loading services...</div>';
          optionsDiv.dataset.selected = '';

          const addressFrom = {
            name: document.getElementById('ship-name').value,
            street1: document.getElementById('ship-street1').value,
            street2: document.getElementById('ship-street2').value,
            city: document.getElementById('ship-city').value,
            state: document.getElementById('ship-state').value,
            zip: document.getElementById('ship-zip').value,
            country: 'US'
          };

          const addressTo = {
            name: document.getElementById('dest-name').value,
            street1: document.getElementById('dest-street1').value,
            street2: document.getElementById('dest-street2').value,
            city: document.getElementById('dest-city').value,
            state: document.getElementById('dest-state').value,
            zip: document.getElementById('dest-zip').value,
            country: document.getElementById('dest-country').value || 'US'
          };

          console.log('Loading rates with:', { length, width, height, weight, addressFrom, addressTo });

          fetch('/api/orders/' + id + '/shipping-rates' + session, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ length, width, height, weight, addressFrom, addressTo })
          })
            .then(r => {
              console.log('Response status:', r.status);
              return r.json();
            })
            .then(res => {
              console.log('Rates response:', res);
              if (res.ok && res.rates && res.rates.length > 0) {
                const grouped = {};
                res.rates.forEach(rate => {
                  const provider = rate.provider || 'Other';
                  if (!grouped[provider]) grouped[provider] = [];
                  grouped[provider].push(rate);
                });

                const defaultRateId = res.defaultRateId;
                let selectedRateId = defaultRateId || (res.rates[0] && res.rates[0].object_id);
                optionsDiv.dataset.selected = selectedRateId || '';

                let html = '';
                const providers = Object.keys(grouped).sort();
                providers.forEach(provider => {
                  html += '<div style="border:2px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff">';
                  html += '<div style="font-weight:700;font-size:15px;margin-bottom:12px;color:#374151;border-bottom:2px solid #e2e8f0;padding-bottom:10px;text-align:center">' + provider + '</div>';
                  html += '<div style="display:flex;flex-direction:column;gap:10px;">';
                  grouped[provider].forEach(rate => {
                    const isSelected = rate.object_id === selectedRateId;
                    const serviceName = rate.servicelevel.name;
                    const amount = parseFloat(rate.amount).toFixed(2);
                    const days = rate.estimated_days || '?';
                    const buttonClass = isSelected ? 'ship-rate-btn selected' : 'ship-rate-btn';
                    const borderColor = isSelected ? '#2563eb' : '#e2e8f0';
                    const bgGradient = isSelected ? 'linear-gradient(90deg,#e0e7ff 60%,#f8fafc 100%)' : '#fff';
                    const boxShadow = isSelected ? '0 2px 8px #c7d2fe' : '0 1px 3px #e2e8f0';
                    const checkmark = isSelected ? '<span style="position:absolute;top:8px;right:10px;color:#2563eb;font-size:16px">✓</span>' : '';
                    html += '<button type="button" class="' + buttonClass + '" data-rate-id="' + rate.object_id + '" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 14px;border:2px solid ' + borderColor + ';border-radius:10px;background:' + bgGradient + ';color:#222;font-size:13px;cursor:pointer;transition:all 0.18s;font-weight:600;box-shadow:' + boxShadow + ';outline:none;position:relative;white-space:normal;text-align:center;">' + serviceName + '<span style="color:#667eea;font-weight:600;font-size:14px">$' + amount + '</span><span style="color:#718096;font-size:12px">' + days + ' days</span>' + checkmark + '</button>';
                  });
                  html += '</div></div>';
                });
                optionsDiv.innerHTML = html;

                Array.from(optionsDiv.querySelectorAll('.ship-rate-btn')).forEach(btn => {
                  btn.addEventListener('click', function() {
                    Array.from(optionsDiv.querySelectorAll('.ship-rate-btn')).forEach(b => b.classList.remove('selected'));
                    this.classList.add('selected');
                    optionsDiv.dataset.selected = this.getAttribute('data-rate-id');
                  });
                });
              } else {
                const errorMsg = res.error || 'No rates available';
                console.error('Rates error:', errorMsg);
                optionsDiv.innerHTML = '<div style="padding:16px;text-align:center;color:#e53e3e;font-weight:600;grid-column:1/-1">Error: ' + errorMsg + '</div>';
              }
            })
            .catch(err => {
              console.error('Fetch error:', err);
              optionsDiv.innerHTML = '<div style="padding:16px;text-align:center;color:#e53e3e;font-weight:600;grid-column:1/-1">Error: ' + (err.message || 'Failed to load') + '</div>';
            });
        }

        function purchaseLabel() {
          const optionsDiv = document.getElementById('service-options');
          const rateId = optionsDiv.dataset.selected;
          if (!rateId) {
            alert('Please select a shipping service');
            return;
          }

          const btn = document.getElementById('purchase-btn');
          btn.disabled = true;
          btn.textContent = 'Purchasing...';

          const shipData = {
            rateId,
            labelFileType: 'PDF_4x6',
            addressFrom: {
              name: document.getElementById('ship-name').value,
              street1: document.getElementById('ship-street1').value,
              street2: document.getElementById('ship-street2').value,
              city: document.getElementById('ship-city').value,
              state: document.getElementById('ship-state').value,
              zip: document.getElementById('ship-zip').value
            }
          };

          fetch('/api/orders/' + id + '/purchase-label' + session, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shipData)
          })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                closeLabelModal();
                document.getElementById('tracking').textContent = res.trackingNumber;
                document.getElementById('label-link').innerHTML = \`<div class="label-actions">
                  <button onclick="downloadLabel('\${res.labelUrl}')" class="action-btn success">Download Label</button>
                  <button onclick="openLabelModal()" class="action-btn primary">Create New Label</button>
                  <button id="send-email-btn" onclick="sendShippingEmail()" class="action-btn info">Send Shipping Email</button>
                </div>\`;
                load();
              } else {
                const details = res.details ? ' - ' + JSON.stringify(res.details) : '';
                alert('Error: ' + (res.error || 'Failed') + details);
                btn.disabled = false;
                btn.textContent = 'Purchase Label';
              }
            })
            .catch(err => {
              console.error(err);
              alert('Error: ' + err.message);
              btn.disabled = false;
              btn.textContent = 'Purchase Label';
            });
        }

        function sendShippingEmail() {
          const btn = document.getElementById('send-email-btn');
          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
          }

          fetch('/api/orders/' + id + '/send-shipping-email' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                alert('Shipping email sent');
              } else {
                const details = res.details ? ' - ' + JSON.stringify(res.details) : '';
                alert('Error: ' + (res.error || 'Failed') + details);
              }
            })
            .catch(err => {
              console.error(err);
              alert('Error: ' + err.message);
            })
            .finally(() => {
              if (btn) {
                btn.disabled = false;
                btn.textContent = 'Send Shipping Email';
              }
            });
        }

        function downloadLabel(labelUrl) {
          if (!labelUrl) return;
          // Use the server endpoint to download (better CORS handling and forced download)
          const orderId = window.location.pathname.split('/').pop();
          const link = document.createElement('a');
          link.href = '/api/orders/' + orderId + '/download-label';
          link.download = 'shipping-label.pdf';
          document.body.appendChild(link);
          link.click();
          link.remove();
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
                document.getElementById('label-link').innerHTML = \`<div class="label-actions">
                  <button onclick="downloadLabel('\${res.labelUrl}')" class="action-btn success">Download Label</button>
                  <button onclick="openLabelModal()" class="action-btn primary">Create New Label</button>
                  <button id="send-email-btn" onclick="sendShippingEmail()" class="action-btn info">Send Shipping Email</button>
                </div>\`;
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
            })
            .finally(() => {
              if (btn && btn.style.display !== 'none') {
                btn.disabled = false;
                btn.textContent = 'Mark as Fulfilled';
              }
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
                btn.textContent = 'Remove Fulfilled';
              }
            })
            .catch(() => {
              alert('Unable to undo fulfillment');
              btn.disabled = false;
              btn.textContent = 'Remove Fulfilled';
            })
            .finally(() => {
              if (btn && btn.style.display !== 'none') {
                btn.disabled = false;
                btn.textContent = 'Remove Fulfilled';
              }
            });
        }

        function undoShip() {
          const btn = document.getElementById('undo-ship-btn');
          if (!btn) return;
          btn.disabled = true;
          btn.textContent = 'Reverting...';

          fetch('/api/orders/' + id + '/unship' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.ok) {
                load();
              } else {
                alert('Error: ' + (res.error || 'Failed'));
                btn.disabled = false;
                btn.textContent = 'Remove Shipped';
              }
            })
            .catch(() => {
              alert('Unable to remove shipped status');
              btn.disabled = false;
              btn.textContent = 'Remove Shipped';
            })
            .finally(() => {
              if (btn && btn.style.display !== 'none') {
                btn.disabled = false;
                btn.textContent = 'Remove Shipped';
              }
            });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
