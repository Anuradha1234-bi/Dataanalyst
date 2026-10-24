import api from './api';

export const datasetService = {
  /**
   * Retrieve all datasets belonging to the authenticated user.
   */
  async getDatasets() {
    const response = await api.get('/datasets');
    return response.data;
  },

  /**
   * Retrieve metadata for a specific dataset.
   */
  async getDataset(id) {
    const response = await api.get(`/datasets/${id}`);
    return response.data;
  },

  /**
   * Retrieve statistical distribution profiling and data hygiene report for a dataset.
   */
  async getDatasetQuality(id, version = 'original') {
    const response = await api.get(`/datasets/${id}/quality`, {
      params: { version },
    });
    return response.data;
  },

  async getDatasetProfile(id) {
    const response = await api.get(`/datasets/${id}/profile`);
    return response.data;
  },

  /**
   * Retrieve sample 5-row preview and missing values metadata for a dataset.
   */
  async getDatasetPreview(id) {
    const response = await api.get(`/datasets/${id}/preview`);
    return response.data;
  },

  /**
   * Analyze one or multiple datasets simultaneously with combined summary, schema comparison, and relationships.
   */
  async analyzeMultiDatasets(datasetIds, mode = 'all', settings = {}) {
    try {
      const response = await api.post('/analysis/multi', {
        dataset_ids: datasetIds,
        mode,
        settings,
      });
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        // Fallback to /profiling/batch
        try {
          const fallback = await api.post('/profiling/batch', {
            dataset_ids: datasetIds,
            mode,
            settings,
          });
          return fallback.data;
        } catch (fbErr) {
          // If single dataset and batch endpoints return 404, fall back to individual profile
          if (datasetIds.length === 1) {
            const single = await api.get(`/datasets/${datasetIds[0]}/profile`);
            const pData = single.data;
            return {
              status: 'success',
              message: 'Dataset profile loaded successfully',
              mode: 'individual',
              total_selected: 1,
              total_successful: 1,
              total_failed: 0,
              errors: [],
              individual_profiles: { [datasetIds[0]]: pData },
              combined_overview: null,
              comparison: null,
              relationships: [],
              cross_dataset_insights: [],
            };
          }
          throw fbErr;
        }
      }
      throw err;
    }
  },

  /**
   * Compare schemas and attributes across 2+ selected datasets.
   */
  async compareDatasets(datasetIds) {
    const response = await api.post('/analysis/compare', {
      dataset_ids: datasetIds,
      mode: 'comparison',
    });
    return response.data;
  },

  /**
   * Upload multiple tabular datasets with real-time upload progress tracking.
   */
  async uploadDatasets(files, onProgress) {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await api.post('/datasets/upload', formData, {
      headers: {
        'Content-Type': undefined,
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percent);
        }
      },
    });
    return response.data;
  },

  /**
   * Delete a dataset and its physical file.
   */
  async deleteDataset(id) {
    const response = await api.delete(`/datasets/${id}`);
    return response.data;
  },

  /**
   * Download the original dataset file securely.
   */
  async downloadDataset(id, filename) {
    const response = await api.get(`/datasets/${id}/download`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `dataset_${id}`);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

export default datasetService;
