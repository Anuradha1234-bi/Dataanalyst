import React, { useState, useEffect } from 'react';
import { ShieldAlert, Users, RefreshCw, CheckCircle2, XCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiGetUsers } from '../services/api';
import { formatTimestamp } from '../utils/formatters';

export function AdminUsers() {
  const { user, isAdmin } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const data = await apiGetUsers();
      setUsersList(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load user administration list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  // Frontend access denied guard for non-admin users
  if (!isAdmin) {
    return (
      <div className="page-container">
        <div className="access-denied-card">
          <div className="access-denied-icon-wrap">
            <ShieldAlert size={40} className="access-denied-icon" />
          </div>
          <h2 className="access-denied-title">Access Denied (403)</h2>
          <p className="access-denied-text">
            You are signed in as <strong>{user?.username}</strong> with role <code>{user?.role}</code>.
            This area requires administrative privileges.
          </p>
          <div className="access-denied-note">
            The backend API (<code>GET /api/users</code>) independently enforces this policy and will reject unauthorized requests.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 admin-page">
      <div className="admin-header-row">
        <div>
          <h1 className="admin-title">User Management</h1>
          <p className="admin-subtitle">
            System administration & role registry (Admin-only restricted view)
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="btn-secondary"
          disabled={loading}
          title="Refresh user list"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {errorMessage && (
        <div className="auth-error-banner" role="alert">
          <ShieldAlert size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="admin-table-card">
        <div className="admin-table-header">
          <div className="table-header-left">
            <Users size={18} className="table-header-icon" />
            <span className="table-header-title">Registered Accounts</span>
            <span className="table-count-badge">{usersList.length} total</span>
          </div>
          <div className="admin-badge-indicator">
            <ShieldCheck size={14} />
            <span>Admin Clearance Verified</span>
          </div>
        </div>

        {loading ? (
          <div className="table-loading-wrap">
            <Loader2 size={24} className="spin" />
            <span>Loading user directory...</span>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={u.id}>
                    <td className="cell-id">#{u.id}</td>
                    <td className="cell-username">
                      <strong>{u.username}</strong>
                    </td>
                    <td className="cell-email">{u.email}</td>
                    <td>
                      <span className={`role-pill ${u.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className="status-cell">
                        {u.is_active ? (
                          <>
                            <CheckCircle2 size={13} className="text-success" />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={13} className="text-danger" />
                            <span>Inactive</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="cell-date">{formatTimestamp(u.created_at)}</td>
                  </tr>
                ))}
                {usersList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
