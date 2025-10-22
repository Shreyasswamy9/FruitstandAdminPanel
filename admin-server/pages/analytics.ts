export function generateAnalyticsPage(req: any) {
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
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📈 Analytics Dashboard</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          <button class="refresh-btn" onclick="refreshData()">Refresh Data</button>
        </div>
      </div>
      
      <div class="main-content">
        <!-- Loading overlay -->
        <div id="loading" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; color: white;">
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
              <span class="metric-value" id="gtm-sessions">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Views:</span>
              <span class="metric-value" id="gtm-pageviews">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Events Fired:</span>
              <span class="metric-value" id="gtm-events">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Conversion Rate:</span>
              <span class="metric-value" id="gtm-conversion">Loading...</span>
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
            </
              <span class="metric-label">Open Graph Tags:</span>
              <span class="metric-value">Complete ✓</span>
            </div>
            <div class="metric">
              <span class="metric-label">Twitter Cards:</span>
              <span class="metric-value">Configured ✓</span>
            </div>
            <div class="metric">
              <span class="metric-label">Schema Markup:</span>
              <span class="metric-value">Product + Organization</span>
            </div>
            <div class="metric">
              <span class="metric-label">Page Speed Score:</span>
              <span class="metric-value">89/100 <span class="metric-change positive">Good</span></span>
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
              <tbody>
                <tr>
                  <td>Page View</td>
                  <td>8,634</td>
                  <td>856</td>
                  <td>9,490</td>
                </tr>
                <tr>
                  <td>Add to Cart</td>
                  <td>342</td>
                  <td>127</td>
                  <td>469</td>
                </tr>
                <tr>
                  <td>Begin Checkout</td>
                  <td>89</td>
                  <td>34</td>
                  <td>123</td>
                </tr>
                <tr>
                  <td>Purchase</td>
                  <td>67</td>
                  <td>23</td>
                  <td>90</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Third-party Integrations Card -->
          <div class="analytics-card">
            <div class="card-title">
              🔌 Active Integrations
            </div>
            <ul class="integration-list">
              <li>
                Google Analytics 4
                <span class="pixel-status active">Active</span>
              </li>
              <li>
                Facebook Pixel
                <span class="pixel-status active">Active</span>
              </li>
              <li>
                Google Tag Manager
                <span class="pixel-status active">Active</span>
              </li>
              <li>
                Hotjar Heatmaps
                <span class="pixel-status active">Active</span>
              </li>
              <li>
                TikTok Pixel
                <span class="pixel-status inactive">Inactive</span>
              </li>
              <li>
                Pinterest Tag
                <span class="pixel-status inactive">Inactive</span>
              </li>
            </ul>
          </div>

          <!-- Real-time Data Card -->
          <div class="analytics-card">
            <div class="card-title">
              ⚡ Real-time Data
            </div>
            <div class="metric">
              <span class="metric-label">Active Users Now:</span>
              <span class="metric-value">27</span>
            </div>
            <div class="metric">
              <span class="metric-label">Top Source:</span>
              <span class="metric-value">Organic Search (45%)</span>
            </div>
            <div class="metric">
              <span class="metric-label">Top Page:</span>
              <span class="metric-value">/products/summer-collection</span>
            </div>
            <div class="metric">
              <span class="metric-label">Conversions Today:</span>
              <span class="metric-value">12 purchases</span>
            </div>
            <div class="metric">
              <span class="metric-label">Revenue Today:</span>
              <span class="metric-value">$1,456.89</span>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        function refreshData() {
          // Simulate data refresh
          alert('Refreshing analytics data... This would fetch latest data from Google Analytics and Facebook Pixel APIs.');
          // In a real implementation, this would make API calls to:
          // - Google Analytics Reporting API
          // - Facebook Marketing API
          // - Your own tracking endpoints
        }
      </script>
    </body>
    </html>
  `;
}
