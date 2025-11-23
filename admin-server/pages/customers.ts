import express from 'express';
import mailchimp from '@mailchimp/mailchimp_marketing';

export function registerCustomersRoutes(app: any, { requireAuth, prisma }: any) {

  if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_SERVER_PREFIX) {
    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX,
    });
  }

  // Page
  app.get('/customers', requireAuth, (req: any, res: any) => {
    res.send(generateCustomersPage(req));
  });

  // API: Get Customers
  app.get('/api/customers', requireAuth, async (req: any, res: any) => {
    try {
      // Query auth.users via Prisma
      const users = await prisma.users.findMany({
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          created_at: true,
          raw_user_meta_data: true
        }
      });

      const serialized = users.map((u: any) => {
        const meta = u.raw_user_meta_data || {};
        return {
          id: u.id,
          email: u.email,
          phone: u.phone,
          role: u.role,
          createdAt: u.created_at,
          name: meta.name || meta.full_name || meta.fullName || 'Unknown'
        };
      });

      return res.json(serialized);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  // API: Sync to Mailchimp
  app.post('/api/customers/sync', requireAuth, async (req: any, res: any) => {
    try {
      if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_LIST_ID) {
        return res.status(500).json({ error: 'Mailchimp not configured' });
      }

      const users = await prisma.users.findMany({
        select: {
          email: true,
          phone: true,
          raw_user_meta_data: true
        }
      });

      let successCount = 0;
      let failCount = 0;

      for (const user of users) {
        if (!user.email) continue;

        const meta = (user.raw_user_meta_data as any) || {};
        const name = meta.name || meta.full_name || meta.fullName || '';

        try {
          await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID, {
            email_address: user.email,
            status: 'subscribed',
            merge_fields: {
              FNAME: name,
              PHONE: user.phone || ''
            }
          });
          successCount++;
        } catch (e: any) {
          // If already exists, try update (PUT) - simplified check
          if (e.response?.body?.title === 'Member Exists' || e.message.includes('Member Exists')) {
            // In a real app, we might want to update tags or fields
            successCount++;
          } else {
            failCount++;
            console.error(`Failed to sync ${user.email}:`, e.response?.body?.detail || e.message);
          }
        }
      }

      res.json({ ok: true, synced: successCount, failed: failCount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Sync failed' });
    }
  });
}

function generateCustomersPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Customers</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main { padding: 30px; max-width: 1200px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; }
        .btn { background: #4299e1; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        .card { background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>👥 Customers</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn" style="margin-right:10px">Back</a>
          <button class="btn" onclick="syncMailchimp()" id="sync-btn">Sync to Mailchimp</button>
        </div>
      </div>
      <div class="main">
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody id="cust-body">
              <tr><td colspan="5" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        
        function load() {
          fetch('/api/customers' + session)
            .then(r => r.json())
            .then(users => {
              const tbody = document.getElementById('cust-body');
              if (!users.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No customers found</td></tr>';
                return;
              }
              tbody.innerHTML = users.map(u => \`
                <tr>
                  <td>\${u.name || '-'}</td>
                  <td>\${u.email}</td>
                  <td>\${u.phone || '-'}</td>
                  <td>\${u.role || 'user'}</td>
                  <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              \`).join('');
            });
        }

        function syncMailchimp() {
          const btn = document.getElementById('sync-btn');
          btn.disabled = true;
          btn.textContent = 'Syncing...';
          
          fetch('/api/customers/sync' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              btn.disabled = false;
              btn.textContent = 'Sync to Mailchimp';
              if (res.ok) {
                alert(\`Sync complete! Success: \${res.synced}, Failed: \${res.failed}\`);
              } else {
                alert('Sync failed: ' + res.error);
              }
            });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
