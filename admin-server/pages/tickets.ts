import express from 'express';

export function registerTicketsRoutes(
  app: any,
  {
    prisma,
    logActivity = () => { },
    requireAuth
  }: {
    prisma?: any;
    logActivity?: (...args: any[]) => void;
    requireAuth: any;
  }
) {
  // Page: Tickets List
  app.get('/tickets', requireAuth, (req: any, res: any) => {
    res.send(generateTicketsPage(req));
  });

  // Page: Ticket Detail
  app.get('/tickets/:id', requireAuth, (req: any, res: any) => {
    res.send(generateTicketDetailPage(req));
  });

  // API: Get Tickets
  app.get('/api/tickets', requireAuth, async (req: any, res: any) => {
    try {
      const status = req.query.status;
      const where: any = {};
      if (status && status !== 'all') where.status = status;

      const tickets = await prisma.ticket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          ticketId: true,
          subject: true,
          status: true,
          priority: true,
          userName: true,
          userEmail: true,
          createdAt: true
        }
      });
      return res.json(tickets);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  });

  // API: Get Ticket Detail
  app.get('/api/tickets/:id', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id; // This is the public ticketId (e.g. tkt_...)

      const ticket = await prisma.ticket.findUnique({
        where: { ticketId: id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      return res.json(ticket);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  });

  // API: Reply to Ticket
  app.post('/api/tickets/:id/reply', requireAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id; // Public ticketId
      const { message, status } = req.body;
      const user = req.user;

      const ticket = await prisma.ticket.findUnique({ where: { ticketId: id } });
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id, // Internal UUID
          senderType: 'admin',
          senderId: user.id,
          message,
          isInternal: false
        }
      });

      if (status) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status }
        });
      }

      logActivity(user.id, user.email, 'TICKET_REPLY', { ticketId: id, status });
      res.json({ ok: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to reply' });
    }
  });
}

function generateTicketsPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Support Tickets</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main { padding: 16px; max-width: 1200px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:active { background: #f8f9fa; }
        .status { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
        .status-open { background: #e2e8f0; color: #4a5568; }
        .status-in-progress { background: #bee3f8; color: #2b6cb0; }
        .status-resolved { background: #c6f6d5; color: #276749; }
        .status-closed { background: #fed7d7; color: #9b2c2c; }
        .priority { font-weight: bold; font-size: 12px; }
        .p-urgent { color: #e53e3e; }
        .p-high { color: #dd6b20; }
        .p-medium { color: #d69e2e; }
        .p-low { color: #38a169; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main { padding: 12px; }
          .back-btn { padding: 10px 14px; font-size: 13px; }
          table { font-size: 13px; }
          th, td { padding: 10px 8px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎫 Support Tickets</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>User</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody id="tickets-body">
              <tr><td colspan="6" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        fetch('/api/tickets' + session)
          .then(r => r.json())
          .then(tickets => {
            const tbody = document.getElementById('tickets-body');
            if (!tickets.length) {
              tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No tickets found</td></tr>';
              return;
            }
            tbody.innerHTML = tickets.map(t => \`
              <tr onclick="location.href='/tickets/\${t.ticketId}' + session">
                <td>#\${t.ticketId}</td>
                <td>\${t.subject}</td>
                <td>
                  <div>\${t.userName || 'Unknown'}</div>
                  <div style="font-size:12px;color:#666">\${t.userEmail || ''}</div>
                </td>
                <td><span class="status status-\${(t.status || 'open').toLowerCase()}">\${t.status}</span></td>
                <td><span class="priority p-\${(t.priority || 'medium').toLowerCase()}">\${t.priority}</span></td>
                <td>\${new Date(t.createdAt).toLocaleDateString()}</td>
              </tr>
            \`).join('');
          });
      </script>
    </body>
    </html>
  `;
}

function generateTicketDetailPage(req: any) {
  const id = req.params.id;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ticket #${id}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main { padding: 16px; max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 16px; margin-bottom: 16px; }
        .message { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
        .msg-user { background: #f7fafc; border-left: 4px solid #4299e1; }
        .msg-admin { background: #f0fff4; border-left: 4px solid #48bb78; margin-left: 0; }
        .msg-meta { font-size: 12px; color: #718096; margin-bottom: 5px; display: flex; justify-content: space-between; }
        .reply-box textarea { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; min-height: 100px; margin-bottom: 10px; font-family: inherit; font-size: 16px; }
        .btn { background: #4299e1; color: white; border: none; padding: 12px 18px; border-radius: 10px; cursor: pointer; min-height: 44px; touch-action: manipulation; font-size: 14px; }
        .btn:active { opacity: 0.85; }
        .info-row { margin-bottom: 12px; }
        .info-label { font-weight: bold; font-size: 12px; color: #718096; text-transform: uppercase; }
        @media (max-width: 768px) {
          .main { grid-template-columns: 1fr; padding: 12px; gap: 12px; }
          .card { padding: 12px; }
          .btn { width: 100%; }
        }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main { padding: 10px; gap: 10px; }
          .card { padding: 10px; }
          .btn { padding: 12px 14px; font-size: 13px; }
          .message { padding: 10px; margin-bottom: 12px; }
          .msg-admin { margin-left: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Ticket #${id}</h1>
        <a href="/tickets${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <div class="content">
          <div class="card">
            <h2 id="subject">Loading...</h2>
            <div class="message msg-user">
               <div class="msg-meta">
                  <strong>Original Message</strong>
                  <span id="created-at"></span>
               </div>
               <div id="description" style="color:#4a5568;line-height:1.5"></div>
            </div>
          </div>
          
          <div id="messages"></div>
          
          <div class="card reply-box">
            <h3>Reply</h3>
            <textarea id="reply-text" placeholder="Type your response..."></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <select id="new-status" style="padding:8px;border-radius:4px;border:1px solid #ccc">
                <option value="">Keep current status</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <button class="btn" onclick="sendReply()">Send Reply</button>
            </div>
          </div>
        </div>
        
        <div class="sidebar">
          <div class="card">
            <h3>Details</h3>
            <div class="info-row">
              <div class="info-label">Status</div>
              <div id="t-status">-</div>
            </div>
            <div class="info-row">
              <div class="info-label">Priority</div>
              <div id="t-priority">-</div>
            </div>
            <div class="info-row">
              <div class="info-label">Category</div>
              <div id="t-category">-</div>
            </div>
            <hr style="border:0;border-top:1px solid #eee;margin:15px 0">
            <div class="info-row">
              <div class="info-label">User</div>
              <div id="u-name">-</div>
              <div id="u-email" style="font-size:13px;color:#666">-</div>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        const id = '${id}';
        
        function load() {
          fetch('/api/tickets/' + id + session)
            .then(r => r.json())
            .then(data => {
              document.getElementById('subject').textContent = data.subject;
              document.getElementById('description').textContent = data.message; // Initial message
              document.getElementById('created-at').textContent = new Date(data.createdAt).toLocaleString();
              document.getElementById('t-status').textContent = data.status;
              document.getElementById('t-priority').textContent = data.priority;
              document.getElementById('t-category').textContent = data.category;
              document.getElementById('u-name').textContent = data.userName || 'Unknown';
              document.getElementById('u-email').textContent = data.userEmail || '';
              
              const msgs = document.getElementById('messages');
              msgs.innerHTML = (data.messages || []).map(m => \`
                <div class="message \${m.senderType === 'admin' ? 'msg-admin' : 'msg-user'}">
                  <div class="msg-meta">
                    <strong>\${m.senderType === 'admin' ? 'Admin' : (data.userName || 'User')}</strong>
                    <span>\${new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div>\${m.message}</div>
                </div>
              \`).join('');
            });
        }
        
        function sendReply() {
          const msg = document.getElementById('reply-text').value;
          const status = document.getElementById('new-status').value;
          if (!msg) return;
          
          fetch('/api/tickets/' + id + '/reply' + session, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, status })
          }).then(() => {
            document.getElementById('reply-text').value = '';
            load();
          });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
