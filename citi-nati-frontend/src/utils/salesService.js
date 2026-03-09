import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Sales API Service
 * Handles all sales day and reporting endpoints
 */

// Get current open sales day
export const getCurrentSalesDay = async (token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sales/current`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.salesDay;
  } catch (error) {
    console.error('[SALES_SERVICE] Error fetching current sales day:', error);
    throw error;
  }
};

// Start a new sales day
export const startSalesDay = async (token) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/sales/start`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.salesDay;
  } catch (error) {
    console.error('[SALES_SERVICE] Error starting sales day:', error);
    throw error;
  }
};

// End current sales day
export const endSalesDay = async (token) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/sales/end`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.salesDay;
  } catch (error) {
    console.error('[SALES_SERVICE] Error ending sales day:', error);
    throw error;
  }
};

// Get sales day history (closed days)
export const getSalesDayHistory = async (token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sales/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.salesDays;
  } catch (error) {
    console.error('[SALES_SERVICE] Error fetching sales history:', error);
    throw error;
  }
};

// Get sales day by ID
export const getSalesDayById = async (salesDayId, token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sales/${salesDayId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data.salesDay;
  } catch (error) {
    console.error('[SALES_SERVICE] Error fetching sales day:', error);
    throw error;
  }
};

// Export sales day as CSV (returns blob)
export const exportSalesDayCSV = async (salesDayId, token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/sales/${salesDayId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob'
    });
    return response.data;
  } catch (error) {
    console.error('[SALES_SERVICE] Error exporting CSV:', error);
    throw error;
  }
};

// Get driver performance metrics
export const getDriverPerformance = async (token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/drivers/performance`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('[SALES_SERVICE] Error fetching driver performance:', error);
    throw error;
  }
};

// Get driver performance for specific sales day
export const getDriverPerformanceByDay = async (salesDayId, token) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/drivers/performance/${salesDayId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('[SALES_SERVICE] Error fetching driver performance by day:', error);
    throw error;
  }
};

// Clear all sales history (delete closed sales days)
export const clearSalesHistory = async (token) => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/sales/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    console.error('[SALES_SERVICE] Error clearing sales history:', error);
    throw error;
  }
};
