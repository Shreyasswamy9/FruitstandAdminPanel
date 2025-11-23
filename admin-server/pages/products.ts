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
    <html>
    <head>
      <title>Products</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main { padding: 30px; max-width: 1200px; margin: 0 auto; }
        .btn { background: #4299e1; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; cursor: pointer; }
        .btn-new { background: #48bb78; }
        .card { background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden; margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; }
        tr:hover { background: #f8f9fa; cursor: pointer; }
        .img-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; background: #eee; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>👕 Products</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="btn" style="background:#6c757d;margin-right:10px">Back</a>
          <a href="/products/new${req.query.session ? `?session=${req.query.session}` : ''}" class="btn btn-new">New Product</a>
        </div>
      </div>
      <div class="main">
        <div class="card">
          <table>
            <thead>
              <tr>
                <th width="60">Img</th>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="prod-body">
              <tr><td colspan="6" style="text-align:center">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <script>
        const session = '${req.query.session ? `?session=${req.query.session}` : ''}';
        fetch('/api/products' + session)
          .then(r => r.json())
          .then(products => {
            const tbody = document.getElementById('prod-body');
            if (!products.length) {
              tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No products found</td></tr>';
              return;
            }
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
    <html>
    <head>
      <title>${isNew ? 'New Product' : 'Edit Product'}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main { padding: 30px; max-width: 800px; margin: 0 auto; }
        .card { background: white; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-weight: bold; color: #4a5568; }
        input, textarea, select { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; }
        .row { display: flex; gap: 20px; }
        .col { flex: 1; }
        .btn { background: #4299e1; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; }
        .btn-del { background: #e53e3e; margin-left: 10px; }
        .back-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${isNew ? 'New Product' : 'Edit Product'}</h1>
        <a href="/products${session}" class="back-btn">Cancel</a>
      </div>
      <div class="main">
        <div class="card">
          <form id="prod-form">
            <div class="form-group">
              <label>Name</label>
              <input name="name" required value="${product?.name || ''}">
            </div>
            <div class="row">
              <div class="col form-group">
                <label>Price ($)</label>
                <input name="price" type="number" step="0.01" required value="${product?.price ? Number(product.price) : ''}">
              </div>
              <div class="col form-group">
                <label>Category</label>
                <input name="category" required value="${categoryName}">
              </div>
            </div>
            <div class="form-group">
              <label>Description</label>
              <textarea name="description" rows="4">${product?.description || ''}</textarea>
            </div>
            
            <hr style="border:0;border-top:1px solid #eee;margin:20px 0">
            <h3>Inventory & Variants</h3>
            
            <div class="row">
              <div class="col form-group">
                <label>Stock Quantity</label>
                <input name="inventoryQuantity" type="number" value="${product?.stock_quantity || 0}">
              </div>
              <div class="col form-group">
                <label>Active</label>
                <select name="active">
                  <option value="true" ${product?.is_active !== false ? 'selected' : ''}>Yes</option>
                  <option value="false" ${product?.is_active === false ? 'selected' : ''}>No</option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label>Sizes (comma separated)</label>
              <input name="sizes" placeholder="S, M, L, XL" value="${sizesStr}">
            </div>
            <div class="form-group">
              <label>Colors (comma separated)</label>
              <input name="colors" placeholder="Red, Blue, Green" value="${colorsStr}">
            </div>
            <div class="form-group">
              <label>Image URL</label>
              <input name="images" placeholder="https://..." value="${product?.image_url || ''}">
            </div>

            <div style="margin-top:30px">
              <button type="submit" class="btn">Save Product</button>
              ${!isNew ? `<button type="button" class="btn btn-del" onclick="deleteProd()">Delete</button>` : ''}
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
          
          try {
            const res = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            if (res.ok) {
              window.location.href = '/products' + session;
            } else {
              alert('Failed to save');
            }
          } catch {
            alert('Error saving product');
          }
        };

        function deleteProd() {
          if (!confirm('Are you sure?')) return;
          fetch('/api/products/' + id + session, { method: 'DELETE' })
            .then(res => {
              if (res.ok) window.location.href = '/products' + session;
              else alert('Failed to delete');
            });
        }
      </script>
    </body>
    </html>
  `;
}
