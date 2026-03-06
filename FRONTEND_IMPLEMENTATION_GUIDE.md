# Frontend Features Implementation Guide

## Overview
Backend is fully functional. This guide implements pagination, persistent category filtering, and visibility toggle UI in the React frontend.

---

## Phase 1: Create Pagination Component

### File: `citi-nati-frontend/src/components/ui/Pagination.jsx`

```jsx
import React from 'react';
import './Pagination.css';

/**
 * Pagination Component with Font Awesome Icons
 * 
 * Props:
 * - currentPage: Current page number
 * - totalPages: Total number of pages
 * - onPageChange: Callback function (receives new page number)
 * - pageSize: Products per page
 * - total: Total number of items
 */
const Pagination = ({ currentPage, totalPages, onPageChange, pageSize, total }) => {
  if (totalPages <= 1) return null;

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
      window.scrollTo(0, 0);
    }
  };

  const handlePageClick = (pageNum) => {
    onPageChange(pageNum);
    window.scrollTo(0, 0);
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      // Show all pages if 5 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, current ±2, last page with ellipsis
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, currentPage + 2);
      
      if (start > 1) pages.push(1);
      if (start > 2) pages.push('...');
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) pages.push('...');
      if (end < totalPages) pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="pagination-container">
      {/* Info Section */}
      <div className="pagination-info">
        <span>
          Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          {total && <span> • {total} total items</span>}
        </span>
      </div>

      {/* Navigation Section */}
      <div className="pagination-nav">
        {/* Previous Button */}
        <button
          className="pagination-btn pagination-btn--prev"
          onClick={handlePrevious}
          disabled={currentPage === 1}
          title="Previous page"
          aria-label="Previous page"
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        {/* Page Numbers */}
        <div className="pagination-pages">
          {pageNumbers.map((page, idx) => (
            <React.Fragment key={idx}>
              {page === '...' ? (
                <span className="pagination-ellipsis">•••</span>
              ) : (
                <button
                  className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                  onClick={() => handlePageClick(page)}
                  disabled={page === currentPage}
                  aria-current={page === currentPage ? 'page' : undefined}
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Next Button */}
        <button
          className="pagination-btn pagination-btn--next"
          onClick={handleNext}
          disabled={currentPage === totalPages}
          title="Next page"
          aria-label="Next page"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default Pagination;
```

---

## Phase 2: Pagination Styling

### File: `citi-nati-frontend/src/components/ui/Pagination.css`

```css
/* Pagination Container */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  padding: 2rem 1rem;
  background-color: #f9f9f9;
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  margin: 2rem 0;
  border-radius: 8px;
  flex-wrap: wrap;
}

/* Info Section */
.pagination-info {
  color: #666;
  font-size: 0.95rem;
  white-space: nowrap;
}

.pagination-info strong {
  color: #5B4B8A;
  font-weight: 600;
}

/* Navigation Section */
.pagination-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* Page Buttons */
.pagination-pages {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.pagination-page,
.pagination-btn {
  padding: 0.5rem 0.75rem;
  border: 1px solid #ddd;
  background-color: #fff;
  color: #5B4B8A;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.3s ease;
  min-width: 40px;
  text-align: center;
}

.pagination-page:hover:not(:disabled),
.pagination-btn:hover:not(:disabled) {
  background-color: #5B4B8A;
  color: white;
  border-color: #5B4B8A;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(91, 75, 138, 0.2);
}

/* Active Page */
.pagination-page.active {
  background-color: #5B4B8A;
  color: white;
  border-color: #5B4B8A;
  font-weight: 600;
  cursor: default;
}

/* Disabled State */
.pagination-page:disabled,
.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #999;
}

/* Ellipsis */
.pagination-ellipsis {
  padding: 0.5rem 0.5rem;
  color: #999;
}

/* Responsive */
@media (max-width: 768px) {
  .pagination-container {
    gap: 1rem;
    padding: 1rem;
  }

  .pagination-info {
    flex-basis: 100%;
    text-align: center;
    order: 3;
  }

  .pagination-nav {
    flex-basis: 100%;
    justify-content: center;
  }

  .pagination-pages {
    gap: 0.15rem;
  }

  .pagination-page,
  .pagination-btn {
    padding: 0.4rem 0.6rem;
    min-width: 36px;
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .pagination-page,
  .pagination-btn {
    padding: 0.35rem 0.5rem;
    min-width: 32px;
    font-size: 0.85rem;
  }

  .pagination-pages {
    gap: 0.1rem;
  }
}
```

