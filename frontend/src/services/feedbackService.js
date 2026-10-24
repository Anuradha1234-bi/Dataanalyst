import api from './api';

/**
 * Submit user feedback to the backend.
 * @param {Object} data - { name, email, feedback_type, rating, message, website }
 * @returns {Promise<Object>} Backend response
 */
export const submitFeedback = async (data) => {
  const response = await api.post('/v1/feedback', data);
  return response.data;
};

export default {
  submitFeedback,
};
