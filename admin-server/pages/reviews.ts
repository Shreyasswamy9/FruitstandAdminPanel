export function generateReviewsPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reviews Management</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>⭐ Reviews Management</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
      </div>
      
      <div class="main-content">
        <p>Customer reviews and ratings will be displayed here.</p>
      </div>
    </body>
    </html>
  `;
}