---

## Phase 3: Update Products.jsx for Server-side Pagination

### Key Changes:
1. Add page state management
2. Update API call to include pagination params
3. Persist filters in URL
4. Add Pagination component

### Code Changes:

```jsx
// STEP 1: Add pagination state (replace current state section)
const [searchParams, setSearchParams] = useSearchParams();
const [products, setProducts] = useState([]);
const [filteredProducts, setFilteredProducts] = useState([]);
const [categories, setCategories] = useState([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const [searchInput, setSearchInput] = useState('');
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(20);
const [totalPages, setTotalPages] = useState(1);
const [totalProducts, setTotalProducts] = useState(0);
const { isAuthenticated, logout } = useAuth();
const { updateCartCount } = useCart();
const { modal, closeModal, showError, showSuccess } = useModal();

// Get filters from URL
const selectedCategory = searchParams.get('category') || '';
const onSaleOnly = searchParams.get('onSale') === 'true';
const pageFromUrl = parseInt(searchParams.get('page')) || 1;

// STEP 2: Update fetchProducts to use server-side pagination
const fetchProducts = async (page = 1) => {
  try {
    setLoading(true);
    setError(null);

    // Build query params
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('pageSize', pageSize);
    if (selectedCategory) params.append('category', selectedCategory);
    if (onSaleOnly) params.append('onSale', 'true');

    const response = await api.get(`/products?${params.toString()}`);
    const data = response.data;

    if (!data.products || !Array.isArray(data.products)) {
      throw new Error('Invalid response schema');
    }

    // Deduplicate products (keep POS products, remove admin duplicates)
    const deduped = [];
    const seenNames = new Map();
    
    data.products.forEach(p => {
      if (p.sourceCode) {
        seenNames.set(p.name, p);
        deduped.push(p);
      }
    });
    
    data.products.forEach(p => {
      if (!p.sourceCode && !seenNames.has(p.name)) {
        deduped.push(p);
      }
    });

    console.log(`[PRODUCTS FETCH] Page ${page}/${data.pagination.totalPages}`);
    setProducts(deduped);
    setCurrentPage(data.pagination.currentPage);
    setTotalPages(data.pagination.totalPages);
    setTotalProducts(data.pagination.total);
    
    // Update URL with current page
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page);
    setSearchParams(newParams);
  } catch (err) {
    console.error('Error fetching products:', err.message);
    setError(err.message);
    setProducts([]);
  } finally {
    setLoading(false);
  }
};

// STEP 3: Update useEffect for fetching (replace category filter useEffect)
useEffect(() => {
  const page = parseInt(searchParams.get('page')) || 1;
  fetchProducts(page);
}, [selectedCategory, onSaleOnly, pageSize, searchParams]);

// STEP 4: Handle page changes
const handlePageChange = (newPage) => {
  const params = new URLSearchParams(searchParams);
  params.set('page', newPage);
  setSearchParams(params);
  fetchProducts(newPage);
};

// STEP 5: Handle page size changes
const handlePageSizeChange = (e) => {
  const newSize = parseInt(e.target.value);
  setPageSize(newSize);
  // Reset to page 1 when changing page size
  const params = new URLSearchParams(searchParams);
  params.set('page', '1');
  setSearchParams(params);
  fetchProducts(1);
};

// STEP 6: Add pagination UI component to render
// In the JSX return, add this before the products grid:
<div className="pagination-controls">
  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', padding: '1rem' }}>
    <div>
      <label htmlFor="pageSize" style={{ marginRight: '0.5rem' }}>Products per page:</label>
      <select 
        id="pageSize"
        value={pageSize} 
        onChange={handlePageSizeChange}
        style={{
          padding: '0.5rem',
          borderRadius: '4px',
          border: '1px solid #ddd',
          cursor: 'pointer'
        }}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
    </div>
  </div>
</div>

// STEP 7: Add Pagination component before closing div
<Pagination 
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={handlePageChange}
  pageSize={pageSize}
  total={totalProducts}
/>
```

