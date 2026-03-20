import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { getSocket } from '../../utils/socket.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import Pagination from '../ui/Pagination.jsx';
import { generateAdminProductsTablePDF, generateExpiryAlertsPDF } from '../../utils/pdfReports.js';

/**
 * 📦 ADMIN PRODUCTS MANAGEMENT - ENHANCED
 * 
 * Features:
 * - Create, Read, Update, Delete products
 * - Pricing tiers: base price, original price, discount price
 * - Expiry date tracking with smart alerts
 * - Automated discount suggestions for expiring products
 * - Sale status management
 */

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const formSectionRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    originalPrice: '',
    discountPrice: '',
    stock: '',
    category: '',
    expiryDate: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter and search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('products'); // 'products' or 'expiry-alerts'
  const [posExpiryItems, setPosExpiryItems] = useState([]);
  const [posExpiryLoading, setPosExpiryLoading] = useState(false);
  const [posExpiryError, setPosExpiryError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExpiryPdf, setIsExportingExpiryPdf] = useState(false);
  const [isVoiceSearchEnabled, setIsVoiceSearchEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const [expandedBatchRows, setExpandedBatchRows] = useState({});
  const [expiryAlertCategory, setExpiryAlertCategory] = useState('');
  const [expiryAlertStockFilter, setExpiryAlertStockFilter] = useState('all');
  const pageSize = 20;
  const searchTimeoutRef = useRef(null);
  const recognitionRef = useRef(null);
  const voiceEnabledRef = useRef(false);
  const filterBarRef = useRef(null);
  const { modal, closeModal, showConfirm, showError, showSuccess } = useModal();

  const voiceDigitMap = {
    zero: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    oh: '0'
  };

  const normalizeVoiceSearchText = (text) => {
    if (!text) return '';

    const cleanedText = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim();

    const tokens = cleanedText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return text;

    const numericTokenCount = tokens.filter(token =>
      /^\d+$/.test(token) ||
      Object.prototype.hasOwnProperty.call(voiceDigitMap, token) ||
      token === 'double' ||
      token === 'triple' ||
      token === 'dash' ||
      token === 'hyphen'
    ).length;

    const shouldConvertToDigits = numericTokenCount >= 2 && (numericTokenCount / tokens.length) >= 0.8;
    if (!shouldConvertToDigits) return text;

    const digits = [];

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];

      if (/^\d+$/.test(token)) {
        digits.push(token);
        continue;
      }

      if (token === 'double' || token === 'triple') {
        const nextToken = tokens[i + 1];
        const mappedDigit = voiceDigitMap[nextToken] || (/^\d+$/.test(nextToken || '') ? nextToken : null);

        if (mappedDigit) {
          digits.push(token === 'double' ? mappedDigit.repeat(2) : mappedDigit.repeat(3));
          i += 1;
        }
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(voiceDigitMap, token)) {
        digits.push(voiceDigitMap[token]);
      }
    }

    return digits.length > 0 ? digits.join('') : text;
  };

  const toNumberOrNull = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getDaysUntil = (dateValue) => {
    if (!dateValue) return null;
    const target = new Date(dateValue);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    return Math.ceil((target.getTime() - now.getTime()) / dayMs);
  };

  const formatExpiryDate = (value) => {
    if (!value) return 'No expiry date';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'No expiry date';
    return parsed.toLocaleDateString('en-GB');
  };

  const getExpiryBatchStatus = (expiryDate) => {
    const daysRemaining = getDaysUntil(expiryDate);

    if (daysRemaining == null) {
      return {
        label: 'Date available',
        tone: '#6b7280',
        background: '#f3f4f6',
        daysRemaining: null,
      };
    }

    if (daysRemaining < 0) {
      return {
        label: 'Expired',
        tone: '#991b1b',
        background: '#fee2e2',
        daysRemaining,
      };
    }

    if (daysRemaining <= 14) {
      return {
        label: `Expiring in ${daysRemaining}d`,
        tone: '#92400e',
        background: '#fef3c7',
        daysRemaining,
      };
    }

    if (daysRemaining <= 30) {
      return {
        label: `Near expiry (${daysRemaining}d)`,
        tone: '#0c5460',
        background: '#dbeafe',
        daysRemaining,
      };
    }

    return {
      label: `Fresh (${daysRemaining}d)`,
      tone: '#166534',
      background: '#dcfce7',
      daysRemaining,
    };
  };

  const normalizeProductExpiryBatches = (batches) => {
    if (!Array.isArray(batches)) return [];

    return batches
      .map((batch) => {
        const remainingQty = toNumberOrNull(batch?.remainingQty);
        const expiryDate = batch?.expiryDate || null;
        const parsed = expiryDate ? new Date(expiryDate) : null;

        if (!parsed || Number.isNaN(parsed.getTime()) || remainingQty == null || remainingQty <= 0) {
          return null;
        }

        return {
          expiryDate,
          remainingQty,
          stockDetailId: batch?.stockDetailId || null,
          grnNo: batch?.grnNo || null,
          batchNo: batch?.batchNo || null,
          locationCode: batch?.locationCode || null,
          timestamp: parsed.getTime(),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.timestamp - right.timestamp);
  };

  const getDefaultBatchForProduct = (product) => {
    const batches = normalizeProductExpiryBatches(product?.expiryBatches);
    return batches.length > 0 ? batches[0] : null;
  };

  const formatBatchIdentity = (batch, batchIndex) => {
    if (batch?.grnNo && batch?.stockDetailId) {
      return `GRN ${batch.grnNo} / SD ${batch.stockDetailId}`;
    }
    if (batch?.grnNo) {
      return `GRN ${batch.grnNo}`;
    }
    if (batch?.stockDetailId) {
      return `Stock Detail ${batch.stockDetailId}`;
    }
    if (batch?.batchNo) {
      return `Batch ${batch.batchNo}`;
    }
    return `Batch ${batchIndex + 1}`;
  };

  const getProductBatchTotalQty = (product) => {
    const batches = normalizeProductExpiryBatches(product?.expiryBatches);
    if (batches.length === 0) {
      return toNumberOrNull(product?.stock) ?? 0;
    }

    return batches.reduce((sum, batch) => sum + (batch.remainingQty || 0), 0);
  };

  const getStockBucket = (qty) => {
    const normalizedQty = Number(qty || 0);
    if (normalizedQty <= 0) return 'out-of-stock';
    if (normalizedQty <= 20) return 'low-stock';
    return 'in-stock';
  };

  const getStockBucketLabel = (bucket) => {
    if (bucket === 'out-of-stock') return 'Out of Stock';
    if (bucket === 'low-stock') return 'Low Stock';
    return 'In Stock';
  };

  const mapPosExpiryToAlert = (row) => {
    const expiryDateValue = row?.expiryDate || row?.ExpiryDate || null;
    const daysRemaining = getDaysUntil(expiryDateValue);
    const qty = toNumberOrNull(row?.remainingQty ?? row?.RemainingQty ?? row?.stockBalance ?? row?.StockBalance);
    const isExpired = daysRemaining != null && daysRemaining < 0;
    const isUrgent = daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 14;
    const productCode = row?.productCode || row?.ProductCode || '';
    const productName = row?.productName || row?.ProductName || productCode || 'Unknown Product';
    const stockDetailId = row?.stockDetailId || row?.StockDetailID || null;
    const grnNo = row?.grnNo || row?.GRNNo || null;
    const batchNo = row?.batchNo || grnNo || stockDetailId || null;

    return {
      key: `${productCode || 'UNKNOWN'}-${expiryDateValue || ''}-${batchNo || ''}`,
      productCode,
      name: productName,
      category: row?.category || row?.Category || 'Uncategorized',
      message: isExpired
        ? 'Already expired in POS stock'
        : daysRemaining == null
          ? 'Expiry date available in POS'
          : `Expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
      isExpired,
      isUrgent,
      remainingQty: qty,
      expiryDate: expiryDateValue,
      stockDetailId,
      grnNo,
      batchNo,
      daysToExpiry: daysRemaining,
    };
  };

  const getExpirySeverity = (product) => {
    const status = product?.expiryStatus?.status;

    if (status === 'expired') return 0;
    if (status === 'expiring_soon' || status === '1_week_warning' || status === '2_weeks_warning') return 1;
    if (status === 'near_expiry' || status === '1_month_warning' || status === '2_months_warning') return 2;
    if (status) return 3;
    if (product?.expiryDate) return 4;
    return 5;
  };

  const getExpiryBadge = (product) => {
    const status = product?.expiryStatus?.status;
    const label = product?.expiryStatus?.label;
    const daysToExpiry = product?.daysToExpiry ?? product?.expiryStatus?.daysRemaining ?? null;
    const batchCount = Number(product?.expiryBatchCount ?? 0);
    const withBatchCount = (baseLabel) => {
      if (batchCount > 1) {
        return `${baseLabel} (${batchCount} batches)`;
      }
      return baseLabel;
    };

    if (status === 'expired') {
      return {
        label: withBatchCount(label || 'Expired'),
        backgroundColor: '#f8d7da',
        color: '#721c24',
        icon: 'fas fa-times-circle',
      };
    }

    if (status === 'expiring_soon' || status === '1_week_warning' || status === '2_weeks_warning') {
      return {
        label: withBatchCount(label || (daysToExpiry != null ? `Expiring Soon (${daysToExpiry}d)` : 'Expiring Soon')),
        backgroundColor: '#fff3cd',
        color: '#856404',
        icon: 'fas fa-exclamation-triangle',
      };
    }

    if (status === 'near_expiry' || status === '1_month_warning' || status === '2_months_warning') {
      return {
        label: withBatchCount(label || 'Near Expiry'),
        backgroundColor: '#e8f4fd',
        color: '#0c5460',
        icon: 'fas fa-clock',
      };
    }

    return null;
  };

  const fetchPosExpiryAlerts = async () => {
    try {
      setPosExpiryLoading(true);
      setPosExpiryError('');
      const response = await api.get('/admin/expiry-batches');
      const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
      setPosExpiryItems(rows.map(mapPosExpiryToAlert));
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Failed to load expiry batches';
      setPosExpiryError(message);
      setPosExpiryItems([]);
    } finally {
      setPosExpiryLoading(false);
    }
  };

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'expiry-alerts') {
      fetchPosExpiryAlerts();
    }
  }, [activeSubTab]);

  useEffect(() => {
    voiceEnabledRef.current = isVoiceSearchEnabled;
  }, [isVoiceSearchEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .slice(event.resultIndex)
        .map(result => result[0]?.transcript || '')
        .join(' ')
        .trim();

      if (!spokenText) return;
      const normalizedVoiceSearch = normalizeVoiceSearchText(spokenText);
      setSearchTerm(normalizedVoiceSearch);
      setCurrentPage(1);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsVoiceSearchEnabled(false);
        setIsListening(false);
        showError('Microphone access denied', 'Please allow microphone access to use voice search.');
      }
    };

    recognition.onend = () => {
      if (!voiceEnabledRef.current) {
        setIsListening(false);
        return;
      }

      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.warn('[AdminProducts] Voice recognition restart failed:', err.message);
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch (err) {
        console.warn('[AdminProducts] Voice recognition stop failed:', err.message);
      }
      recognitionRef.current = null;
    };
  }, [showError]);

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isVoiceSearchEnabled) {
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.warn('[AdminProducts] Voice recognition start failed:', err.message);
      }
    } else {
      try {
        recognition.stop();
      } catch (err) {
        console.warn('[AdminProducts] Voice recognition stop failed:', err.message);
      }
      setIsListening(false);
    }
  }, [isVoiceSearchEnabled]);

  /**
   * Listen for real-time product updates from admin changes
   * Updates product list immediately when any product is modified
   */
  useEffect(() => {
    try {
      const socket = getSocket();
      
      if (!socket) {
        console.log('[AdminProducts] Socket not available yet');
        return;
      }

      const handleProductUpdate = (updatedProduct) => {
        console.log('[AdminProducts] 🔄 Product update received:', updatedProduct.name);
        
        // If product is now hidden, remove it from the admin view
        if (updatedProduct.hideFromProductsPage) {
          console.log('[AdminProducts] 🙈 Product hidden, removing:', updatedProduct.name);
          setProducts(prevProducts =>
            prevProducts.filter(p => p.id !== updatedProduct.id)
          );
          return;
        }
        
        // Update the products list with complete product details
        setProducts(prevProducts =>
          prevProducts.map(product =>
            product.id === updatedProduct.id
              ? {
                  ...product,
                  name: updatedProduct.name,
                  price: updatedProduct.price,
                  originalPrice: updatedProduct.originalPrice,
                  discountPrice: updatedProduct.discountPrice,
                  finalPrice: updatedProduct.finalPrice,
                  isOnSale: updatedProduct.isOnSale,
                  stock: updatedProduct.stock,
                  category: updatedProduct.category,
                  image: updatedProduct.image,
                  expiryDate: updatedProduct.expiryDate,
                  expiryStatus: updatedProduct.expiryStatus,
                  expiryBatchCount: Number(updatedProduct.expiryBatchCount ?? product.expiryBatchCount ?? 0),
                  expiryBatches: Array.isArray(updatedProduct.expiryBatches) ? updatedProduct.expiryBatches : (product.expiryBatches || []),
                  hideFromProductsPage: updatedProduct.hideFromProductsPage || false,
                  updatedAt: updatedProduct.updatedAt,
                }
              : product
          )
        );
      };

      // Listen for comprehensive product updates
      socket.on('product_updated', handleProductUpdate);
      console.log('[AdminProducts] 🔌 Socket listener attached for product_updated events');

      // Cleanup: remove listener on component unmount
      return () => {
        socket.off('product_updated', handleProductUpdate);
        console.log('[AdminProducts] 🔌 Socket listener removed');
      };
    } catch (err) {
      console.warn('[AdminProducts] Error setting up product update listener:', err.message);
    }
  }, []);

  const fetchProducts = async () => {
    try {
      setError(null);

      // Load first page immediately (limit 100 per page)
      let page = 1;
      const perPage = 100;
      let all = [];
      let usePosExpiry = true;

      const fetchProductsPage = async (pageNumber) => {
        const basePath = `/products?page=${pageNumber}&pageSize=${perPage}`;
        const shouldUseExpiryEnrichment = usePosExpiry && pageNumber === 1;

        if (shouldUseExpiryEnrichment) {
          try {
            return await api.get(`${basePath}&includePosExpiry=true`);
          } catch (posExpiryErr) {
            console.warn('[ADMIN PRODUCTS UI] includePosExpiry request failed, retrying without enrichment', posExpiryErr?.response?.data || posExpiryErr.message);
            usePosExpiry = false;
          }
        }

        return api.get(basePath);
      };

      const normalizeAdminPosProduct = (product) => ({
        id: product.id,
        name: product.name,
        sourceCode: product.sourceCode || null,
        productCode: product.sourceCode || null,
        category: product.category || 'Uncategorized',
        price: Number(product.price || 0),
        stock: Number(product.stock || 0),
        image: product.image || null,
        originalPrice: Number(product.price || 0),
        discountPrice: null,
        isOnSale: false,
        finalPrice: Number(product.price || 0),
        expiryDate: product.expiryDate || null,
        expiryStatus: product.expiryStatus || null,
        daysToExpiry: product.daysToExpiry ?? null,
        expirySource: product.expirySource || null,
        expiryBatchCount: Number(product.expiryBatchCount ?? 0),
        expiryBatches: Array.isArray(product.expiryBatches) ? product.expiryBatches : [],
        hideFromProductsPage: Boolean(product.hideFromProductsPage),
      });

      // Fetch first page to show something immediately
      const firstResp = await fetchProductsPage(page);
      const firstItems = firstResp.data.products || [];

      if (firstItems.length === 0) {
        try {
          console.warn('[ADMIN PRODUCTS UI] /products returned 0; trying /admin/pos-products fallback');
          const adminResp = await api.get('/admin/pos-products?page=1&limit=5000');
          const adminItems = Array.isArray(adminResp?.data?.products)
            ? adminResp.data.products.map(normalizeAdminPosProduct)
            : [];

          console.log('[ADMIN PRODUCTS UI] /admin/pos-products fallback count', adminItems.length);
          all = adminItems;
        } catch (adminFallbackErr) {
          console.warn('[ADMIN PRODUCTS UI] /admin/pos-products fallback failed', adminFallbackErr?.response?.data || adminFallbackErr.message);
          all = firstItems;
        }
      } else {
        all = all.concat(firstItems);
      }

      console.log('[ADMIN PRODUCTS UI] first product row', firstItems[0] || null);
      console.log('[ADMIN PRODUCTS UI] expiry fields received', firstItems.slice(0, 5).map((product) => ({
        id: product.id,
        name: product.name,
        sourceCode: product.sourceCode || null,
        expiryDate: product.expiryDate || null,
        expiryStatus: product.expiryStatus || null,
        daysToExpiry: product.daysToExpiry ?? null,
        expirySource: product.expirySource || null,
      })));

      // Sort by expiry status
      let sorted = all.sort((a, b) => {
        return getExpirySeverity(a) - getExpirySeverity(b);
      });

      setProducts(sorted);
      setLoading(false); // Stop showing loading spinner immediately
      console.log('[AdminProducts] First page loaded:', firstItems.length, 'products');

      // If there are more pages, load them in background without blocking
      if (firstItems.length === perPage) {
        // Load remaining pages in background
        (async () => {
          try {
            page += 1;
            while (true) {
              const resp = await fetchProductsPage(page);
              const items = resp.data.products || [];
              if (items.length === 0) break;
              
              all = all.concat(items);
              
              // Re-sort and update state
              sorted = all.sort((a, b) => {
                return getExpirySeverity(a) - getExpirySeverity(b);
              });
              
              setProducts(sorted);
              console.log('[AdminProducts] Background load: +', items.length, 'products (total:', sorted.length, ')');

              if (items.length < perPage) break;
              page += 1;
            }
            console.log('[AdminProducts] Background load complete. Total:', all.length, 'products');
          } catch (bgErr) {
            console.warn('[AdminProducts] Background loading error:', bgErr.message);
            // Don't show error - UI already has first page
          }
        })();
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err.response?.data?.error || 'Failed to load products');
      setLoading(false);
    }
  };

  // Filter products based on search and filters
  const filteredProducts = products
    .filter(product => !product.hideFromProductsPage) // Hide hidden products
    .filter(product => {
      // Search filter (AND logic - all search terms must match)
      const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(t => t);
      const searchableProductCode = String(product.productCode || product.sourceCode || product.code || '').toLowerCase();
      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => 
        product.name.toLowerCase().includes(term) || 
        product.category.toLowerCase().includes(term) ||
        searchableProductCode.includes(term)
      );

      // Category filter
      const matchesCategory = !selectedCategory || product.category === selectedCategory;

      // Sale filter
      const matchesSale = !onSaleOnly || product.isOnSale;

      return matchesSearch && matchesCategory && matchesSale;
    });

  // Paginate filtered products
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Get unique categories for filter dropdown
  const categories = [...new Set(products.map(p => p.category))].sort();

  const fallbackExpiryAlerts = products
    .filter(p => p.expiryStatus && p.expiryStatus.status)
    .sort((a, b) => {
      return getExpirySeverity(a) - getExpirySeverity(b);
    })
    .map((product) => ({
      key: String(product.id),
      productCode: product.productCode || product.sourceCode || '',
      name: product.name,
      category: product.category || 'Uncategorized',
      message: product.expiryStatus?.label || product.expiryStatus?.message || 'Expiry warning',
      isExpired: product.expiryStatus?.status === 'expired',
      isUrgent: ['expiring_soon', '1_week_warning', '2_weeks_warning'].includes(product.expiryStatus?.status),
      remainingQty: toNumberOrNull(product.stock),
      expiryDate: product.expiryDate || null,
      batchNo: null,
      daysToExpiry: product.daysToExpiry ?? null,
      sourceProduct: product,
    }));

  const expiryAlerts = posExpiryError ? fallbackExpiryAlerts : posExpiryItems;
  const expiryAlertCards = Array.from(
    expiryAlerts.reduce((accumulator, alert) => {
      const key = String(alert.productCode || alert.name || alert.key);
      const current = accumulator.get(key) || {
        key,
        productCode: alert.productCode || '',
        name: alert.name || alert.productCode || 'Unknown Product',
        category: alert.category || 'Uncategorized',
        sourceProduct: alert.sourceProduct || null,
        batches: [],
      };

      current.batches.push({
        key: alert.key,
        expiryDate: alert.expiryDate,
        remainingQty: alert.remainingQty ?? 0,
        batchNo: alert.batchNo || null,
        daysToExpiry: alert.daysToExpiry,
        statusLabel: getExpiryBatchStatus(alert.expiryDate).label,
      });

      if (!current.sourceProduct && alert.sourceProduct) {
        current.sourceProduct = alert.sourceProduct;
      }

      accumulator.set(key, current);
      return accumulator;
    }, new Map()).values()
  )
    .map((card) => {
      const batches = card.batches
        .map((batch) => ({
          ...batch,
          timestamp: batch.expiryDate ? new Date(batch.expiryDate).getTime() : Number.POSITIVE_INFINITY,
        }))
        .sort((left, right) => left.timestamp - right.timestamp);
      const totalQty = batches.reduce((sum, batch) => sum + (Number(batch.remainingQty) || 0), 0);
      const stockBucket = getStockBucket(totalQty);

      return {
        ...card,
        batches,
        totalQty,
        stockBucket,
        stockLabel: getStockBucketLabel(stockBucket),
        isExpired: batches.some((batch) => (batch.daysToExpiry ?? getDaysUntil(batch.expiryDate)) < 0),
        isUrgent: batches.some((batch) => {
          const daysRemaining = batch.daysToExpiry ?? getDaysUntil(batch.expiryDate);
          return daysRemaining != null && daysRemaining >= 0 && daysRemaining <= 14;
        }),
      };
    })
    .sort((left, right) => {
      const leftSoonest = left.batches[0]?.timestamp ?? Number.POSITIVE_INFINITY;
      const rightSoonest = right.batches[0]?.timestamp ?? Number.POSITIVE_INFINITY;
      return leftSoonest - rightSoonest;
    });

  const expiryAlertCategories = [...new Set(expiryAlertCards.map((card) => card.category || 'Uncategorized'))].sort();
  const filteredExpiryAlertCards = expiryAlertCards.filter((card) => {
    const matchesCategory = !expiryAlertCategory || card.category === expiryAlertCategory;
    const matchesStock = expiryAlertStockFilter === 'all' || card.stockBucket === expiryAlertStockFilter;
    return matchesCategory && matchesStock;
  });
  const expiryAlertCount = filteredExpiryAlertCards.length;
  const expiryAlertsSourceCount = expiryAlertCards.length;

  // Handle search with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce the search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      // Search is now applied via filteredProducts
    }, 300);
  };

  const clearSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearchTerm('');
    setCurrentPage(1);
  };

  useEffect(() => {
    const handleRightCtrlClear = (event) => {
      if (event.repeat) return;

      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (activeSubTab !== 'products') return;
      if (!searchTerm) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleRightCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleRightCtrlClear);
    };
  }, [searchTerm, activeSubTab]);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Handle category change
  const handleCategoryChange = (value) => {
    setSelectedCategory(value);
    setCurrentPage(1); // Reset to page 1
  };

  // Handle sale filter change
  const handleSaleFilterChange = (value) => {
    setOnSaleOnly(value);
    setCurrentPage(1); // Reset to page 1
  };

  const toggleBatchRow = (productId) => {
    setExpandedBatchRows((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const handleToggleVoiceSearch = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Voice search unavailable', 'This browser does not support voice recognition. Try Chrome or Edge.');
      return;
    }

    setIsVoiceSearchEnabled(prev => !prev);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = {
        ...prev,
        [name]: value,
      };

      if (name === 'price') {
        const previousOriginal = String(prev.originalPrice || '').trim();
        const previousPrice = String(prev.price || '').trim();
        const isOriginalEmpty = previousOriginal === '';
        const isOriginalFollowingBase = previousOriginal === previousPrice;

        if (isOriginalEmpty || isOriginalFollowingBase) {
          next.originalPrice = value;
        }
      }

      return next;
    });
    if (formError) setFormError('');
  };

  const handleImageChange = (e) => {
    setImageFile(e.target.files[0]);
  };

  const validateForm = () => {
    if (!formData.name?.trim()) return 'Product name is required';
    if (!formData.price || isNaN(parseFloat(formData.price)) || parseFloat(formData.price) < 0) 
      return 'Valid price is required';
    if (!formData.stock === undefined || isNaN(parseInt(formData.stock)) || parseInt(formData.stock) < 0) 
      return 'Valid stock quantity is required';
    if (!formData.category?.trim()) return 'Category is required';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    // Show confirmation modal
    const action = editingId ? 'update' : 'create';
    const productName = formData.name.trim();
    
    showConfirm(
      `${editingId ? 'Update' : 'Create'} Product?`,
      `Are you sure you want to ${editingId ? 'update' : 'create'} the product "${productName}"?`,
      () => {
        // Perform the actual submission when confirmed
        submitProduct();
      }
    );
  };

  const submitProduct = async () => {
    try {
      setIsSubmitting(true);
      setFormError('');

      const formPayload = new FormData();
      formPayload.append('name', formData.name.trim());
      formPayload.append('price', String(parseFloat(formData.price)));
      formPayload.append('stock', String(parseInt(formData.stock)));
      formPayload.append('category', formData.category.trim());
      
      console.log('[ADMIN PRODUCTS] 📋 Submitting product form:', {
        name: formData.name.trim(),
        hasImage: !!imageFile,
        fileName: imageFile?.name,
        fileSize: imageFile?.size
      });
      
      // Optional: expiry date
      if (formData.expiryDate) {
        formPayload.append('expiryDate', formData.expiryDate);
      }
      
      // Optional: original price (for promotions display)
      const resolvedOriginalPrice = formData.originalPrice || formData.price;
      if (resolvedOriginalPrice) {
        formPayload.append('originalPrice', String(parseFloat(resolvedOriginalPrice)));
      }
      
      // Always send discount price (empty string clears it on backend)
      formPayload.append('discountPrice', formData.discountPrice || '');
      
      if (imageFile) {
        formPayload.append('image', imageFile);
        console.log('[ADMIN PRODUCTS] 📸 Image included:', {
          size: imageFile.size,
          type: imageFile.type,
          name: imageFile.name
        });
      } else {
        console.log('[ADMIN PRODUCTS] ⚠️ No image provided - using existing or creating without');
      }

      if (editingId) {
        console.log('[ADMIN PRODUCTS] ✏️ Updating product:', editingId);
        await api.put(`/products/${editingId}`, formPayload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showSuccess('Success', `Product "${formData.name.trim()}" updated successfully`);
      } else {
        console.log('[ADMIN PRODUCTS] ➕ Creating new product');
        await api.post('/products', formPayload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showSuccess('Success', `Product "${formData.name.trim()}" created successfully`);
      }

      console.log('[ADMIN PRODUCTS] ✅ Product saved successfully');
      await fetchProducts();
      resetForm();
    } catch (err) {
      console.error('[ADMIN PRODUCTS] ❌ Error saving product:', err);
      setFormError(err.response?.data?.error || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setFormData({
      name: product.name,
      price: product.price.toString(),
      originalPrice: product.originalPrice?.toString() || product.price?.toString() || '',
      discountPrice: product.discountPrice?.toString() || '',
      stock: String(parseInt(product.stock, 10)),
      category: product.category,
      expiryDate: product.expiryDate ? product.expiryDate.split('T')[0] : '',
    });
    setEditingId(product.id);
    setShowForm(true);
    // Scroll to edit form on next render
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDelete = async (id) => {
    showConfirm(
      'Delete Product?',
      'Are you sure you want to delete this product? This action cannot be undone.',
      async () => {
        try {
          await api.delete(`/products/${id}`);
          await fetchProducts();
          showSuccess('Success', 'Product deleted successfully');
        } catch (err) {
          console.error('Error deleting product:', err);
          showError('Error', err.response?.data?.error || 'Failed to delete product');
        }
      }
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      originalPrice: '',
      discountPrice: '',
      stock: '',
      category: '',
      expiryDate: '',
    });
    setImageFile(null);
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  const handleDownloadProductsPdf = async () => {
    try {
      const productsForPdf = products
        .filter(product => !product.hideFromProductsPage)
        .filter(product => !selectedCategory || product.category === selectedCategory);

      if (productsForPdf.length === 0) {
        showError('No products to export', 'There are no products available for the selected category.');
        return;
      }

      setIsExportingPdf(true);
      await generateAdminProductsTablePDF(productsForPdf, { selectedCategory });
      showSuccess('Success', `PDF downloaded with ${productsForPdf.length} product(s).`);
    } catch (err) {
      console.error('[ADMIN PRODUCTS] PDF export failed:', err);
      showError('PDF export failed', 'Unable to generate products PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadExpiryAlertsPdf = async () => {
    try {
      if (filteredExpiryAlertCards.length === 0) {
        showError('No expiry alerts to export', 'There are no expiry alert cards for the selected filters.');
        return;
      }

      setIsExportingExpiryPdf(true);
      await generateExpiryAlertsPDF(filteredExpiryAlertCards, {
        selectedCategory: expiryAlertCategory,
        selectedStockFilter: expiryAlertStockFilter,
      });
      showSuccess('Success', `PDF downloaded with ${filteredExpiryAlertCards.length} expiry alert card(s).`);
    } catch (err) {
      console.error('[ADMIN PRODUCTS] Expiry alerts PDF export failed:', err);
      showError('PDF export failed', 'Unable to generate expiry alerts PDF. Please try again.');
    } finally {
      setIsExportingExpiryPdf(false);
    }
  };

  return (
    <div>
      {/* Loading Indicator for background pagination */}
      {loading && products.length === 0 && (
        <div style={{backgroundColor: '#e7f3ff', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <i className="fas fa-spinner fa-spin"></i>
          <span>Loading products...</span>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div
          ref={formSectionRef}
          style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginTop: `${filterBarHeight + 8}px`,
            marginBottom: '2rem',
            borderLeft: '4px solid #5B4B8A',
            scrollMarginTop: `${filterBarHeight + 12}px`,
          }}
        >
          <h3 style={{ marginBottom: '1rem', color: '#5B4B8A' }}>
            {editingId ? 'Edit Product' : 'Create New Product'}
          </h3>

          {formError && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '1rem',
              borderRadius: '4px',
              marginBottom: '1rem',
            }}>
              {formError}
            </div>
          )}

          <form 
            onSubmit={handleSubmit} 
            onKeyDown={(e) => {
              // Support Enter key on large screens
              if (e.key === 'Enter' && window.innerWidth >= 768) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            style={{ display: 'grid', gap: '1rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g., Organic Apples"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Category *
                </label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  placeholder="e.g., Fruits"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Base Price (MWK) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleFormChange}
                  placeholder="5000"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Original Price (Optional)
                </label>
                <input
                  type="number"
                  name="originalPrice"
                  value={formData.originalPrice}
                  onChange={handleFormChange}
                  placeholder="For display"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Discount Price (Optional)
                </label>
                <input
                  type="number"
                  name="discountPrice"
                  value={formData.discountPrice}
                  onChange={handleFormChange}
                  placeholder="Enables sale"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  name="stock"
                  value={formData.stock}
                  onChange={handleFormChange}
                  placeholder="50"
                  min="0"
                  step="1"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Expiry Date (Optional - for perishables)
                </label>
                <input
                  type="date"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleFormChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Product Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
                {imageFile && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                    Selected: {imageFile.name}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                style={{ flex: 1 }}
              >
                {isSubmitting ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}



      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '2rem',
        }}>
          {error}
        </div>
      )}



      {/* Expiry Alert Panel - Now under sub-tab */}
      {activeSubTab === 'expiry-alerts' && (
        posExpiryLoading ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
            marginBottom: '2rem',
          }}>
            Loading POS expiry alerts...
          </div>
        ) : filteredExpiryAlertCards.length > 0 ? (
          <div style={{
            backgroundColor: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}>
            <h3 style={{ color: '#856404', marginTop: 0, marginBottom: '1rem' }}>
              <i className="fas fa-exclamation-triangle" style={{marginRight: '0.5rem'}}></i>Expiry Alerts ({filteredExpiryAlertCards.length})
            </h3>
            {posExpiryError && (
              <div style={{
                backgroundColor: '#fff8e1',
                color: '#8a6d3b',
                border: '1px solid #ffe08a',
                borderRadius: '6px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}>
                POS expiry fetch failed, showing local alerts: {posExpiryError}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredExpiryAlertCards.map((card) => (
                <div
                  key={card.key}
                  style={{
                    padding: '1rem',
                    borderRadius: '10px',
                    backgroundColor: card.isExpired ? '#f8d7da' : card.isUrgent ? '#fff4db' : '#fff',
                    border: `2px solid ${card.isExpired ? '#f5c6cb' : card.isUrgent ? '#ffc107' : '#ddd'}`,
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: '700', marginBottom: '0.35rem', color: '#1f2937' }}>
                        {card.name}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                        Code: {card.productCode || 'N/A'}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                        Category: {card.category || 'Uncategorized'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.82rem', color: '#374151', fontWeight: '700' }}>
                        Total Qty: {card.totalQty}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        {card.stockLabel}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {card.batches.map((batch, index) => {
                      const batchStatus = getExpiryBatchStatus(batch.expiryDate);

                      return (
                        <div
                          key={batch.key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            alignItems: 'center',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            backgroundColor: '#fff',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#111827' }}>
                              Batch {index + 1}{batch.batchNo ? ` (${batch.batchNo})` : ''}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                              Quantity {batch.remainingQty}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                              Expiry {formatExpiryDate(batch.expiryDate)}
                            </div>
                          </div>
                          <span style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '999px',
                            backgroundColor: batchStatus.background,
                            color: batchStatus.tone,
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            whiteSpace: 'nowrap',
                          }}>
                            {batchStatus.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {card.sourceProduct ? (
                    <button
                      onClick={() => {
                        handleEdit(card.sourceProduct);
                        setActiveSubTab('products');
                      }}
                      style={{
                        marginTop: '0.9rem',
                        padding: '0.45rem 0.85rem',
                        backgroundColor: card.isExpired ? '#dc3545' : '#ffc107',
                        color: card.isExpired ? '#fff' : '#000',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      {card.isExpired ? 'Review Product' : 'Open Product'}
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.9rem' }}>
                      POS item (manage from POS sync tools)
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#999',
          }}>
            <i className="fas fa-check-circle" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block', color: '#4caf50' }}></i>
            <p style={{ fontSize: '1rem', margin: 0 }}>No expiry alerts match the current filters.</p>
          </div>
        )
      )}

      {/* Fixed Header Bar - sub-tabs + filters */}
      <>
        <div
          ref={filterBarRef}
          style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          backgroundColor: '#fff',
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
          {/* Sub-tab row */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #eee' }}>
            <button
              onClick={() => setActiveSubTab('products')}
              style={{
                padding: '0.6rem 1.25rem',
                border: 'none',
                backgroundColor: activeSubTab === 'products' ? '#5B4B8A' : 'transparent',
                color: activeSubTab === 'products' ? '#fff' : '#666',
                fontWeight: activeSubTab === 'products' ? '600' : '500',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: activeSubTab === 'products' ? '3px solid #2D8659' : '3px solid transparent',
                marginBottom: '-2px',
              }}
            >
              <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>Products
            </button>
            <button
              onClick={() => setActiveSubTab('expiry-alerts')}
              style={{
                padding: '0.6rem 1.25rem',
                border: 'none',
                backgroundColor: activeSubTab === 'expiry-alerts' ? '#5B4B8A' : 'transparent',
                color: activeSubTab === 'expiry-alerts' ? '#fff' : '#666',
                fontWeight: activeSubTab === 'expiry-alerts' ? '600' : '500',
                cursor: 'pointer',
                fontSize: '0.9rem',
                borderBottom: activeSubTab === 'expiry-alerts' ? '3px solid #2D8659' : '3px solid transparent',
                marginBottom: '-2px',
                position: 'relative',
              }}
            >
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem' }}></i>Expiry Alerts
              {expiryAlertCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '0.4rem',
                  right: '0.3rem',
                  backgroundColor: '#f44336',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                }}>
                  {expiryAlertCount}
                </span>
              )}
            </button>
          </div>
          {/* Filter row - products tab only */}
          {activeSubTab === 'products' && (
          <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          flexWrap: 'wrap',
        }}>
          {/* Search Input */}
          <div style={{
            position: 'relative',
            flex: 1,
            minWidth: '200px',
          }}>
            <input
              type="text"
              placeholder="Search by name, category or product code..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={{
                width: '100%',
                padding: '0.75rem 2.25rem 0.75rem 0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1rem',
                backgroundColor: '#f5f5f5',
                transition: 'box-shadow 0.3s ease, background-color 0.3s ease'
              }}
              onFocus={(e) => {
                e.target.style.backgroundColor = '#fff';
                e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.backgroundColor = '#f5f5f5';
                e.target.style.boxShadow = 'none';
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                title="Clear search (Left Ctrl)"
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '0.45rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#e9ecef',
                  color: '#555',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  padding: 0,
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <button
            onClick={handleToggleVoiceSearch}
            style={{
              padding: '0.6rem 0.9rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: isVoiceSearchEnabled ? '#dc3545' : '#0d6efd',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
            title={isVoiceSearchEnabled ? 'Disable voice search' : 'Enable voice search'}
          >
            <i className={`fas ${isListening ? 'fa-microphone-alt' : 'fa-microphone'}`}></i>
            {isVoiceSearchEnabled ? (isListening ? 'Listening...' : 'Voice On') : 'Talk Search'}
          </button>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              minWidth: '150px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* On Sale Filter */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            backgroundColor: onSaleOnly ? '#e7f3ff' : 'transparent',
            borderRadius: '4px',
            border: onSaleOnly ? '1px solid #007bff' : '1px solid transparent',
          }}>
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => handleSaleFilterChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: onSaleOnly ? '600' : '400' }}>Promotions</span>
          </label>

          <button
            onClick={handleDownloadProductsPdf}
            disabled={isExportingPdf}
            style={{
              padding: '0.6rem 1rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: isExportingPdf ? '#6c757d' : '#2D8659',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: isExportingPdf ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            title="Download products table PDF"
          >
            <i className={`fas ${isExportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
            {isExportingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>

          {/* Create Product Button */}
          {!showForm && (
            <Button
              variant="primary"
              onClick={() => setShowForm(true)}
              style={{ flexShrink: 0 }}
            >
              + Create New Product
            </Button>
          )}

          {/* Results Count */}
          <div style={{
            marginLeft: 'auto',
            fontSize: '0.9rem',
            color: '#666',
            minWidth: '100px',
            textAlign: 'right',
          }}>
            {filteredProducts.length} / {products.length} products
          </div>
          </div>
          )}
          {activeSubTab === 'expiry-alerts' && (
          <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          flexWrap: 'wrap',
        }}>
          <select
            value={expiryAlertCategory}
            onChange={(e) => setExpiryAlertCategory(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              minWidth: '180px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All Categories</option>
            {expiryAlertCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={expiryAlertStockFilter}
            onChange={(e) => setExpiryAlertStockFilter(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              minWidth: '180px',
              backgroundColor: '#fff',
            }}
          >
            <option value="all">All Stock Levels</option>
            <option value="in-stock">In Stock</option>
            <option value="low-stock">Low Stock</option>
            <option value="out-of-stock">Out of Stock</option>
          </select>

          <button
            onClick={handleDownloadExpiryAlertsPdf}
            disabled={isExportingExpiryPdf}
            style={{
              padding: '0.6rem 1rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: isExportingExpiryPdf ? '#6c757d' : '#dc3545',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: isExportingExpiryPdf ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            title="Download filtered expiry alert cards PDF"
          >
            <i className={`fas ${isExportingExpiryPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
            {isExportingExpiryPdf ? 'Generating PDF...' : 'Download Alerts PDF'}
          </button>

          <div style={{
            marginLeft: 'auto',
            fontSize: '0.9rem',
            color: '#666',
            minWidth: '140px',
            textAlign: 'right',
          }}>
            {filteredExpiryAlertCards.length} / {expiryAlertsSourceCount} alert products
          </div>
          </div>
          )}
        </div>
        <div style={{ height: `${filterBarHeight}px` }}></div>
      </>

      {/* Products Table - Only show in Products tab */}
      {activeSubTab === 'products' && (
        products.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No products yet. Create your first product!
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No products match your search or filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#fff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}>
            <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>ID</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Name</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Product Code</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Category</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Pricing</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem' }}>Stock</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Expiry Status</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
                const finalPrice = product.isOnSale && product.discountPrice ? product.discountPrice : product.price;
                const discountPct = product.originalPrice && product.discountPrice
                  ? Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100)
                  : 0;
                const hasValidDiscount = discountPct > 0;
                const productCode = product.productCode || product.sourceCode || product.code;
                const expiryBadge = getExpiryBadge(product);
                const productBatches = normalizeProductExpiryBatches(product.expiryBatches);
                const defaultBatch = getDefaultBatchForProduct(product);
                const isBatchListExpanded = Boolean(expandedBatchRows[product.id]);
                const totalBatchQty = getProductBatchTotalQty(product);
                
                return (
                  <tr 
                    key={product.id} 
                    style={{ 
                      borderBottom: '1px solid #eee',
                      backgroundColor: product.expiryStatus?.status === 'expired' ? '#ffebee' : ['expiring_soon', '1_week_warning', '2_weeks_warning'].includes(product.expiryStatus?.status) ? '#fff3e0' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '1rem', fontSize: '0.9rem' }}>#{product.id}</td>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{product.name}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
                      {productCode ? (
                        <span style={{
                          fontFamily: 'monospace',
                          backgroundColor: '#f3f4f6',
                          padding: '0.2rem 0.45rem',
                          borderRadius: '4px',
                          color: '#374151',
                        }}>
                          {productCode}
                        </span>
                      ) : (
                        <span style={{ color: '#999' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#666' }}>{product.category}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {product.isOnSale && product.discountPrice && product.originalPrice && hasValidDiscount && (
                          <span style={{ textDecoration: 'line-through', color: '#666', fontWeight: '500', fontSize: '0.8rem' }}>
                            {formatMWK(product.originalPrice)}
                          </span>
                        )}
                        <span style={{ 
                          color: product.isOnSale ? '#ff6b6b' : '#2D8659', 
                          fontWeight: '600',
                          fontSize: '0.95rem'
                        }}>
                          {formatMWK(finalPrice)}
                        </span>
                        {hasValidDiscount && (
                          <span style={{ 
                            padding: '0.2rem 0.5rem',
                            backgroundColor: '#ff6b6b',
                            color: '#fff',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                          }}>
                            {discountPct}% off
                          </span>
                        )}
                      </div>
                      {product.isOnSale && hasValidDiscount && (
                        <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: '0.25rem' }}>
                          🏷 On Sale
                        </div>
                      )}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      color: totalBatchQty > 20 ? '#4caf50' : totalBatchQty > 0 ? '#ff9800' : '#f44336',
                      fontWeight: '600',
                    }}>
                      {totalBatchQty}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                      {productBatches.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => toggleBatchRow(product.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#374151',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontWeight: '700',
                              }}
                            >
                              <i className={`fas ${isBatchListExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`}></i>
                              {defaultBatch ? `Earliest active batch: ${formatExpiryDate(defaultBatch.expiryDate)}` : 'Show batches'}
                            </button>
                            <span style={{
                              padding: '0.35rem 0.55rem',
                              borderRadius: '999px',
                              backgroundColor: '#eef2ff',
                              color: '#3730a3',
                              fontSize: '0.76rem',
                              fontWeight: '700',
                            }}>
                              {productBatches.length} batch{productBatches.length === 1 ? '' : 'es'}
                            </span>
                          </div>

                          {defaultBatch && (() => {
                            const defaultBatchStatus = getExpiryBatchStatus(defaultBatch.expiryDate);

                            return (
                              <div style={{
                                padding: '0.65rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e5e7eb',
                              }}>
                                <div style={{ fontSize: '0.82rem', color: '#4b5563', marginBottom: '0.25rem' }}>
                                  Default visible batch
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <div style={{ color: '#111827', fontWeight: '700' }}>
                                    Remaining Qty {defaultBatch.remainingQty}: {formatExpiryDate(defaultBatch.expiryDate)}
                                  </div>
                                  <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                                    {formatBatchIdentity(defaultBatch, 0)}
                                  </div>
                                  <span style={{
                                    padding: '0.35rem 0.55rem',
                                    borderRadius: '999px',
                                    backgroundColor: defaultBatchStatus.background,
                                    color: defaultBatchStatus.tone,
                                    fontSize: '0.76rem',
                                    fontWeight: '700',
                                  }}>
                                    {defaultBatchStatus.label}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {isBatchListExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                              {productBatches.map((batch, batchIndex) => {
                                const batchStatus = getExpiryBatchStatus(batch.expiryDate);

                                return (
                                  <div
                                    key={`${product.id}-${batch.expiryDate}-${batch.batchNo || batchIndex}`}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      gap: '0.75rem',
                                      alignItems: 'center',
                                      padding: '0.6rem 0.75rem',
                                      borderRadius: '8px',
                                      backgroundColor: '#ffffff',
                                      border: '1px solid #e5e7eb',
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#111827' }}>
                                        {formatBatchIdentity(batch, batchIndex)}
                                      </div>
                                      <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                                        Remaining Qty {batch.remainingQty}: {formatExpiryDate(batch.expiryDate)}
                                      </div>
                                    </div>
                                    <span style={{
                                      padding: '0.35rem 0.55rem',
                                      borderRadius: '999px',
                                      backgroundColor: batchStatus.background,
                                      color: batchStatus.tone,
                                      fontSize: '0.75rem',
                                      fontWeight: '700',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {batchStatus.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {expiryBadge && (
                            <span style={{
                              padding: '0.4rem 0.6rem',
                              borderRadius: '4px',
                              backgroundColor: expiryBadge.backgroundColor,
                              color: expiryBadge.color,
                              fontSize: '0.8rem',
                              width: 'fit-content',
                            }}>
                              <><i className={expiryBadge.icon}></i> {expiryBadge.label}</>
                            </span>
                          )}
                        </div>
                      ) : expiryBadge ? (
                        <span style={{
                          padding: '0.4rem 0.6rem',
                          borderRadius: '4px',
                          backgroundColor: expiryBadge.backgroundColor,
                          color: expiryBadge.color,
                          fontSize: '0.85rem',
                        }}>
                          <><i className={expiryBadge.icon}></i> {expiryBadge.label}</>
                        </span>
                      ) : product.expiryDate ? (
                        <span style={{ color: '#4b5563' }}>
                          {new Date(product.expiryDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span style={{ color: '#999' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', minWidth: '160px' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleEdit(product)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            backgroundColor: '#007bff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            flex: '1',
                            minWidth: '60px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            backgroundColor: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            flex: '1',
                            minWidth: '60px',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
          </div>
        )
      )}
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />
    </div>
  );
};

export default AdminProducts;
