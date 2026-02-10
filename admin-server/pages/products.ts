import { Decimal } from '@prisma/client/runtime/library';

export function registerProductsRoutes(
  app: any,
  { prisma, logActivity, requireAuth, requireAdmin }: any
) {
  // Page: Products List
  app.get('/products', requireAuth, (req: any, res: any) => {
    res.send(generateProductsPage(req));
  });

  // Page: Create/Edit Product
  app.get('/products/new', requireAdmin, (req: any, res: any) => {
    res.send(generateProductFormPage(req, null));
  });

  app.get('/products/:id', requireAdmin, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      const product = await prisma.product.findUnique({
        where: { id },
        include: { categories: true, product_variants: true }
      });
      if (!product) return res.redirect('/products?error=Product+not+found');
      res.send(generateProductFormPage(req, product));
    } catch (e) {
      console.error(e);
      res.redirect('/products?error=Failed+to+load+product');
    }
  });

  // API: Get Products
  app.get('/api/products', requireAuth, async (req: any, res: any) => {
    try {
      const products = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        include: { categories: true }
      });
      // Serialize Decimals
      const serialized = products.map((p: any) => ({
        ...p,
        price: Number(p.price),
        category: p.categories?.name || 'Uncategorized'
      }));
      res.json(serialized);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // API: Create Product
  app.post('/api/products', requireAdmin, async (req: any, res: any) => {
    try {
      const { name, price, description, category, inventoryQuantity, sizes, colors, images } = req.body;

      // Handle Category (Upsert)
      let categoryId = null;
      if (category) {
        const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const cat = await prisma.categories.upsert({
          where: { slug },
          update: {},
          create: { name: category, slug }
        });
        categoryId = cat.id;
      }

      // Generate Slug
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString().slice(-4);
      const imageUrl = images ? images.split(',')[0].trim() : '';

      const product = await prisma.product.create({
        data: {
          name,
          slug,
          price: Number(price),
          description,
          category_id: categoryId,
          stock_quantity: Number(inventoryQuantity || 0),
          is_active: true,
          image_url: imageUrl,
          // Create variants if sizes/colors provided
          product_variants: {
            create: generateVariants(sizes, colors, Number(price))
          }
        }
      });

      logActivity(req.user.id, req.user.email, 'PRODUCT_CREATE', { productId: product.id, name });
      res.json({ ok: true, id: product.id });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  // API: Update Product
  app.put('/api/products/:id', requireAdmin, async (req: any, res: any) => {
    try {
      const { name, price, description, category, inventoryQuantity, sizes, colors, images, active } = req.body;

      // Handle Category
      let categoryId = null;
      if (category) {
        const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const cat = await prisma.categories.upsert({
          where: { slug },
          update: {},
          create: { name: category, slug }
        });
        categoryId = cat.id;
      }

      const imageUrl = images ? images.split(',')[0].trim() : '';

      // Update Product
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: {
          name,
          price: Number(price),
          description,
          category_id: categoryId,
          stock_quantity: Number(inventoryQuantity || 0),
          is_active: active === 'true' || active === true,
          image_url: imageUrl
        }
      });

      // Re-create variants (simplistic approach: delete all and recreate)
      // In a real app, we would update existing ones, but this is an admin panel MVP
      await prisma.product_variants.deleteMany({ where: { product_id: product.id } });
      const variants = generateVariants(sizes, colors, Number(price));
      if (variants.length > 0) {
        for (const v of variants) {
          await prisma.product_variants.create({
            data: { ...v, product_id: product.id }
          });
        }
      }

      logActivity(req.user.id, req.user.email, 'PRODUCT_UPDATE', { productId: product.id });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  // API: Delete Product
  app.delete('/api/products/:id', requireAdmin, async (req: any, res: any) => {
    try {
      await prisma.product.delete({ where: { id: req.params.id } });
      logActivity(req.user.id, req.user.email, 'PRODUCT_DELETE', { productId: req.params.id });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });
}

function generateVariants(sizesStr: string, colorsStr: string, price: number) {
  const sizes = sizesStr ? sizesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const colors = colorsStr ? colorsStr.split(',').map(c => c.trim()).filter(Boolean) : [];
  const variants: any[] = [];

  if (sizes.length > 0 && colors.length > 0) {
    for (const size of sizes) {
      for (const color of colors) {
        variants.push({
          size,
          color,
          sku: `${size}-${color}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          stock_quantity: 0, // Default
          price_adjustment: 0
        });
      }
    }
  } else if (sizes.length > 0) {
    for (const size of sizes) {
      variants.push({
        size,
        sku: `${size}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        stock_quantity: 0,
        price_adjustment: 0
      });
    }
  } else if (colors.length > 0) {
    for (const color of colors) {
      variants.push({
        color,
        sku: `${color}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        stock_quantity: 0,
        price_adjustment: 0
      });
    }
  }
  return variants;
}

function generateProductsPage(req: any) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Products</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-user-select: none;
          user-select: none;
        }

        html, body {
          width: 100%;
          overflow-x: hidden;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
        }

        .header {
          background: #667eea;
          color: white;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .btn {
          background: #4299e1;
          color: white;
          padding: 12px 16px;
          border: none;
          border-radius: 10px;
          text-decoration: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          -webkit-appearance: none;
          appearance: none;
          min-height: 44px;
          touch-action: manipulation;
          white-space: nowrap;
          transition: opacity 0.2s;
        }

        .btn:active {
          opacity: 0.85;
        }

        .btn-new {
          background: #48bb78;
        }

        .btn-back {
          background: #6c757d;
        }

        .main {
          padding: 16px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          overflow: hidden;
          margin-top: 12px;
        }

        .products-list {
          display: flex;
          flex-direction: column;
        }

        .product-item {
          padding: 16px;
          border-bottom: 1px solid #eee;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.2s;
          -webkit-user-select: auto;
          user-select: auto;
        }

        .product-item:last-child {
          border-bottom: none;
        }

        .product-item:active {
          background: #f8f9fa;
        }

        .img-thumb {
          width: 50px;
          height: 50px;
          min-width: 50px;
          object-fit: cover;
          border-radius: 8px;
          background: #eee;
        }

        .product-info {
          flex: 1;
          min-width: 0;
        }

        .product-name {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 6px;
          word-break: break-word;
        }

        .product-meta {
          font-size: 13px;
          color: #666;
          line-height: 1.4;
        }

        .meta-item {
          display: inline-block;
          margin-right: 12px;
        }

        .badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          background: #e0f2fe;
          color: #0369a1;
        }

        .badge.active {
          background: #dcfce7;
          color: #166534;
        }

        .badge.inactive {
          background: #fee2e2;
          color: #991b1b;
        }

        .empty-state {
          text-align: center;
          padding: 40px 24px;
          color: #666;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        table {
          display: none;
        }

        @media (min-width: 768px) {
          .products-list {
            display: none;
          }

          table {
            display: table;
            width: 100%;
            border-collapse: collapse;
          }

          th, td {
            padding: 16px;
            text-align: left;
            border-bottom: 1px solid #eee;
            font-size: 15px;
          }

          th {
            background: #f8f9fa;
            font-weight: 600;
            color: #333;
          }

          tr:hover {
            background: #f8f9fa;
            cursor: pointer;
          }

          .img-thumb {
            width: 44px;
            height: 44px;
          }
        }

        @media (max-width: 480px) {
          .header {
            padding: 12px;
          }

          .header h1 {
            font-size: 20px;
          }

          .header-actions {
            gap: 6px;
          }

          .btn {
            padding: 10px 12px;
            font-size: 13px;
            min-height: 40px;
            border-radius: 8px;
          }

          .main {
            padding: 12px;
          }

          .product-item {
            padding: 12px;
            gap: 10px;
          }

          .img-thumb {
            width: 44px;
            height: 44px;
          }

          .product-name {
            font-size: 15px;
          }

          .product-meta {
            font-size: 12px;
          }

          .meta-item {
            margin-right: 10px;
          }

          .badge {
            font-size: 11px;
            padding: 3px 8px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>👕 Products</h1>
        <div class="header-actions">
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="btn btn-back">Back</a>
          <a href="/products/new${req.query.session ? `?session=${req.query.session}` : ''}" class="btn btn-new">+ New</a>
        </div>
      </div>
      <div class="main">
        <div class="card">
          <div class="products-list" id="prod-list"></div>
          <table id="prod-table">
            <thead>
              <tr>
                <th width="60">Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="prod-body"></tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        const isMobile = window.innerWidth < 768;
        
        fetch('/api/products' + session)
          .then(r => r.json())
          .then(products => {
            const list = document.getElementById('prod-list');
            const tbody = document.getElementById('prod-body');
            
            if (!products.length) {
              if (isMobile) {
                list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No products found</p></div>';
              } else {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No products found</td></tr>';
              }
              return;
            }

            if (isMobile) {
              list.innerHTML = products.map(p => \`
                <div class="product-item" onclick="location.href='/products/\${p.id}' + session">
                  <img src="\${p.image_url || ''}" class="img-thumb" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect fill=%22%23eee%22 width=%2250%22 height=%2250%22/%3E%3C/svg%3E'">
                  <div class="product-info">
                    <div class="product-name">\${p.name}</div>
                    <div class="product-meta">
                      <span class="meta-item">$\${p.price.toFixed(2)}</span>
                      <span class="meta-item">Stock: \${p.stock_quantity || 0}</span>
                    </div>
                  </div>
                  <span class="badge \${p.is_active ? 'active' : 'inactive'}">\${p.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              \`).join('');
            } else {
              tbody.innerHTML = products.map(p => \`
                <tr onclick="location.href='/products/\${p.id}' + session">
                  <td><img src="\${p.image_url || ''}" class="img-thumb" onerror="this.style.display='none'"></td>
                  <td><strong>\${p.name}</strong></td>
                  <td>\${p.category}</td>
                  <td>$\${p.price.toFixed(2)}</td>
                  <td>\${p.stock_quantity || 0}</td>
                  <td>\${p.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              \`).join('');
            }
          });
      </script>
    </body>
    </html>
  `;
}

function generateProductFormPage(req: any, product: any) {
  const isNew = !product;
  const session = req.query.session ? `?session=${req.query.session}` : '';

  // Extract sizes/colors from variants
  let sizes = new Set();
  let colors = new Set();
  if (product && product.product_variants) {
    product.product_variants.forEach((v: any) => {
      if (v.size) sizes.add(v.size);
      if (v.color) colors.add(v.color);
    });
  }
  const sizesStr = Array.from(sizes).join(', ');
  const colorsStr = Array.from(colors).join(', ');
  const categoryName = product?.categories?.name || '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${isNew ? 'New Product' : 'Edit Product'}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-user-select: none;
          user-select: none;
        }

        html, body {
          width: 100%;
          overflow-x: hidden;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
        }

        .header {
          background: #667eea;
          color: white;
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 0;
        }

        .back-btn {
          background: #6c757d;
          color: white;
          padding: 10px 16px;
          border: none;
          border-radius: 10px;
          text-decoration: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          -webkit-appearance: none;
          appearance: none;
          min-height: 44px;
          white-space: nowrap;
          touch-action: manipulation;
          display: flex;
          align-items: center;
          transition: opacity 0.2s;
        }

        .back-btn:active {
          opacity: 0.85;
        }

        .main {
          padding: 16px;
          max-width: 800px;
          margin: 0 auto;
        }

        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          padding: 24px 20px;
          margin-top: 12px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        label {
          display: block;
          margin-bottom: 10px;
          font-weight: 600;
          color: #333;
          font-size: 15px;
        }

        input, textarea, select {
          width: 100%;
          padding: 16px 14px;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          box-sizing: border-box;
          font-size: 16px;
          font-family: inherit;
          -webkit-appearance: none;
          appearance: none;
          transition: border-color 0.3s;
        }

        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: #667eea;
        }

        textarea {
          resize: vertical;
          min-height: 120px;
          line-height: 1.5;
        }

        .row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .col {
          flex: 1;
          min-width: 160px;
        }

        .section-divider {
          border: 0;
          border-top: 2px solid #eee;
          margin: 24px 0;
        }

        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin-bottom: 16px;
          margin-top: 8px;
        }

        .btn-group {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 28px;
        }

        .btn {
          background: #4299e1;
          color: white;
          padding: 16px 20px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          -webkit-appearance: none;
          appearance: none;
          min-height: 48px;
          white-space: nowrap;
          touch-action: manipulation;
          transition: opacity 0.2s;
          flex: 1;
          min-width: 120px;
        }

        .btn:active {
          opacity: 0.85;
        }

        .btn-del {
          background: #e53e3e;
          flex: 1;
        }

        .loading-message {
          display: none;
          padding: 16px;
          background: #efe;
          color: #3c3;
          border: 1px solid #cfc;
          border-radius: 10px;
          margin-bottom: 16px;
          text-align: center;
          font-weight: 600;
        }

        .error-message {
          display: none;
          padding: 16px;
          background: #fee;
          color: #c33;
          border: 1px solid #fcc;
          border-radius: 10px;
          margin-bottom: 16px;
        }

        @media (max-width: 480px) {
          .header {
            padding: 12px;
          }

          .header h1 {
            font-size: 18px;
          }

          .back-btn {
            padding: 8px 12px;
            font-size: 13px;
            min-height: 40px;
            border-radius: 8px;
          }

          .main {
            padding: 12px;
          }

          .card {
            padding: 20px 16px;
            border-radius: 10px;
          }

          label {
            font-size: 14px;
            margin-bottom: 8px;
          }

          input, textarea, select {
            padding: 14px 12px;
            font-size: 16px;
            border-radius: 8px;
          }

          textarea {
            min-height: 100px;
          }

          .row {
            gap: 12px;
          }

          .col {
            min-width: 140px;
          }

          .section-title {
            font-size: 16px;
            margin-bottom: 14px;
          }

          .btn {
            padding: 14px 16px;
            font-size: 15px;
            min-height: 44px;
            border-radius: 8px;
          }

          .btn-group {
            gap: 8px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${isNew ? '✎ New Product' : '✎ Edit Product'}</h1>
        <a href="/products${session}" class="back-btn">Cancel</a>
      </div>
      <div class="main">
        <div class="card">
          <div id="loadingMsg" class="loading-message">Saving...</div>
          <div id="errorMsg" class="error-message"></div>

          <form id="prod-form">
            <div class="form-group">
              <label for="name">Product Name *</label>
              <input id="name" name="name" required value="${product?.name || ''}" placeholder="Enter product name">
            </div>

            <div class="row">
              <div class="col form-group">
                <label for="price">Price ($) *</label>
                <input id="price" name="price" type="number" step="0.01" required value="${product?.price ? Number(product.price) : ''}" placeholder="0.00">
              </div>
              <div class="col form-group">
                <label for="category">Category *</label>
                <input id="category" name="category" required value="${categoryName}" placeholder="e.g., Apparel">
              </div>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea id="description" name="description" placeholder="Describe your product...">${product?.description || ''}</textarea>
            </div>

            <hr class="section-divider">
            <h2 class="section-title">Inventory & Variants</h2>

            <div class="row">
              <div class="col form-group">
                <label for="inventory">Stock Quantity</label>
                <input id="inventory" name="inventoryQuantity" type="number" value="${product?.stock_quantity || 0}" placeholder="0">
              </div>
              <div class="col form-group">
                <label for="active">Active</label>
                <select id="active" name="active">
                  <option value="true" ${product?.is_active !== false ? 'selected' : ''}>✓ Active</option>
                  <option value="false" ${product?.is_active === false ? 'selected' : ''}>✗ Inactive</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="sizes">Sizes (comma separated)</label>
              <input id="sizes" name="sizes" placeholder="S, M, L, XL" value="${sizesStr}">
            </div>

            <div class="form-group">
              <label for="colors">Colors (comma separated)</label>
              <input id="colors" name="colors" placeholder="Red, Blue, Green" value="${colorsStr}">
            </div>

            <div class="form-group">
              <label for="images">Image URL</label>
              <input id="images" name="images" placeholder="https://example.com/image.jpg" value="${product?.image_url || ''}">
            </div>

            <div class="btn-group">
              <button type="submit" class="btn">💾 Save Product</button>
              ${!isNew ? `<button type="button" class="btn btn-del" onclick="deleteProd()">🗑 Delete</button>` : ''}
            </div>
          </form>
        </div>
      </div>

      <script>
        const isNew = ${isNew};
        const id = '${product?.id || ''}';
        const session = '${session}';

        document.getElementById('prod-form').onsubmit = async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const data = Object.fromEntries(formData.entries());
          
          const url = isNew ? '/api/products' + session : '/api/products/' + id + session;
          const method = isNew ? 'POST' : 'PUT';
          
          const loadingMsg = document.getElementById('loadingMsg');
          const errorMsg = document.getElementById('errorMsg');
          loadingMsg.style.display = 'block';
          errorMsg.style.display = 'none';

          try {
            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            if (res.ok) {
              loadingMsg.textContent = 'Saved! Redirecting...';
              setTimeout(() => {
                window.location.href = '/products' + session;
              }, 800);
            } else {
              const error = await res.json();
              errorMsg.textContent = error.error || 'Failed to save. Please try again.';
              errorMsg.style.display = 'block';
              loadingMsg.style.display = 'none';
            }
          } catch (err) {
            errorMsg.textContent = 'Network error. Please check your connection and try again.';
            errorMsg.style.display = 'block';
            loadingMsg.style.display = 'none';
          }
        };

        function deleteProd() {
          if (!confirm('Are you sure you want to delete this product? This cannot be undone.')) return;
          const loadingMsg = document.getElementById('loadingMsg');
          loadingMsg.textContent = 'Deleting...';
          loadingMsg.style.display = 'block';

          fetch('/api/products/' + id + session, { method: 'DELETE' })
            .then(res => {
              if (res.ok) {
                loadingMsg.textContent = 'Deleted! Redirecting...';
                setTimeout(() => {
                  window.location.href = '/products' + session;
                }, 800);
              } else {
                alert('Failed to delete. Please try again.');
                loadingMsg.style.display = 'none';
              }
            })
            .catch(err => {
              alert('Error deleting product. Please try again.');
              loadingMsg.style.display = 'none';
            });
        }
      </script>
    </body>
    </html>
  `;
}
