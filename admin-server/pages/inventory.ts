export function registerInventoryRoutes(app: any, { requireAuth }: any) {
  app.get('/inventory', requireAuth, (req: any, res: any) => {
    res.send(generateInventoryPage(req));
  });
}

export function generateInventoryPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Inventory & Stock Management</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main-content { padding: 16px; max-width: 1400px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .inventory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }
        .inventory-card { background: white; padding: 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .card-title { font-size: 16px; font-weight: bold; color: #333; margin-bottom: 12px; }
        .stock-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        .stock-item:last-child { border-bottom: none; }
        .low-stock { color: #dc3545; font-weight: bold; }
        .in-stock { color: #28a745; font-weight: bold; }
        .out-stock { color: #6c757d; font-weight: bold; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main-content { padding: 12px; }
          .back-btn { padding: 10px 14px; font-size: 13px; }
          .inventory-grid { gap: 12px; grid-template-columns: 1fr; }
          .inventory-card { padding: 12px; }
          .card-title { font-size: 14px; }
          .stock-item { font-size: 13px; padding: 8px 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Inventory & Stock Management</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
      </div>
      
      <div class="main-content">
        <div class="inventory-grid">
          <div class="inventory-card">
            <div class="card-title">Stock Levels by Category</div>
            <div class="stock-item">
              <span>Shirts</span>
              <span class="in-stock">245 items</span>
            </div>
            <div class="stock-item">
              <span>Pants</span>
              <span class="low-stock">12 items</span>
            </div>
            <div class="stock-item">
              <span>Dresses</span>
              <span class="in-stock">89 items</span>
            </div>
            <div class="stock-item">
              <span>Shoes</span>
              <span class="out-stock">0 items</span>
            </div>
          </div>
          
          <div class="inventory-card">
            <div class="card-title">Low Stock Alerts</div>
            <div class="stock-item">
              <span>Summer Dress - Size M</span>
              <span class="low-stock">3 left</span>
            </div>
            <div class="stock-item">
              <span>Blue Jeans - Size L</span>
              <span class="low-stock">1 left</span>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
