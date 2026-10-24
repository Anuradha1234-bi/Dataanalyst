import api from './api';

/**
 * Submit a Contact Support request to the backend.
 * @param {Object} data - { full_name, email, subject, message, website }
 * @returns {Promise<Object>} Backend response
 */
export const submitSupportRequest = async (data) => {
  const response = await api.post('/v1/support/contact', data);
  return response.data;
};

export default {
  submitSupportRequest,
};
