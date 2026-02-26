import axios from 'axios';

export function registerAnalyticsRoutes(app: any, { requireAuth }: any) {
  // Page
  app.get('/analytics', requireAuth, (req: any, res: any) => {
    res.send(generateAnalyticsPage(req));
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>PostHog Analytics Dashboard</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main-content { padding: 16px; max-width: 900px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .analytics-card { background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px; }
        .card-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 15px; }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #666; }
        .metric-value { font-weight: bold; color: #333; }
        .refresh-btn { background: #28a745; color: white; padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; }
        .refresh-btn:active { opacity: 0.85; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main-content { padding: 12px; }
          .analytics-card { padding: 12px; }
          .card-title { font-size: 16px; }
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <div class="header">
        <h1>🦔 PostHog Analytics Dashboard</h1>
        <div>
          <a href="/dashboard${sessionSuffix}" class="back-btn">Back to Dashboard</a>
          <button class="refresh-btn" onclick="refreshData()">Refresh Data</button>
        </div>
      </div>
      <div class="main-content">
        <div class="analytics-card">
          <div class="card-title">PostHog Metrics (Last 24h)</div>
          <div class="metric">
            <span class="metric-label">Project ID:</span>
            <span class="metric-value" id="posthog-project-id">Loading...</span>
          </div>
          <div class="metric">
            <span class="metric-label">Total Events:</span>
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
        <div class="analytics-card">
          <div class="card-title">Traffic & Activity Graphs</div>
          <canvas id="posthog-traffic-chart" height="120"></canvas>
        </div>
      </div>
      <script>
        async function refreshData() {
          try {
            const r = await fetch('/api/analytics/posthog${sessionSuffix}');
            const d = await r.json();
            document.getElementById('posthog-project-id').textContent = d.projectId || 'Not configured';
            document.getElementById('posthog-events').textContent = d.events24h ?? 'N/A';
            document.getElementById('posthog-pageviews').textContent = d.pageviews24h ?? 'N/A';
            document.getElementById('posthog-persons').textContent = d.persons24h ?? 'N/A';

            // Example chart data (replace with real time series from PostHog API if available)
            const chartData = {
              labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
              datasets: [
                {
                  label: 'Page Views',
                  data: [12, 19, 3, 5, 2, 3, d.pageviews24h ?? 0],
                  backgroundColor: 'rgba(102, 126, 234, 0.2)',
                  borderColor: 'rgba(102, 126, 234, 1)',
                  borderWidth: 2,
                  fill: true
                },
                {
                  label: 'Total Events',
                  data: [10, 15, 6, 8, 4, 7, d.events24h ?? 0],
                  backgroundColor: 'rgba(40, 167, 69, 0.2)',
                  borderColor: 'rgba(40, 167, 69, 1)',
                  borderWidth: 2,
                  fill: true
                }
              ]
            };
            const ctx = document.getElementById('posthog-traffic-chart').getContext('2d');
            if (window.posthogChart) window.posthogChart.destroy();
            window.posthogChart = new Chart(ctx, {
              type: 'line',
              data: chartData,
              options: {
                responsive: true,
                plugins: {
                  legend: { position: 'top' },
                  title: { display: true, text: 'Traffic & Events (Last 24h)' }
                }
              }
            });
          } catch (e) {
            // Keep defaults
          }
        }
        refreshData();
      </script>
    </body>
    </html>
  `;
}
