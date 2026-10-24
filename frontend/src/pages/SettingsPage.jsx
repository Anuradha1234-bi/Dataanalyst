import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Key,
  HardDrive,
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Lock,
  Mail,
  Zap,
  Save,
  Server,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { settingsService } from '../services/settingsService';
import { extractErrorMessage } from '../services/api';

export const SettingsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Overall settings data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active section tab
  const [activeTab, setActiveTab] = useState('storage'); // 'storage', 'preferences', 'system', 'services'

  // User Preferences Form State
  const [userPrefs, setUserPrefs] = useState({
    email_notifications: false,
    anomaly_alert_notifications: false,
    report_ready_notifications: true,
    cleaning_complete_notifications: true,
    theme: 'light',
    default_anomaly_method: 'both',
    default_iqr_multiplier: 1.5,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // System Settings Form State (Admin)
  const [systemSettings, setSystemSettings] = useState({
    max_upload_size_mb: 50,
    max_user_storage_mb: 500,
    gemini_api_key_configured: false,
    gemini_api_key_masked: '',
    gemini_model: 'gemini-1.5-flash',
    smtp_configured: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_from_email: '',
    app_name: 'AI Data Analyst Agent',
    app_env: 'development',
  });
  const [newGeminiKey, setNewGeminiKey] = useState('');
  const [savingSystem, setSavingSystem] = useState(false);

  // Storage State
  const [storageData, setStorageData] = useState(null);

  // Provider & Channel Registries
  const [providers, setProviders] = useState([]);
  const [channels, setChannels] = useState([]);

  // Testing states
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState(null);

  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState(null);

  // Fetch complete settings
  const fetchSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await settingsService.getSettingsOverview();
      if (data.user_preferences) {
        setUserPrefs(data.user_preferences);
      }
      if (data.system_settings) {
        setSystemSettings(data.system_settings);
      }
      if (data.workspace_storage) {
        setStorageData(data.workspace_storage);
      }
      if (data.available_providers) {
        setProviders(data.available_providers);
      }
      if (data.notification_channels) {
        setChannels(data.notification_channels);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Save User Preferences
  const handleSavePreferences = async (e) => {
    e.preventDefault();
    setSavingPrefs(true);
    setError('');
    setSuccessMsg('');

    try {
      const updated = await settingsService.updateUserPreferences(userPrefs);
      setUserPrefs(updated);
      setSuccessMsg('User preferences saved successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingPrefs(false);
    }
  };

  // Save System Settings (Admin only)
  const handleSaveSystemSettings = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Administrative privileges are required to modify system settings.');
      return;
    }

    setSavingSystem(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        max_upload_size_mb: Number(systemSettings.max_upload_size_mb),
        max_user_storage_mb: Number(systemSettings.max_user_storage_mb),
        gemini_model: systemSettings.gemini_model,
      };

      if (newGeminiKey.trim()) {
        payload.gemini_api_key = newGeminiKey.trim();
      }

      const updated = await settingsService.updateSystemSettings(payload);
      setSystemSettings(updated);
      setNewGeminiKey('');
      setSuccessMsg('System configuration updated successfully.');
      setTimeout(() => setSuccessMsg(''), 4000);
      // Refresh storage metrics to reflect new quota
      fetchSettings();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSavingSystem(false);
    }
  };

  // Test Gemini API Key
  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await settingsService.testGeminiKey(newGeminiKey.trim() || undefined);
      setGeminiTestResult(res);
    } catch (err) {
      setGeminiTestResult({
        success: false,
        status: 'error',
        message: extractErrorMessage(err),
      });
    } finally {
      setTestingGemini(false);
    }
  };

  // Test Notification Channel
  const handleTestNotification = async () => {
    setTestingNotification(true);
    setNotificationTestResult(null);
    try {
      const res = await settingsService.testNotification();
      setNotificationTestResult(res);
    } catch (err) {
      setNotificationTestResult({
        configured: false,
        status: 'error',
        message: extractErrorMessage(err),
      });
    } finally {
      setTestingNotification(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A]">System Settings</h1>
          <p className="text-xs text-[#64748B] mt-1">Loading system configuration and quotas...</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
          <p className="text-xs text-[#64748B]">Retrieving workspace parameters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">System Settings</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage workspace storage quotas, user preferences, API credentials, and notifications.
          </p>
        </div>

        {/* Role Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isAdmin ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Administrator Mode</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Standard User Mode</span>
            </span>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span className="flex-1 font-medium">{successMsg}</span>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-emerald-400 hover:text-emerald-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#E2E8F0] gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('storage')}
          className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'storage'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Workspace Storage</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'preferences'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>User Preferences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'system'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>System & API Keys</span>
          {isAdmin && (
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
              Admin
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`pb-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'services'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Integrations & Status</span>
        </button>
      </div>

      {/* TAB 1: WORKSPACE STORAGE */}
      {activeTab === 'storage' && storageData && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#2563EB]" />
                  <span>Workspace Storage Consumption</span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Calculated from actual dataset files stored in your isolated user workspace.
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-semibold text-[#0F172A]">
                  {storageData.used_storage_mb} MB / {storageData.storage_quota_mb} MB
                </span>
                <span className="text-[11px] text-[#64748B] block">
                  {storageData.dataset_count} datasets stored
                </span>
              </div>
            </div>

            {/* Storage Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-[#0F172A]">Storage Utilized</span>
                <span
                  className={`font-bold ${
                    storageData.used_percentage >= 85 ? 'text-red-600' : 'text-[#2563EB]'
                  }`}
                >
                  {storageData.used_percentage.toFixed(1)}% of quota
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    storageData.used_percentage >= 85
                      ? 'bg-red-500'
                      : storageData.used_percentage >= 65
                      ? 'bg-amber-500'
                      : 'bg-[#2563EB]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, storageData.used_percentage))}%` }}
                ></div>
              </div>
            </div>

            {/* Quota warning */}
            {storageData.quota_warning && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Storage Quota Warning:</span> You have utilized over 85% of your available workspace storage. Additional file uploads exceeding {storageData.storage_quota_mb} MB will be rejected by backend quota controls.
                </div>
              </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                  Bytes Stored
                </span>
                <span className="text-lg font-bold text-[#0F172A] mt-1 block font-mono">
                  {storageData.used_storage_bytes.toLocaleString()} B
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  Across {storageData.dataset_count} uploaded files
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                  Single File Upload Limit
                </span>
                <span className="text-lg font-bold text-[#2563EB] mt-1 block">
                  {storageData.max_upload_size_mb} MB
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  Enforced on upload streaming
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                  Active Storage Quota
                </span>
                <span className="text-lg font-bold text-[#0F172A] mt-1 block">
                  {storageData.storage_quota_mb} MB
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  {isAdmin ? 'Configurable in System tab' : 'Set by system administrator'}
                </span>
              </div>
            </div>

            {/* Safe Non-destructive Quota Reduction Note */}
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-900">
              <Info className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span>
                <strong>Data Safety Policy:</strong> Changing or reducing storage quotas strictly prevents new file uploads from exceeding the limit, but will never delete or overwrite existing uploaded datasets.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER PREFERENCES */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSavePreferences} className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
            <div className="border-b border-[#E2E8F0] pb-4">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#2563EB]" />
                <span>Personal Notification & Analysis Preferences</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Customize automated alerts, reporting triggers, and default outlier settings.
              </p>
            </div>

            {/* Notification Toggles */}
            <div className="space-y-4">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                Notification Channels & Events
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={userPrefs.email_notifications}
                    onChange={(e) =>
                      setUserPrefs({ ...userPrefs, email_notifications: e.target.checked })
                    }
                    className="mt-1 w-4 h-4 accent-[#2563EB] rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#0F172A] block">
                      Email Notifications
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      Receive workflow alerts via email.{' '}
                      {!systemSettings.smtp_configured && (
                        <span className="text-amber-600 font-semibold">
                          (Note: SMTP delivery currently unconfigured in development mode)
                        </span>
                      )}
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={userPrefs.anomaly_alert_notifications}
                    onChange={(e) =>
                      setUserPrefs({
                        ...userPrefs,
                        anomaly_alert_notifications: e.target.checked,
                      })
                    }
                    className="mt-1 w-4 h-4 accent-[#2563EB] rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#0F172A] block">
                      High Anomaly Alerts
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      Trigger alerts when outlier rate exceeds 10% during profiling runs.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={userPrefs.report_ready_notifications}
                    onChange={(e) =>
                      setUserPrefs({
                        ...userPrefs,
                        report_ready_notifications: e.target.checked,
                      })
                    }
                    className="mt-1 w-4 h-4 accent-[#2563EB] rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#0F172A] block">
                      Report Generation Ready
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      Notify when comprehensive PDF and analytical summaries are exported.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={userPrefs.cleaning_complete_notifications}
                    onChange={(e) =>
                      setUserPrefs({
                        ...userPrefs,
                        cleaning_complete_notifications: e.target.checked,
                      })
                    }
                    className="mt-1 w-4 h-4 accent-[#2563EB] rounded cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#0F172A] block">
                      Cleaning Execution Complete
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      Notify when automated batch data transformations finish executing.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Default Outlier Preferences */}
            <div className="space-y-4 border-t border-[#E2E8F0] pt-4">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                Default Anomaly Detection Preferences
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Preferred Default Method
                  </label>
                  <select
                    value={userPrefs.default_anomaly_method}
                    onChange={(e) =>
                      setUserPrefs({ ...userPrefs, default_anomaly_method: e.target.value })
                    }
                    className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="both">Both IQR & Isolation Forest (Combined)</option>
                    <option value="iqr">IQR Bounds Only (Univariate)</option>
                    <option value="isolation_forest">Isolation Forest Only (Multivariate)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Default IQR Multiplier
                  </label>
                  <select
                    value={userPrefs.default_iqr_multiplier}
                    onChange={(e) =>
                      setUserPrefs({
                        ...userPrefs,
                        default_iqr_multiplier: parseFloat(e.target.value),
                      })
                    }
                    className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="1.5">1.5x (Standard Outlier Boundary)</option>
                    <option value="3.0">3.0x (Extreme Outlier Boundary)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="border-t border-[#E2E8F0] pt-4 flex justify-end">
              <button
                type="submit"
                disabled={savingPrefs}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
              >
                {savingPrefs ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving Preferences...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save User Preferences</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: SYSTEM SETTINGS & API KEYS (ADMIN) */}
      {activeTab === 'system' && (
        <form onSubmit={handleSaveSystemSettings} className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
            <div className="border-b border-[#E2E8F0] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#2563EB]" />
                  <span>Administrative System Configuration & API Credentials</span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Configure global limits, LLM connectivity, and secret storage.
                </p>
              </div>

              {!isAdmin && (
                <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
                  Read-only: Admin role required to edit
                </span>
              )}
            </div>

            {/* Workspace & Upload Limits */}
            <div className="space-y-4">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                Workspace Storage & Upload Thresholds
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Max Upload File Size (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1024"
                    disabled={!isAdmin}
                    value={systemSettings.max_upload_size_mb}
                    onChange={(e) =>
                      setSystemSettings({
                        ...systemSettings,
                        max_upload_size_mb: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  <span className="text-[11px] text-[#94A3B8] mt-0.5 block">
                    Enforced dynamically during chunked file streaming.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1">
                    Workspace Quota Per User (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10240"
                    disabled={!isAdmin}
                    value={systemSettings.max_user_storage_mb}
                    onChange={(e) =>
                      setSystemSettings({
                        ...systemSettings,
                        max_user_storage_mb: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                  <span className="text-[11px] text-[#94A3B8] mt-0.5 block">
                    Cumulative disk storage limit across all datasets per user account.
                  </span>
                </div>
              </div>
            </div>

            {/* API Keys (Google Gemini) */}
            <div className="space-y-4 border-t border-[#E2E8F0] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                    External AI Provider: Google Gemini
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    Powers natural language query translation and automated analyst insights.
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {systemSettings.gemini_api_key_configured ? (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                      Configured
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      Not Configured
                    </span>
                  )}
                </div>
              </div>

              {/* Masked Key Display */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <span className="text-[11px] font-medium text-[#64748B] block">
                  Current Stored API Key (Masked for Security):
                </span>
                <div className="font-mono text-xs font-bold text-[#0F172A] tracking-wider">
                  {systemSettings.gemini_api_key_masked || 'No API key set in database or environment.'}
                </div>
                <span className="text-[10px] text-[#94A3B8] block">
                  Full plaintext secrets are never returned in API responses or stored in browser cache.
                </span>
              </div>

              {/* New Key Input (Admin only) */}
              {isAdmin && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#475569]">
                    Update Gemini API Key (Enter new secret to replace):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Paste new Google Gemini API key (AIzaSy...)"
                      value={newGeminiKey}
                      onChange={(e) => setNewGeminiKey(e.target.value)}
                      className="flex-1 text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                    <button
                      type="button"
                      onClick={handleTestGemini}
                      disabled={testingGemini || (!newGeminiKey && !systemSettings.gemini_api_key_configured)}
                      className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {testingGemini ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Test Key</span>
                        </>
                      )}
                    </button>
                  </div>

                  {geminiTestResult && (
                    <div
                      className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                        geminiTestResult.success
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {geminiTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                      <span>{geminiTestResult.message}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Model selection */}
              <div className="pt-2">
                <label className="block text-xs font-medium text-[#475569] mb-1">
                  Default Gemini Model
                </label>
                <select
                  disabled={!isAdmin}
                  value={systemSettings.gemini_model}
                  onChange={(e) =>
                    setSystemSettings({ ...systemSettings, gemini_model: e.target.value })
                  }
                  className="w-full text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast, high throughput - Recommended)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Complex reasoning & deeper data insights)</option>
                </select>
              </div>
            </div>

            {/* Save Button */}
            {isAdmin && (
              <div className="border-t border-[#E2E8F0] pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={savingSystem}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {savingSystem ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving System Settings...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save System Configuration</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* TAB 4: INTEGRATED SERVICES & DELIVERY CHANNELS */}
      {activeTab === 'services' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-6">
            <div className="border-b border-[#E2E8F0] pb-4">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#2563EB]" />
                <span>External Providers & Delivery Channels</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Status registry of actual implemented integrations. No simulated or unconfigured services are presented as operational.
              </p>
            </div>

            {/* Providers Registry */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                Integrated Service Providers
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A]">{p.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          p.configured
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B]">{p.purpose}</p>
                    <span className="text-[10px] text-[#94A3B8] block">Type: {p.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notification Channels Registry */}
            <div className="space-y-3 border-t border-[#E2E8F0] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block">
                    Notification Delivery Channels
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    Current readiness and transport channel availability.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={testingNotification}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-[#0F172A] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {testingNotification ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Test Channel Readiness</span>
                    </>
                  )}
                </button>
              </div>

              {notificationTestResult && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                    notificationTestResult.configured
                      ? 'bg-green-50 text-green-900 border border-green-200'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {notificationTestResult.configured ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">
                      Status: {notificationTestResult.status.toUpperCase()}
                    </span>
                    <span className="mt-0.5 block">{notificationTestResult.message}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {channels.map((c) => (
                  <div
                    key={c.channel}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#0F172A]">{c.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          c.available
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B]">{c.description}</p>
                    {c.reason && (
                      <p className="text-[11px] text-amber-700 italic">• {c.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
