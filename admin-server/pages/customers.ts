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

  // API: Sync Email Audience
  app.post('/api/customers/sync/email', requireAuth, async (req: any, res: any) => {
    try {
      if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_LIST_ID) {
        return res.status(500).json({ error: 'Email audience not configured' });
      }

      const users = await prisma.users.findMany({
        where: { email: { not: null } },
        select: {
          email: true,
          phone: true,
          raw_user_meta_data: true
        }
      });

      let synced = 0;
      let failed = 0;

      for (const user of users) {
        if (!user.email) continue;

        const meta = (user.raw_user_meta_data as any) || {};
        const name = meta.name || meta.full_name || meta.fullName || '';

        try {
          await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID!, {
            email_address: user.email,
            status: 'subscribed',
            merge_fields: {
              FNAME: name,
              PHONE: user.phone || ''
            }
          });
          synced++;
        } catch (e: any) {
          if (e.response?.body?.title === 'Member Exists' || e.message.includes('Member Exists')) {
            synced++;
          } else {
            failed++;
            console.error(`Failed to sync email ${user.email}:`, e.response?.body?.detail || e.message);
          }
        }
      }

      res.json({ ok: true, synced, failed });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Sync failed: ' + e.message });
    }
  });

  // API: Sync SMS Audience
  app.post('/api/customers/sync/sms', requireAuth, async (req: any, res: any) => {
    try {
      if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SMS_AUDIENCE_ID) {
        return res.status(500).json({ error: 'SMS audience not configured' });
      }

      const users = await prisma.users.findMany({
        where: { phone: { not: null } },
        select: {
          email: true,
          phone: true,
          raw_user_meta_data: true
        }
      });

      let synced = 0;
      let failed = 0;

      for (const user of users) {
        if (!user.phone) continue;

        const meta = (user.raw_user_meta_data as any) || {};
        const name = meta.name || meta.full_name || meta.fullName || '';

        try {
          // Use the standard mailchimp API endpoint for SMS audience management
          await (mailchimp as any).post(`/sms/campaigns/${process.env.MAILCHIMP_SMS_AUDIENCE_ID}/conversations`, {
            phone_number: user.phone,
            email_address: user.email || '',
            status: 'subscribed'
          }).catch(() => {
            // Alternative: try direct SMS contact management if available
            return (mailchimp as any).smsCampaigns?.addContact?.(process.env.MAILCHIMP_SMS_AUDIENCE_ID!, {
              phone_number: user.phone,
              email_address: user.email || '',
              status: 'subscribed'
            });
          });
          synced++;
        } catch (e: any) {
          // SMS contact might already exist or audience might not support contact management
          if (e.message?.includes('already') || e.response?.status === 409) {
            synced++;
          } else {
            failed++;
            console.warn(`Failed to sync SMS for ${user.phone}:`, e.message);
          }
        }
      }

      res.json({ ok: true, synced, failed });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Sync failed: ' + e.message });
    }
  });
}

