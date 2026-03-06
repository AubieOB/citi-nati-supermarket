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
