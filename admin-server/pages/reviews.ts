
export async function generateReviewsPage(req: any, prisma: any) {
  const reviews = await prisma.product_reviews.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      products: {
        select: { name: true, image_url: true }
      },
      users: {
        select: { email: true, raw_user_meta_data: true }
      }
    }
  });

  const reviewsList = reviews.map((r: any) => {
    const userName = r.users?.raw_user_meta_data?.name || r.users?.raw_user_meta_data?.full_name || r.users?.email || 'Unknown';
    const productName = r.products?.name || 'Unknown Product';
    const productImage = r.products?.image_url || '';
    const ratingStars = '⭐'.repeat(r.rating);

    return `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4">
          <div class="flex items-center gap-3">
            ${productImage ? `<img src="${productImage}" class="w-10 h-10 object-cover rounded" />` : ''}
            <span class="font-medium">${productName}</span>
          </div>
        </td>
        <td class="p-4">
          <div class="font-medium">${userName}</div>
          <div class="text-xs text-gray-500">${r.users?.email || ''}</div>
        </td>
        <td class="p-4 text-yellow-500 text-sm">${ratingStars}</td>
        <td class="p-4">
          <div class="font-medium text-gray-900 mb-1">${r.title || ''}</div>
          <div class="text-gray-600 text-sm">${r.comment || ''}</div>
        </td>
        <td class="p-4">
          <span class="px-2 py-1 rounded-full text-xs font-medium ${r.is_approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
            ${r.is_approved ? 'Approved' : 'Pending'}
          </span>
        </td>
        <td class="p-4 text-sm text-gray-500">
          ${new Date(r.created_at).toLocaleDateString()}
        </td>
        <td class="p-4">
          <div class="flex gap-2">
            ${!r.is_approved ? `
              <button onclick="approveReview('${r.id}')" class="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm transition-colors">
                Approve
              </button>
            ` : ''}
            <button onclick="deleteReview('${r.id}')" class="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm transition-colors">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reviews Management</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; }
        header { position: sticky; top: 0; z-index: 100; }
        .action-btn { min-height: 44px; touch-action: manipulation; }
        .action-btn:active { opacity: 0.85; }
        @media (max-width: 768px) {
          main { padding: 1rem !important; }
          header { flex-direction: column; align-items: flex-start; gap: 1rem; }
          table { font-size: 0.875rem; }
          th, td { padding: 0.75rem !important; }
        }
        @media (max-width: 480px) {
          header { padding: 0.75rem !important; }
          main { padding: 0.75rem !important; }
          table { font-size: 0.75rem; }
          th, td { padding: 0.5rem !important; }
          .px-4 { padding: 0.5rem !important; }
          .py-2 { padding: 0.375rem !important; }
        }
      </style>
    </head>
    <body>
      <div class="min-h-screen">
        <!-- Header -->
        <header class="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <div class="flex items-center gap-4">
            <h1 class="text-xl font-semibold text-gray-900">⭐ Reviews Management</h1>
            <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-medium">${reviews.length} Total</span>
          </div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" 
             class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
            Back to Dashboard
          </a>
        </header>

        <!-- Content -->
        <main class="p-8 max-w-[1600px] mx-auto">
          <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-medium">
                    <th class="p-4">Product</th>
                    <th class="p-4">Customer</th>
                    <th class="p-4">Rating</th>
                    <th class="p-4 w-1/3">Review</th>
                    <th class="p-4">Status</th>
                    <th class="p-4">Date</th>
                    <th class="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${reviewsList || '<tr><td colspan="7" class="p-8 text-center text-gray-500">No reviews found</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      <script>
        async function approveReview(id) {
          if (!confirm('Approve this review?')) return;
          try {
            const res = await fetch('/api/reviews/' + id + '/approve', { 
              method: 'PUT',
              headers: { 'Authorization': 'Bearer ' + new URLSearchParams(window.location.search).get('session') }
            });
            if (res.ok) window.location.reload();
            else alert('Failed to approve');
          } catch (e) { alert('Error: ' + e.message); }
        }

        async function deleteReview(id) {
          if (!confirm('Delete this review permanently?')) return;
          try {
            const res = await fetch('/api/reviews/' + id, { 
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + new URLSearchParams(window.location.search).get('session') }
            });
            if (res.ok) window.location.reload();
            else alert('Failed to delete');
          } catch (e) { alert('Error: ' + e.message); }
        }
      </script>
    </body>
    </html>
  `;
}

export function registerReviewsRoutes(app: any, { prisma, requireAuth, logActivity }: any) {
  // View Page
  app.get('/reviews', requireAuth, async (req: any, res: any) => {
    try {
      const html = await generateReviewsPage(req, prisma);
      res.send(html);
    } catch (error) {
      console.error('Error loading reviews:', error);
      res.status(500).send('Error loading reviews');
    }
  });

  // API: Approve Review
  app.put('/api/reviews/:id/approve', requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await prisma.product_reviews.update({
        where: { id },
        data: { is_approved: true }
      });

      if (logActivity) {
        logActivity(req.user.id, req.user.email, 'APPROVE_REVIEW', { reviewId: id });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error approving review:', error);
      res.status(500).json({ error: 'Failed to approve review' });
    }
  });

  // API: Delete Review
  app.delete('/api/reviews/:id', requireAuth, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await prisma.product_reviews.delete({
        where: { id }
      });

      if (logActivity) {
        logActivity(req.user.id, req.user.email, 'DELETE_REVIEW', { reviewId: id });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting review:', error);
      res.status(500).json({ error: 'Failed to delete review' });
    }
  });
}
