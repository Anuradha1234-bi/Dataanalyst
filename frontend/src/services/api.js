import axios from 'axios';

// Base API configuration using VITE_API_URL environment variable
const rawBaseUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').trim();
const normalizedUrl = rawBaseUrl.replace(/\/+$/, '');
const baseURL = normalizedUrl.endsWith('/api') ? normalizedUrl : `${normalizedUrl}/api`;

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor: automatically attach JWT Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 session expiration without redirect loops
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        window.location.href = '/login?expired=true';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Standardized error message extraction preventing raw stack traces.
 */
export const extractErrorMessage = (error) => {
  if (!error) return 'An unexpected error occurred.';

  // Network / Connection Error
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
      return 'Request timed out. Please try again.';
    }
    return 'Unable to connect to the server. Please ensure the backend is running.';
  }

  const { status, data } = error.response;

  // Specific HTTP status mappings
  if (status === 401) {
    return 'Invalid email or password.';
  }

  if (status === 422) {
    return 'Please check the entered information.';
  }

  if (status === 409) {
    return 'This email is already registered.';
  }

  // FastAPI detail field (takes priority if present)
  if (data?.detail) {
    if (typeof data.detail === 'string') {
      return data.detail;
    }
    // Pydantic validation error array
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const firstErr = data.detail[0];
      const field = firstErr.loc ? firstErr.loc[firstErr.loc.length - 1] : '';
      const cleanField = field ? field.replace('_', ' ') : 'input';
      return `${cleanField.charAt(0).toUpperCase() + cleanField.slice(1)}: ${firstErr.msg}`;
    }
  }

  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }

  if (status === 500 || status === 502 || status === 503) {
    return 'Something went wrong on the server. Please try again.';
  }

  // HTTP Status code fallback mapping
  switch (status) {
    case 400:
      return 'Invalid request. Please verify your submitted information.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    default:
      return 'An error occurred while processing your request.';
  }
};

export default api;