function generateCustomersPage(req: any) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Customers</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f5f5f5; overflow-x: hidden; }
        .header { background: #667eea; color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; position: sticky; top: 0; z-index: 100; }
        .header h1 { margin: 0; font-size: 20px; }
        .main { padding: 16px; max-width: 1200px; margin: 0 auto; }
        .back-btn { background: #6c757d; color: white; padding: 12px 18px; border: none; border-radius: 10px; text-decoration: none; min-height: 44px; touch-action: manipulation; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .back-btn:active { opacity: 0.85; }
        .section-title { font-size: 18px; font-weight: 600; color: #333; margin-top: 24px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .section-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
        .btn { background: #4299e1; color: white; border: none; padding: 12px 18px; border-radius: 10px; cursor: pointer; min-height: 44px; touch-action: manipulation; font-size: 14px; }
        .btn:active { opacity: 0.85; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-sms { background: #38a169; }
        .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:active { background: #f8f9fa; }
        .empty-state { padding: 24px; text-align: center; color: #999; }
        @media (max-width: 480px) {
          .header { padding: 12px; }
          .header h1 { font-size: 18px; }
          .main { padding: 12px; }
          .back-btn { padding: 10px 14px; font-size: 13px; }
          .btn { padding: 10px 14px; font-size: 13px; }
          .section-title { font-size: 16px; }
          table { font-size: 13px; }
          th, td { padding: 10px 8px; }
          .section-header { flex-direction: column; align-items: flex-start; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>👥 Customers</h1>
        <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back</a>
      </div>
      <div class="main">
        <!-- Email Audience Section -->
        <div class="section-header">
          <div class="section-title">📧 Email Audience</div>
        </div>
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
            <tbody id="email-body">
              <tr><td colspan="5" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
          <div style="padding: 12px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span id="email-count" style="color: #666; font-size: 13px;">Customers with email</span>
            <button class="btn" onclick="syncEmail()" id="email-sync-btn">🔄 Sync to Email Audience</button>
          </div>
        </div>

        <!-- SMS Audience Section -->
        <div class="section-header" style="margin-top: 32px;">
          <div class="section-title">📱 SMS Audience</div>
        </div>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody id="sms-body">
              <tr><td colspan="5" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
          <div style="padding: 12px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span id="sms-count" style="color: #666; font-size: 13px;">Customers with phone</span>
            <button class="btn btn-sms" onclick="syncSms()" id="sms-sync-btn">🔄 Sync to SMS Audience</button>
          </div>
        </div>
      </div>

      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        let allCustomers = [];
        
        function load() {
          fetch('/api/customers' + session)
            .then(r => r.json())
            .then(users => {
              allCustomers = users;
              
              // Separate into email and SMS customers
              const emailCustomers = users.filter(u => u.email);
              const smsCustomers = users.filter(u => u.phone);
              
              // Populate email table
              const emailBody = document.getElementById('email-body');
              if (!emailCustomers.length) {
                emailBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No customers with email</td></tr>';
              } else {
                emailBody.innerHTML = emailCustomers.map(u => \`
                  <tr>
                    <td>\${u.name || '-'}</td>
                    <td>\${u.email}</td>
                    <td>\${u.phone || '-'}</td>
                    <td>\${u.role || 'user'}</td>
                    <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                \`).join('');
                document.getElementById('email-count').textContent = \`\${emailCustomers.length} customer\${emailCustomers.length !== 1 ? 's' : ''} with email\`;
              }
              
              // Populate SMS table
              const smsBody = document.getElementById('sms-body');
              if (!smsCustomers.length) {
                smsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No customers with phone</td></tr>';
              } else {
                smsBody.innerHTML = smsCustomers.map(u => \`
                  <tr>
                    <td>\${u.name || '-'}</td>
                    <td>\${u.phone}</td>
                    <td>\${u.email || '-'}</td>
                    <td>\${u.role || 'user'}</td>
                    <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                \`).join('');
                document.getElementById('sms-count').textContent = \`\${smsCustomers.length} customer\${smsCustomers.length !== 1 ? 's' : ''} with phone\`;
              }
            })
            .catch(err => {
              console.error('Failed to load customers:', err);
              document.getElementById('email-body').innerHTML = '<tr><td colspan="5" style="text-align:center">Error loading customers</td></tr>';
              document.getElementById('sms-body').innerHTML = '<tr><td colspan="5" style="text-align:center">Error loading customers</td></tr>';
            });
        }

        function syncEmail() {
          const btn = document.getElementById('email-sync-btn');
          btn.disabled = true;
          btn.textContent = 'Syncing...';
          
          fetch('/api/customers/sync/email' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              btn.disabled = false;
              btn.textContent = '🔄 Sync to Email Audience';
              if (res.ok) {
                alert(\`📧 Email Sync Complete!\\n\\nSynced: \${res.synced}\\nFailed: \${res.failed}\`);
              } else {
                alert('Sync failed: ' + res.error);
              }
            })
            .catch(err => {
              btn.disabled = false;
              btn.textContent = '🔄 Sync to Email Audience';
              alert('Sync error: ' + err.message);
            });
        }

        function syncSms() {
          const btn = document.getElementById('sms-sync-btn');
          btn.disabled = true;
          btn.textContent = 'Syncing...';
          
          fetch('/api/customers/sync/sms' + session, { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              btn.disabled = false;
              btn.textContent = '🔄 Sync to SMS Audience';
              if (res.ok) {
                alert(\`📱 SMS Sync Complete!\\n\\nSynced: \${res.synced}\\nFailed: \${res.failed}\`);
              } else {
                alert('Sync failed: ' + res.error);
              }
            })
            .catch(err => {
              btn.disabled = false;
              btn.textContent = '🔄 Sync to SMS Audience';
              alert('Sync error: ' + err.message);
            });
        }
        
        load();
      </script>
    </body>
    </html>
  `;
}
