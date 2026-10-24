import api from './api';

export const relationshipService = {
  /**
   * Discover relationships between specific or all uploaded datasets
   * @param {number[]} datasetIds - Optional list of dataset IDs
   */
  async detectRelationships(datasetIds = null) {
    const payload = datasetIds && datasetIds.length > 0 ? { dataset_ids: datasetIds } : {};
    const response = await api.post('/relationships/detect', payload);
    return response.data;
  },

  /**
   * Fetch all detected relationships for current user's datasets
   */
  async getAllRelationships() {
    const response = await api.get('/relationships/');
    return response.data;
  },

  /**
   * Update user status for a detected relationship (ACCEPTED, REJECTED, IGNORED)
   * @param {string} relationshipId
   * @param {'ACCEPTED' | 'REJECTED' | 'IGNORED' | 'PENDING'} status
   */
  async updateStatus(relationshipId, status) {
    const response = await api.post('/relationships/status', {
      relationship_id: relationshipId,
      status,
    });
    return response.data;
  },

  /**
   * Generate dry-run preview for joining two datasets
   * @param {Object} params
   * @param {number} params.leftDatasetId
   * @param {string} params.leftColumn
   * @param {number} params.rightDatasetId
   * @param {string} params.rightColumn
   * @param {'inner' | 'left' | 'right' | 'outer'} params.joinType
   * @param {number} params.limit
   */
  async previewJoin({ leftDatasetId, leftColumn, rightDatasetId, rightColumn, joinType = 'inner', limit = 10 }) {
    const response = await api.post('/relationships/join-preview', {
      left_dataset_id: leftDatasetId,
      left_column: leftColumn,
      right_dataset_id: rightDatasetId,
      right_column: rightColumn,
      join_type: joinType,
      limit,
    });
    return response.data;
  },

  /**
   * Execute join and create new derived dataset upon user confirmation
   * @param {Object} params
   * @param {number} params.leftDatasetId
   * @param {string} params.leftColumn
   * @param {number} params.rightDatasetId
   * @param {string} params.rightColumn
   * @param {'inner' | 'left' | 'right' | 'outer'} params.joinType
   * @param {string} [params.customDatasetName]
   * @param {boolean} params.userConfirmed
   */
  async applyJoin({ leftDatasetId, leftColumn, rightDatasetId, rightColumn, joinType = 'inner', customDatasetName = null, userConfirmed = true }) {
    const response = await api.post('/relationships/join-apply', {
      left_dataset_id: leftDatasetId,
      left_column: leftColumn,
      right_dataset_id: rightDatasetId,
      right_column: rightColumn,
      join_type: joinType,
      custom_dataset_name: customDatasetName,
      user_confirmed: userConfirmed,
    });
    return response.data;
  },

  /**
   * Detect duplicate or substantially similar datasets using actual tabular content
   * @param {number[]} datasetIds - Optional list of dataset IDs
   */
  async detectDuplicates(datasetIds = null) {
    const payload = datasetIds && datasetIds.length > 0 ? { dataset_ids: datasetIds } : {};
    const response = await api.post('/relationships/duplicates/detect', payload);
    return response.data;
  },

  /**
   * Fetch all detected duplicate dataset pairs for current user
   */
  async getDuplicates() {
    const response = await api.get('/relationships/duplicates');
    return response.data;
  },

  /**
   * Ignore a duplicate pair
   * @param {string} pairId
   * @param {boolean} ignored
   */
  async ignoreDuplicate(pairId, ignored = true) {
    const response = await api.post('/relationships/duplicates/ignore', {
      pair_id: pairId,
      ignored,
    });
    return response.data;
  },
};

export default relationshipService;