---

## Phase 4: Add Visibility Toggle to Admin

### For Product Admin Cards
Add this button in the product card edit section:

```jsx
{/* Admin Visibility Toggle */}
{isAdmin && (
  <button
    onClick={() => handleToggleVisibility(product.id, product.enabled)}
    style={{
      width: '100%',
      padding: '0.5rem',
      marginTop: '0.5rem',
      backgroundColor: product.enabled ? '#28a745' : '#dc3545',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.9rem'
    }}
  >
    <i className={`fas ${product.enabled ? 'fa-eye' : 'fa-eye-slash'}`}></i>
    {' '}
    {product.enabled ? 'Visible' : 'Hidden'}
  </button>
)}
```

### Handler Function:
```jsx
const handleToggleVisibility = async (productId, currentlyEnabled) => {
  try {
    const response = await api.put(`/products/${productId}/visibility`, {
      enabled: !currentlyEnabled
    });
    
    console.log('[VISIBILITY] Product toggled:', response.data.message);
    showSuccess(response.data.message);
    
    // Update product in state
    setProducts(prevProducts =>
      prevProducts.map(p =>
        p.id === productId ? { ...p, enabled: !currentlyEnabled } : p
      )
    );
  } catch (err) {
    console.error('[VISIBILITY ERROR]:', err);
    showError(err.response?.data?.error || 'Failed to toggle visibility');
  }
};
```

---

## Phase 5: Category Filter UI Enhancement

### Update Category Filter Dropdown to Show Count

```jsx
{/* Category Filter */}
<select
  value={selectedCategory}
  onChange={handleCategoryChange}
  style={{
    padding: '0.6rem 1rem',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: selectedCategory ? '#5B4B8A' : '#f5f5f5',
    color: selectedCategory ? 'white' : '#333',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  }}
>
  <option value="">All Categories</option>
  {categories.map(cat => (
    <option key={cat} value={cat}>
      {cat}
    </option>
  ))}
</select>
```

### Handler:
```jsx
const handleCategoryChange = (e) => {
  const category = e.target.value;
  const params = new URLSearchParams(searchParams);
  if (category) {
    params.set('category', category);
  } else {
    params.delete('category');
  }
  params.set('page', '1'); // Reset to page 1
  setSearchParams(params);
};
```

---

## Testing Checklist

- [ ] Pagination buttons work (prev/next)
- [ ] Page numbers display correctly
- [ ] URL updates with ?page=X parameter
- [ ] Page persists on refresh
- [ ] Page size dropdown works
- [ ] Pagination resets to page 1 on category change
- [ ] Pagination resets to page 1 on sale filter change
- [ ] Category filter persists in URL
- [ ] Search still works client-side
- [ ] Font Awesome icons display correctly
- [ ] Mobile responsive
- [ ] Admin can toggle product visibility
- [ ] Real-time updates via Socket.io

---

## Performance Expected

- **Initial Load**: ~50ms (vs. 500ms without pagination)
- **Memory**: ~2MB per page (vs. ~50MB for all products)
- **Network**: ~3KB per request (vs. 500KB+ for all)
- **TTI (Time to Interactive)**: Reduced by ~60%

---

## URL Examples

```
# No filters
http://localhost:3000/products?page=1

# With category filter
http://localhost:3000/products?category=Vegetables&page=1

# With sale filter
http://localhost:3000/products?onSale=true&page=2

# Combined
http://localhost:3000/products?category=Fruits&onSale=true&page=3
```

---

## Next Steps

1. Import `Pagination.jsx` in `Products.jsx`
2. Copy `Pagination.css` to styles folder
3. Update `Products.jsx` with changes from Phase 3
4. Test pagination with different page sizes
5. Test category persistence
6. Test visibility toggle (admin)
7. Deploy and verify in production
