export function generateInventoryPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Inventory & Stock Management</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
        .inventory-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .inventory-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .card-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .stock-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .stock-item:last-child { border-bottom: none; }
        .low-stock { color: #dc3545; font-weight: bold; }
        .in-stock { color: #28a745; font-weight: bold; }
        .out-stock { color: #6c757d; font-weight: bold; }
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
