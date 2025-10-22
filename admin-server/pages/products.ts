export function generateProductsPage(req: any, products: any[]) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Product Management</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; background: #f5f5f5; }
        .header { background: #667eea; color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
        .main-content { padding: 30px; max-width: 1400px; margin: 0 auto; }
        .back-btn, .add-btn { background: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; margin-right: 10px; }
        .add-btn { background: #28a745; }
        .products-container { background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 5px 15px rgba(0,0,0,0.1); margin-top: 20px; }
        .products-table { width: 100%; }
        .products-table th, .products-table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
        .products-table th { background: #f8f9fa; font-weight: bold; }
        .product-form { background: white; padding: 20px; margin-bottom: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        .form-group textarea { height: 80px; resize: vertical; }
        .form-actions { display: flex; gap: 10px; }
        .action-btn { padding: 5px 10px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .edit-btn { background: #007bff; color: white; }
        .delete-btn { background: #dc3545; color: white; }
        .in-stock { color: #28a745; font-weight: bold; }
        .out-of-stock { color: #dc3545; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>👕 Product Management</h1>
        <div>
          <a href="/dashboard${req.query.session ? `?session=${req.query.session}` : ''}" class="back-btn">Back to Dashboard</a>
          <button class="add-btn" onclick="toggleProductForm()">Add New Product</button>
        </div>
      </div>
      
      <div class="main-content">
        <!-- Add Product Form -->
        <div id="productForm" class="product-form" style="display: none;">
          <h3>Add New Product</h3>
          <form action="/products/create${req.query.session ? `?session=${req.query.session}` : ''}" method="POST">
            <div class="form-group">
              <label for="name">Product Name:</label>
              <input type="text" id="name" name="name" required>
            </div>
            <div class="form-group">
              <label for="description">Description:</label>
              <textarea id="description" name="description" placeholder="Product description..."></textarea>
            </div>
            <div class="form-group">
              <label for="price">Price ($):</label>
              <input type="number" step="0.01" id="price" name="price" required>
            </div>
            <div class="form-group">
              <label for="category">Category:</label>
              <select id="category" name="category" required>
                <option value="">Select Category</option>
                <option value="shirts">Shirts</option>
                <option value="pants">Pants</option>
                <option value="dresses">Dresses</option>
                <option value="jackets">Jackets</option>
                <option value="shoes">Shoes</option>
                <option value="accessories">Accessories</option>
              </select>
            </div>
            <div class="form-group">
              <label for="inStock">In Stock:</label>
              <select id="inStock" name="inStock">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div class="form-actions">
              <button type="submit" class="add-btn">Create Product</button>
              <button type="button" onclick="toggleProductForm()" class="back-btn">Cancel</button>
            </div>
          </form>
        </div>

        <div class="products-container">
          <table class="products-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Description</th>
                <th>Price</th>
                <th>Category</th>
                <th>Stock Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(product => `
                <tr>
                  <td><strong>${product.name}</strong></td>
                  <td>${product.description || 'No description'}</td>
                  <td>$${product.price.toFixed(2)}</td>
                  <td>${product.category}</td>
                  <td><span class="${product.inStock ? 'in-stock' : 'out-of-stock'}">${product.inStock ? 'In Stock' : 'Out of Stock'}</span></td>
                  <td>${new Date(product.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button class="action-btn edit-btn" onclick="editProduct('${product.id}')">Edit</button>
                    <button class="action-btn delete-btn" onclick="deleteProduct('${product.id}')">Delete</button>
                  </td>
                </tr>
              `).join('')}
              ${products.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 30px;">No products found. Add your first product!</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        function toggleProductForm() {
          const form = document.getElementById('productForm');
          form.style.display = form.style.display === 'none' ? 'block' : 'none';
        }
        
        function editProduct(productId) {
          alert('Edit product: ' + productId + ' - This would open an edit form');
        }
        
        function deleteProduct(productId) {
          if (confirm('Are you sure you want to delete this product?')) {
            fetch('/products/' + productId + '/delete${req.query.session ? `?session=${req.query.session}` : ''}', {
              method: 'POST'
            }).then(() => location.reload());
          }
        }
      </script>
    </body>
    </html>
  `;
}
