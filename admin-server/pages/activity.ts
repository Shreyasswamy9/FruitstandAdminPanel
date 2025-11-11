export function registerActivityRoutes(app: any, { prisma, logActivity, requireAdmin }: any) {
  app.get('/activity', requireAdmin, async (req: any, res: any) => {
    const model = (prisma as any).activityLog;
    const activities = model ? await model.findMany({ orderBy: { timestamp: 'desc' }, take: 500 }) : [];
    res.send(generateActivityPage(req, activities));
  });

  app.get('/admin/sessions', requireAdmin, (req: any, res: any) => {
    // This endpoint moved from server.ts to keep admin tooling with activity
    res.json({ message: 'Implement session listing here if needed.' });
  });
}

export function generateActivityPage(req: any, activities: any[]) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Activity Tracking (Admin)</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #dc3545; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn, .refresh-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
        .refresh-btn { background: #28a745; }
        .filters { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .filter-group { display: inline-block; margin-right: 20px; }
        .filter-group select, .filter-group input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .activity-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .activity-table { width: 100%; }
        .activity-table th, .activity-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        .activity-table th { background: #f8f9fa; font-weight: bold; }
        .action-login { color: #28a745; font-weight: bold; }
        .action-page { color: #17a2b8; }
        .action-create { color: #007bff; font-weight: bold; }
        .action-update { color: #ffc107; font-weight: bold; }
        .action-delete { color: #dc3545; font-weight: bold; }
        .action-failed { color: #dc3545; }
        .details { font-size: 12px; color: #666; max-width: 300px; word-wrap: break-word; }
        .timestamp { white-space: nowrap; }
        .user-filter { background: #e9ecef; padding: 4px 8px; border-radius: 12px; font-size: 12px; }
        .admin-badge { background: #fff; color: #dc3545; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .admin-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Activity Tracking <span class="admin-badge">ADMIN ONLY</span></h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="admin-warning">
          <strong>⚠️ Admin Access:</strong> This page contains sensitive user activity data. Only authorized administrators should have access to this information.
        </div>
        
        <!-- Filters -->
        <div class="filters">
          <div class="filter-group">
            <label>User:</label>
            <select id="userFilter" onchange="filterActivities()">
              <option value="">All Users</option>
              ${[...new Set(activities.map(a => a.userEmail))].map(email => 
                `<option value="${email}">${email}</option>`
              ).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label>Action:</label>
            <select id="actionFilter" onchange="filterActivities()">
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="PAGE_ACCESS">Page Access</option>
              <option value="ORDER_CREATE">Order Created</option>
              <option value="ORDER_UPDATE">Order Updated</option>
              <option value="ORDER_DELETE">Order Deleted</option>
              <option value="PRODUCT_CREATE">Product Created</option>
              <option value="PRODUCT_UPDATE">Product Updated</option>
              <option value="PRODUCT_DELETE">Product Deleted</option>
              <option value="FULFILLMENT_UPDATE">Fulfillment Updated</option>
            </select>
          </div>
          <div class="filter-group">
            <label>Date:</label>
            <input type="date" id="dateFilter" onchange="filterActivities()">
          </div>
        </div>

        <div class="activity-container">
          <table class="activity-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody id="activityTableBody">
              ${activities.map(activity => {
                let details: any = {};
                try {
                  details = typeof activity.details === 'string'
                    ? JSON.parse(activity.details || '{}')
                    : (activity.details || {});
                } catch (e) {
                  details = {};
                }
                const actionClass = activity.action.toLowerCase().replace(/_/g, '-');
                return `
                  <tr class="activity-row" data-user="${activity.userEmail}" data-action="${activity.action}" data-date="${new Date(activity.timestamp).toISOString().split('T')[0]}">
                    <td class="timestamp">${new Date(activity.timestamp).toLocaleString()}</td>
                    <td>
                      <span class="user-filter">${activity.userEmail}</span>
                    </td>
                    <td>
                      <span class="action-${actionClass}">${activity.action.replace('_', ' ')}</span>
                    </td>
                    <td class="details">
                      ${formatActivityDetails(activity.action, details)}
                    </td>
                    <td>${activity.ipAddress}</td>
                  </tr>
                `;
              }).join('')}
              ${activities.length === 0 ? '<tr><td colspan="5" style="text-align: center; padding: 30px;">No activities found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        function formatActivityDetails(action, details) {
          switch(action) {
            case 'LOGIN':
              return \`Method: \${details.method || 'unknown'}\`;
            case 'PAGE_ACCESS':
              return \`Page: \${details.page || 'unknown'}\`;
            case 'ORDER_CREATE':
              return \`Total: $\${details.total || '0'}, Status: \${details.status || 'unknown'}\`;
            case 'ORDER_UPDATE':
              return \`Order ID: \${details.orderId || 'unknown'}, Field: \${details.field || 'unknown'}\`;
            case 'PRODUCT_CREATE':
              return \`Product: \${details.name || 'unknown'}, Price: $\${details.price || '0'}\`;
            case 'FULFILLMENT_UPDATE':
              return \`Order: \${details.orderId || 'unknown'}, Status: \${details.newStatus || 'unknown'}\`;
            default:
              return JSON.stringify(details).substring(0, 100) + (JSON.stringify(details).length > 100 ? '...' : '');
          }
        }
        
        function filterActivities() {
          const userFilter = document.getElementById('userFilter').value;
          const actionFilter = document.getElementById('actionFilter').value;
          const dateFilter = document.getElementById('dateFilter').value;
          
          const rows = document.querySelectorAll('.activity-row');
          
          rows.forEach(row => {
            let show = true;
            
            if (userFilter && row.dataset.user !== userFilter) {
              show = false;
            }
            
            if (actionFilter && row.dataset.action !== actionFilter) {
              show = false;
            }
            
            if (dateFilter && row.dataset.date !== dateFilter) {
              show = false;
            }
            
            row.style.display = show ? '' : 'none';
          });
        }
      </script>
    </body>
    </html>
  `;
}

function formatActivityDetails(action: string, details: any): string {
  switch(action) {
    case 'LOGIN':
      return `Method: ${details.method || 'unknown'}`;
    case 'PAGE_ACCESS':
      return `Page: ${details.page || 'unknown'}`;
    case 'ORDER_CREATE':
      return `Total: $${details.total || '0'}, Status: ${details.status || 'unknown'}`;
    case 'ORDER_UPDATE':
      return `Order ID: ${details.orderId || 'unknown'}, Field: ${details.field || 'unknown'}`;
    case 'PRODUCT_CREATE':
      return `Product: ${details.name || 'unknown'}, Price: $${details.price || '0'}`;
    case 'FULFILLMENT_UPDATE':
      return `Order: ${details.orderId || 'unknown'}, Status: ${details.newStatus || 'unknown'}`;
    default:
      return JSON.stringify(details).substring(0, 100) + (JSON.stringify(details).length > 100 ? '...' : '');
  }
}
