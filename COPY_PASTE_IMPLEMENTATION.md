# Quick Implementation - Copy & Paste Code

This file contains all the code you need to copy and paste into your project.

---

## File 1: src/components/ui/Pagination.jsx

**Location**: `citi-nati-frontend/src/components/ui/Pagination.jsx`

Create this new file with the following content:

```jsx
import React from 'react';
import './Pagination.css';

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

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
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
      <div className="pagination-info">
        <span>
          Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          {total && <span> • {total} total items</span>}
        </span>
      </div>

      <div className="pagination-nav">
        <button
          className="pagination-btn pagination-btn--prev"
          onClick={handlePrevious}
          disabled={currentPage === 1}
          title="Previous page"
        >
          <i className="fas fa-chevron-left"></i>
        </button>

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
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          className="pagination-btn pagination-btn--next"
          onClick={handleNext}
          disabled={currentPage === totalPages}
          title="Next page"
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

## File 2: src/components/ui/Pagination.css

**Location**: `citi-nati-frontend/src/components/ui/Pagination.css`

Create this new file with the following content:

```css
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

.pagination-info {
  color: #666;
  font-size: 0.95rem;
  white-space: nowrap;
}

.pagination-info strong {
  color: #5B4B8A;
  font-weight: 600;
}

.pagination-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

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

.pagination-page.active {
  background-color: #5B4B8A;
  color: white;
  border-color: #5B4B8A;
  font-weight: 600;
  cursor: default;
}

.pagination-page:disabled,
.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: #999;
}

.pagination-ellipsis {
  padding: 0.5rem 0.5rem;
  color: #999;
}

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

## File 3: Update Products.jsx - Import Statement

Add this at the top of `src/pages/public/Products.jsx`:

```jsx
import Pagination from '../../components/ui/Pagination.jsx';
```

---

## File 4: Update Products.jsx - State Management

Replace the state initialization section with this:

```jsx
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

const selectedCategory = searchParams.get('category') || '';
const onSaleOnly = searchParams.get('onSale') === 'true';
```

---

## File 5: Update Products.jsx - fetchProducts Function

Replace the existing `fetchProducts` function with:

```jsx
const fetchProducts = async (page = 1) => {
  try {
    setLoading(true);
    setError(null);

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

    console.log(`[PRODUCTS FETCH] Page ${page}/${data.pagination?.totalPages || 1}`);
    setProducts(deduped);
    
    if (data.pagination) {
      setCurrentPage(data.pagination.currentPage);
      setTotalPages(data.pagination.totalPages);
      setTotalProducts(data.pagination.total);
    }
    
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
```

---

## File 6: Update Products.jsx - useEffect for Fetching

Replace the existing category/promotion filter useEffect with:

```jsx
useEffect(() => {
  const page = parseInt(searchParams.get('page')) || 1;
  fetchProducts(page);
}, [selectedCategory, onSaleOnly, pageSize, searchParams]);
```

---

## File 7: Update Products.jsx - New Handlers

Add these new handler functions:

```jsx
const handlePageChange = (newPage) => {
  const params = new URLSearchParams(searchParams);
  params.set('page', newPage);
  setSearchParams(params);
  fetchProducts(newPage);
};

const handlePageSizeChange = (e) => {
  const newSize = parseInt(e.target.value);
  setPageSize(newSize);
  const params = new URLSearchParams(searchParams);
  params.set('page', '1');
  setSearchParams(params);
  fetchProducts(1);
};

const handleCategoryChange = (e) => {
  const category = e.target.value;
  const params = new URLSearchParams(searchParams);
  if (category) {
    params.set('category', category);
  } else {
    params.delete('category');
  }
  params.set('page', '1');
  setSearchParams(params);
};
```

---

## File 8: Update Products.jsx - Add Pagination UI

Before the closing `</div>` of the products grid, add this:

```jsx
<Pagination 
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={handlePageChange}
  pageSize={pageSize}
  total={totalProducts}
/>
```

---

## File 9: Update Products.jsx - Add Page Size Selector

Add this in the filters section (after search box):

```jsx
<div style={{ 
  flex: '0 0 auto',
  minWidth: '140px'
}}>
  <label htmlFor="pageSize" style={{ 
    marginRight: '0.5rem',
    fontSize: '0.9rem',
    color: '#666'
  }}>
    Per page:
  </label>
  <select 
    id="pageSize"
    value={pageSize} 
    onChange={handlePageSizeChange}
    style={{
      padding: '0.6rem 0.8rem',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: '#f5f5f5',
      cursor: 'pointer',
      fontSize: '0.95rem'
    }}
  >
    <option value={10}>10</option>
    <option value={20}>20</option>
    <option value={50}>50</option>
    <option value={100}>100</option>
  </select>
</div>
```

---

## File 10: Update Products.jsx - Update Category Filter

Find the category filter dropdown and update it to:

```jsx
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
    transition: 'all 0.3s ease',
    flex: '0 0 auto'
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

---

## Summary of Changes

| File | Change | Lines Added |
|------|--------|------------|
| Pagination.jsx | **NEW** | 60 |
| Pagination.css | **NEW** | 120 |
| Products.jsx | Import | 1 |
| Products.jsx | State | 8 |
| Products.jsx | fetchProducts | Updated (25 lines) |
| Products.jsx | useEffect | Updated (1 line) |
| Products.jsx | Handlers | 30 |
| Products.jsx | UI (Pagination) | 5 |
| Products.jsx | UI (Page Size) | 20 |
| Products.jsx | UI (Category) | 5 |

**Total New Code**: ~230 lines  
**Total Modified**: ~60 lines  
**Estimated Time**: 1-2 hours

---

## Testing After Implementation

1. **Test in browser**:
   ```
   http://localhost:3000/products
   ```

2. **Verify pagination works**:
   - Click next button
   - URL should update to `?page=2`
   - Products should change

3. **Verify page size selector**:
   - Change to 50 products
   - Should show 50 products per page
   - Page count should adjust

4. **Verify category filter**:
   - Select a category
   - URL should have `?category=X&page=1`
   - Products should filter

5. **Verify mobile**:
   - Pagination should stack vertically
   - Buttons should be touch-friendly

6. **Check console**:
   - No errors
   - `[PRODUCTS FETCH]` log should show page info

---

## Quick Verification

After implementation, run this in browser console:

```javascript
// Check pagination exists
console.log('Current page:', document.querySelector('.pagination-page.active')?.textContent);

// Check Font Awesome icons
console.log('Icons loaded:', !!document.querySelector('.fas.fa-chevron-left'));

// Check URL params
console.log('URL params:', new URLSearchParams(window.location.search).toString());
```

---

## Done!

Once you've copied and pasted all the code, you're complete! The system will:

✅ Show paginated products (20 per page default)  
✅ Allow page size selection  
✅ Persist filters in URL  
✅ Show pagination info and navigation  
✅ Use Font Awesome icons  
✅ Be fully responsive  
✅ Support real-time updates  

**Estimated Implementation Time**: 1-2 hours  
**Testing Time**: 30 minutes  
**Total**: 2.5 hours
