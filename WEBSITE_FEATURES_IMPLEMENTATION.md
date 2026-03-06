# Website Features Implementation – Complete Guide

## Overview
This document outlines implementation of:
1. ✅ Persistent category filtering
2. ✅ Pagination for product lists
3. ✅ Persistent product enable/disable (visibility)

---

## Phase 1: Database Updates

### Add `Enabled` Column to Products Table

```sql
ALTER TABLE Product
ADD Enabled BIT NOT NULL DEFAULT 1;

-- Index for faster queries
CREATE INDEX idx_product_enabled ON Product(Enabled);
```

### Verify Prisma Schema

In `prisma/schema.prisma`, ensure Product model has:

```prisma
model Product {
  id                  Int     @id @default(autoincrement())
  sourceCode          String? @unique
  name                String
  price               Float
  stock               Int
  category            String?
  description         String?
  barcode             String?
  image               String?
  isOnSale            Boolean @default(false)
  discountPrice       Float?
  originalPrice       Float?
  expiryDate          DateTime?
  isActive            Boolean @default(true)
  Enabled             Boolean @default(true)  // NEW FIELD
  syncedFromPOS       Boolean @default(false)
  lastSyncedAt        DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

Then run:
```bash
npx prisma migrate dev --name add_enabled_field
```

---

## Phase 2: Backend Enhancements

### Enhanced getProducts Endpoint

**Support these query parameters:**
- `page` (default: 1) - Page number
- `pageSize` (default: 20) - Items per page
- `category` - Filter by category (optional)
- `search` - Search in product name (optional)
- `onSale` - Filter to only sale items (optional)

**Updated controller:**

```javascript
const getProducts = async (req, res) => {
  try {
    // Extract query parameters
    const { search, category, onSale, page = 1, pageSize = 20 } = req.query;

    // Convert to numbers
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(100, parseInt(pageSize) || 20));
    const skip = (pageNum - 1) * pageSizeNum;

    // Build where clause
    const where = {
      isActive: true,
      Enabled: true  // Only enabled products
    };

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    if (category) {
      where.category = category;
    }

    if (onSale === 'true') {
      where.isOnSale = true;
    }

    // Get total count for pagination
    const total = await prisma.product.count({ where });

    // Fetch paginated products
    const products = await prisma.product.findMany({
      where,
      skip,
      take: pageSizeNum,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const productsWithFormatted = products.map((product) =>
      formatProduct(product, req, false)
    );

    return res.status(200).json({
      success: true,
      products: productsWithFormatted,
      pagination: {
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
        hasNextPage: pageNum < Math.ceil(total / pageSizeNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (err) {
    console.error('[PRODUCTS FETCH ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error while fetching products',
    });
  }
};
```

### New Endpoint: Get Categories (for filter UI)

```javascript
const getCategories = async (req, res) => {
  try {
    const categories = await prisma.product.findMany({
      where: {
        isActive: true,
        Enabled: true,
        category: { not: null }
      },
      distinct: ['category'],
      select: { category: true }
    });

    const categoryList = categories
      .map(c => c.category)
      .filter(Boolean)
      .sort();

    return res.status(200).json({
      success: true,
      categories: categoryList,
      total: categoryList.length
    });
  } catch (err) {
    console.error('[CATEGORIES FETCH ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error while fetching categories',
    });
  }
};
```

### New Endpoint: Toggle Product Visibility (Admin)

```javascript
const toggleProductEnabled = async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const product = await prisma.product.update({
      where: { id: parseInt(id) },
      data: { Enabled: Boolean(enabled) }
    });

    console.log(`[PRODUCT VISIBILITY] Product ${product.name} set to Enabled: ${product.Enabled}`);

    return res.status(200).json({
      success: true,
      message: `Product ${enabled ? 'enabled' : 'disabled'}`,
      product: formatProduct(product, req, false)
    });
  } catch (err) {
    console.error('[PRODUCT VISIBILITY ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error while updating product visibility',
    });
  }
};
```

### Update Routes

```javascript
// GET /api/products - Get all products with pagination & filters
router.get('/', getProducts);

// GET /api/products/categories - Get list of categories
router.get('/categories', getCategories);

// PUT /api/products/:id/visibility - Toggle product enabled/disabled (ADMIN)
router.put(
  '/:id/visibility',
  verifyTokenMiddleware,
  verifyAdmin,
  toggleProductEnabled
);
```

---

## Phase 3: Frontend Implementation

### React Example: Product List with Pagination & Filtering

```jsx
import { useState, useEffect } from 'react';

export function ProductsList() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  // Fetch products when filters or page changes
  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, search, currentPage, pageSize]);

  async function fetchCategories() {
    try {
      const res = await fetch('/api/products/categories');
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }

  async function fetchProducts() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage,
        pageSize: pageSize,
        ...(selectedCategory && { category: selectedCategory }),
        ...(search && { search: search })
      });

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      
      setProducts(data.products || []);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Error fetching products:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleCategoryChange(category) {
    setSelectedCategory(category === selectedCategory ? null : category);
    setCurrentPage(1); // Reset to first page
  }

  function handleSearchChange(e) {
    setSearch(e.target.value);
    setCurrentPage(1); // Reset to first page
  }

  function handleNextPage() {
    if (pagination?.hasNextPage) {
      setCurrentPage(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  }

  function handlePrevPage() {
    if (pagination?.hasPrevPage) {
      setCurrentPage(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  }

  return (
    <div className="products-container">
      {/* Search Bar */}
      <div className="search-section">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={handleSearchChange}
          className="search-input"
        />
      </div>

      {/* Category Filter */}
      <div className="filter-section">
        <div className="filter-label">Categories:</div>
        <div className="category-buttons">
          <button
            className={`category-btn ${!selectedCategory ? 'active' : ''}`}
            onClick={() => handleCategoryChange(null)}
          >
            All Products
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="loading">Loading products...</div>
      ) : (
        <>
          <div className="products-grid">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {products.length === 0 && (
            <div className="no-products">No products found</div>
          )}
        </>
      )}

      {/* Pagination Controls */}
      {pagination && (
        <div className="pagination">
          <button
            onClick={handlePrevPage}
            disabled={!pagination.hasPrevPage}
            className="pagination-btn"
          >
            ← Previous
          </button>
          
          <span className="pagination-info">
            Page {pagination.page} of {pagination.totalPages}
            ({pagination.total} total products)
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={!pagination.hasNextPage}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 4: Admin Dashboard

### Toggle Product Visibility

```javascript
async function toggleProductVisibility(productId, enabled) {
  try {
    const res = await fetch(`/api/products/${productId}/visibility`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled })
    });

    const data = await res.json();
    
    if (data.success) {
      alert(`Product ${enabled ? 'enabled' : 'disabled'}`);
      // Refresh product list
      fetchProducts();
    }
  } catch (err) {
    console.error('Error toggling visibility:', err);
  }
}
```

---

## Testing Checklist

- [ ] Filter by category persists while navigating pages
- [ ] Search works with pagination
- [ ] Clear filter shows all products
- [ ] Pagination correctly shows total count
- [ ] Admin can disable a product
- [ ] Disabled products don't appear on website
- [ ] Disabled products still appear in admin dashboard
- [ ] Page loads correctly after reload
- [ ] Sync from POS doesn't re-enable manually disabled products

---

## Performance Notes

- Use server-side pagination to handle 1000+ products efficiently
- Index `Enabled` and `category` columns
- Cache categories list (changes infrequently)
- Limit max pageSize to 100 to prevent abuse
- Use pagination in POS sync too
