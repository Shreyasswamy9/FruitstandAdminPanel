export function generateCommunicationsPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Communications</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main-content { padding: 16px; max-width: 1400px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main-content { padding: 12px; }
          .back-btn { padding: 10px 14px; font-size: 13px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>💬 Communications</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
      </div>
      
      <div class="main-content">
        <p>Customer communications will be displayed here.</p>
      </div>
    </body>
    </html>
  `;
}

export function registerCommunicationsRoutes(app: any, { requireAuth }: any) {
  app.get('/communications', requireAuth, (req: any, res: any) => {
    res.send(generateCommunicationsPage(req));
  });
}
