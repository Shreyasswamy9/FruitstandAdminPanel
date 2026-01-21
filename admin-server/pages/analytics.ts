import axios from 'axios';

export function registerAnalyticsRoutes(app: any, { requireAuth }: any) {
  // Page
  app.get('/analytics', requireAuth, (req: any, res: any) => {
    res.send(generateAnalyticsPage(req));
  });

  // GTM status (env-only)
  app.get('/api/analytics/gtm', requireAuth, async (_req: any, res: any) => {
    try {
      const containerId = process.env.GTM_CONTAINER_ID || null;
      const status = containerId ? 'active' : 'inactive';
      // Optional TODO: call GTM API if you add OAuth credentials
      res.json({
        status,
        containerId,
        sessions7d: null,
        pageViews: null,
        events: null,
        conversionRate: null
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch GTM status' });
    }
  });

  // Meta Pixel basic info + rough event stats (best-effort)
  app.get('/api/analytics/meta', requireAuth, async (_req: any, res: any) => {
    const pixelId = process.env.META_PIXEL_ID;
    const token = process.env.META_ACCESS_TOKEN;
    if (!pixelId || !token) {
      return res.json({
        status: 'inactive',
        pixelId: pixelId || null,
        name: null,
        events24h: null,
        pageviews24h: null,
        addToCart24h: null,
        purchases24h: null,
        revenue24h: null
      });
    }
    try {
      // Basic pixel info
      const info = await axios.get(`https://graph.facebook.com/v18.0/${encodeURIComponent(pixelId)}`, {
        params: { fields: 'id,name,creation_time', access_token: token }
      });

      // Best-effort stats (endpoint availability depends on Ad account setup)
      let events24h = null;
      let pageviews24h = null;
      let purchases24h = null;
      let addToCart24h = null;
      let revenue24h = null;

      try {
        const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        const until = Math.floor(Date.now() / 1000);
        // Not all apps have access to stats; catch and ignore failures gracefully.
        const statsResp = await axios.get(`https://graph.facebook.com/v18.0/${encodeURIComponent(pixelId)}/stats`, {
          params: {
            aggregateBy: 'event',
            since,
            until,
            access_token: token
          }
        });
        const rows = Array.isArray(statsResp.data?.data) ? statsResp.data.data : [];
        const findCount = (eventName: string) => {
          const row = rows.find((r: any) => r?.event === eventName);
          return (row && typeof row?.count === 'number') ? row.count : null;
        };
        events24h = rows.reduce((sum: number, r: any) => sum + (Number(r?.count) || 0), 0) || null;
        pageviews24h = findCount('PageView');
        addToCart24h = findCount('AddToCart');
        purchases24h = findCount('Purchase');
        // Revenue may not be exposed here; leave null unless you map custom metrics.
        revenue24h = null;
      } catch {
        // Ignore if not permitted; keep nulls
      }

      res.json({
        status: 'active',
        pixelId: info.data?.id || pixelId,
        name: info.data?.name || null,
        events24h,
        pageviews24h,
        addToCart24h,
        purchases24h,
        revenue24h
      });
    } catch (e) {
      res.json({
        status: 'inactive',
        pixelId: pixelId,
        name: null,
        events24h: null,
        pageviews24h: null,
        addToCart24h: null,
        purchases24h: null,
        revenue24h: null
      });
    }
  });

  // TikTok Pixel status (env-only, best-effort)
  app.get('/api/analytics/tiktok', requireAuth, async (_req: any, res: any) => {
    const pixelId = process.env.TIKTOK_PIXEL_ID || null;
    const token = process.env.TIKTOK_ACCESS_TOKEN || null;
    res.json({
      status: pixelId ? 'active' : 'inactive',
      pixelId,
      events24h: null,
      pageviews24h: null,
      addToCart24h: null,
      purchases24h: null
    });
  });

  // PostHog status & basic metrics
  app.get('/api/analytics/posthog', requireAuth, async (_req: any, res: any) => {
    const apiKey = process.env.POSTHOG_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

    if (!apiKey || !projectId) {
      return res.json({
        status: 'inactive',
        projectId: projectId || null,
        events24h: null,
        pageviews24h: null,
        persons24h: null
      });
    }

    try {
      // Query events in the last 24h using HogQL or Trends API
      // For simplicity and robustness, we use the Trends API via the Query endpoint
      const response = await axios.post(
        `${host}/api/projects/${projectId}/query/`,
        {
          query: {
            kind: 'TrendsQuery',
            date_from: '-24h',
            series: [
              { kind: 'EventsQuery', event: '$pageview', name: 'Pageviews', math: 'total' },
              { kind: 'EventsQuery', event: null, name: 'Total Events', math: 'total' },
              { kind: 'EventsQuery', event: null, name: 'Unique Users', math: 'dau' }
            ]
          }
        },
        {
          headers: { Authorization: `Bearer ${apiKey}` }
        }
      );

      const results = response.data?.results || [];

      res.json({
        status: 'active',
        projectId,
        pageviews24h: results[0]?.count || 0,
        events24h: results[1]?.count || 0,
        persons24h: results[2]?.count || 0
      });
    } catch (e: any) {
      console.error('PostHog API Error:', e.response?.data || e.message);
      res.json({
        status: 'inactive',
        projectId,
        events24h: null,
        pageviews24h: null,
        persons24h: null
      });
    }
  });
}

export function generateAnalyticsPage(req: any) {
  const sessionSuffix = req?.query?.session ? `?session=${encodeURIComponent(String(req.query.session))}` : '';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Analytics Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
        .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .analytics-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .card-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; }
        .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #666; }
        .metric-value { font-weight: bold; color: #333; }
        .metric-change { font-size: 12px; padding: 2px 6px; border-radius: 3px; }
        .positive { background: #d4edda; color: #155724; }
        .negative { background: #f8d7da; color: #721c24; }
        .refresh-btn { background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .pixel-status { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .active { background: #d4edda; color: #155724; }
        .inactive { background: #f8d7da; color: #721c24; }
        .integration-list { list-style: none; padding: 0; }
        .integration-list li { padding: 8px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .conversion-table { width: 100%; margin-top: 15px; }
        .conversion-table th, .conversion-table td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
        .conversion-table th { background: #f8f9fa; font-weight: bold; }
        .muted { color: #6c757d; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📈 Analytics Dashboard</h1>
        <div>
          <a href="/dashboard${sessionSuffix}" class="back-btn">Back to Dashboard</a>
          <button class="refresh-btn" onclick="refreshData()">Refresh Data</button>
        </div>
      </div>
      
      <div class="main-content">
        <!-- Loading overlay -->
        <div id="loading" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; color: white;">
          <div>Loading analytics data...</div>
        </div>

        <div class="analytics-grid">
          <!-- Google Tag Manager Card -->
          <div class="analytics-card">
            <div class="card-title">
              📊 Google Tag Manager
              <span class="pixel-status" id="gtm-status">Checking...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Container ID:</span>
              <span class="metric-value" id="gtm-container">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Sessions (Last 7 days):</span>
              <span class="metric-value muted" id="gtm-sessions">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Views:</span>
              <span class="metric-value muted" id="gtm-pageviews">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Events Fired:</span>
              <span class="metric-value muted" id="gtm-events">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Conversion Rate:</span>
              <span class="metric-value muted" id="gtm-conversion">N/A</span>
            </div>
          </div>

          <!-- Meta/Facebook Pixel Card -->
          <div class="analytics-card">
            <div class="card-title">
              📘 Meta Pixel (Facebook)
              <span class="pixel-status" id="meta-status">Checking...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Pixel ID:</span>
              <span class="metric-value" id="meta-pixel-id">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Events (24h):</span>
              <span class="metric-value" id="meta-events">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Views:</span>
              <span class="metric-value" id="meta-pageviews">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Add to Cart:</span>
              <span class="metric-value" id="meta-addtocart">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Purchase Events:</span>
              <span class="metric-value" id="meta-purchases">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Revenue Tracked:</span>
              <span class="metric-value" id="meta-revenue">Loading...</span>
            </div>
          </div>

          <!-- TikTok Pixel Card -->
          <div class="analytics-card">
            <div class="card-title">
              🎵 TikTok Pixel
              <span class="pixel-status" id="tiktok-status">Checking...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Pixel ID:</span>
              <span class="metric-value" id="tiktok-pixel-id">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Events (24h):</span>
              <span class="metric-value" id="tiktok-events">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Views:</span>
              <span class="metric-value" id="tiktok-pageviews">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Add to Cart:</span>
              <span class="metric-value" id="tiktok-addtocart">N/A</span>
            </div>
            <div class="metric">
              <span class="metric-label">Purchase Events:</span>
              <span class="metric-value" id="tiktok-purchases">N/A</span>
            </div>
          </div>

          <!-- PostHog Card -->
          <div class="analytics-card">
            <div class="card-title">
              🦔 PostHog Analytics
              <span class="pixel-status" id="posthog-status">Checking...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Project ID:</span>
              <span class="metric-value" id="posthog-project-id">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Events (24h):</span>
              <span class="metric-value" id="posthog-events">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Views:</span>
              <span class="metric-value" id="posthog-pageviews">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Unique Users:</span>
              <span class="metric-value" id="posthog-persons">Loading...</span>
            </div>
          </div>

          <!-- Conversion Tracking Card -->
          <div class="analytics-card">
            <div class="card-title">
              🎯 Conversion Tracking
            </div>
            <table class="conversion-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>GA4</th>
                  <th>Facebook</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody id="conv-table">
                <tr><td colspan="4" class="muted">Live totals update with Meta data when available.</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Active Integrations Card -->
          <div class="analytics-card">
            <div class="card-title">
              🔌 Active Integrations
            </div>
            <ul class="integration-list">
              <li>
                Google Tag Manager
                <span class="pixel-status" id="gtm-active-pill">Checking...</span>
              </li>
              <li>
                Facebook Pixel
                <span class="pixel-status" id="meta-active-pill">Checking...</span>
              </li>
              <li>
                TikTok Pixel
                <span class="pixel-status" id="tiktok-active-pill">Checking...</span>
              </li>
              <li>
                PostHog Analytics
                <span class="pixel-status" id="posthog-active-pill">Checking...</span>
              </li>
            </ul>
            <div class="muted">Configure .env: GTM_CONTAINER_ID, META_PIXEL_ID, META_ACCESS_TOKEN, TIKTOK_PIXEL_ID, TIKTOK_ACCESS_TOKEN, POSTHOG_API_KEY, POSTHOG_PROJECT_ID</div>
          </div>
        </div>
      </div>
      
      <script>
        function setStatus(elId, status) {
          const el = document.getElementById(elId);
          if (!el) return;
          el.textContent = status === 'active' ? 'Active' : 'Inactive';
          el.classList.remove('active', 'inactive');
          el.classList.add(status === 'active' ? 'active' : 'inactive');
        }

        async function refreshData() {
          document.getElementById('loading').style.display = 'flex';
          try {
            await Promise.all([loadGTM(), loadMeta(), loadTikTok(), loadPostHog()]);
          } finally {
            document.getElementById('loading').style.display = 'none';
          }
        }

        async function loadGTM() {
          const r = await fetch('/api/analytics/gtm${sessionSuffix}');
          const d = await r.json();
          setStatus('gtm-status', d.status);
          setStatus('gtm-active-pill', d.status);
          document.getElementById('gtm-container').textContent = d.containerId || 'Not configured';
          document.getElementById('gtm-sessions').textContent = d.sessions7d ?? 'N/A';
          document.getElementById('gtm-pageviews').textContent = d.pageViews ?? 'N/A';
          document.getElementById('gtm-events').textContent = d.events ?? 'N/A';
          document.getElementById('gtm-conversion').textContent = d.conversionRate ?? 'N/A';
        }

        async function loadMeta() {
          try {
            const r = await fetch('/api/analytics/meta${sessionSuffix}');
            const d = await r.json();
            setStatus('meta-status', d.status);
            setStatus('meta-active-pill', d.status);
            document.getElementById('meta-pixel-id').textContent = d.pixelId || 'Not configured';
            document.getElementById('meta-events').textContent = d.events24h ?? 'N/A';
            document.getElementById('meta-pageviews').textContent = d.pageviews24h ?? 'N/A';
            document.getElementById('meta-addtocart').textContent = d.addToCart24h ?? 'N/A';
            document.getElementById('meta-purchases').textContent = d.purchases24h ?? 'N/A';
            document.getElementById('meta-revenue').textContent = d.revenue24h ?? 'N/A';

            // Update simple conversion table using Meta only (if present)
            const conv = document.getElementById('conv-table');
            const ga4 = 'N/A';
            const fbPV = d.pageviews24h ?? 0;
            const fbATC = d.addToCart24h ?? 0;
            const fbPUR = d.purchases24h ?? 0;
            conv.innerHTML =
              '<tr><td>Page View</td><td>' + ga4 + '</td><td>' + fbPV + '</td><td>' + (ga4 === 'N/A' ? fbPV : '—') + '</td></tr>' +
              '<tr><td>Add to Cart</td><td>' + ga4 + '</td><td>' + fbATC + '</td><td>' + (ga4 === 'N/A' ? fbATC : '—') + '</td></tr>' +
              '<tr><td>Purchase</td><td>' + ga4 + '</td><td>' + fbPUR + '</td><td>' + (ga4 === 'N/A' ? fbPUR : '—') + '</td></tr>';
          } catch (e) {
            // Keep defaults
          }
        }

        async function loadTikTok() {
          const r = await fetch('/api/analytics/tiktok${sessionSuffix}');
          const d = await r.json();
          setStatus('tiktok-status', d.status);
          setStatus('tiktok-active-pill', d.status);
          document.getElementById('tiktok-pixel-id').textContent = d.pixelId || 'Not configured';
          // Metrics remain N/A unless you wire TikTok Business API with access token
        }

        async function loadPostHog() {
          try {
            const r = await fetch('/api/analytics/posthog${sessionSuffix}');
            const d = await r.json();
            setStatus('posthog-status', d.status);
            setStatus('posthog-active-pill', d.status);
            document.getElementById('posthog-project-id').textContent = d.projectId || 'Not configured';
            document.getElementById('posthog-events').textContent = d.events24h ?? 'N/A';
            document.getElementById('posthog-pageviews').textContent = d.pageviews24h ?? 'N/A';
            document.getElementById('posthog-persons').textContent = d.persons24h ?? 'N/A';
          } catch (e) {
            // Keep defaults
          }
        }

        // Initial load
        refreshData();
      </script>
    </body>
    </html>
  `;
}
