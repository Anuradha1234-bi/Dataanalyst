import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import {
  User,
  Mail,
  Calendar,
  Shield,
  LogOut,
  CheckCircle,
  AtSign,
  Key,
  Clock,
  Settings,
  ChevronRight,
  Lock,
  ExternalLink,
  Database,
  Activity,
  BarChart3,
} from 'lucide-react';

export const ProfilePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch {
      setLoggingOut(false);
    }
  };

  const displayName = user?.full_name || user?.name || user?.username || 'Analyst';
  const username = user?.username || '';
  const email = user?.email || '';
  const role = user?.role || 'user';
  const isAdmin = role === 'admin';

  const formattedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  // Generate a consistent gradient based on display name initial
  const avatarInitial = displayName ? displayName.charAt(0).toUpperCase() : 'A';
  const gradients = [
    'from-[#3664CC] to-[#4778E8]',
    'from-[#7B3FE4] to-[#A06DF4]',
    'from-[#1A7FBA] to-[#38A0D4]',
    'from-[#3DAA83] to-[#4DC4A0]',
    'from-[#E86D4A] to-[#F0936E]',
  ];
  const gradientClass = gradients[avatarInitial.charCodeAt(0) % gradients.length];

  return (
    <div className="w-full min-w-0 space-y-6">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Account Profile</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Your personal account information and session details
        </p>
      </div>

      {/* ── Profile Hero Card ────────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-xs overflow-hidden">
        {/* Banner gradient */}
        <div className={`h-20 bg-gradient-to-r ${gradientClass} opacity-20`} />

        {/* Avatar + name area */}
        <div className="px-6 pb-5">
          <div className="-mt-9 flex items-end justify-between gap-4">
            <div className={`w-[72px] h-[72px] rounded-2xl bg-gradient-to-tr ${gradientClass} text-white flex items-center justify-center font-extrabold text-2xl uppercase shadow-lg ring-4 ring-[var(--card-bg)] select-none`}>
              {avatarInitial}
            </div>

            {/* Role badge */}
            <div className={`mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              isAdmin
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                : 'bg-emerald-500/10 text-[#059669] dark:text-emerald-300 border-emerald-500/25'
            }`}>
              <Shield className="w-3.5 h-3.5" />
              {isAdmin ? 'Administrator' : 'Analyst'}
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-lg font-bold text-[var(--text-primary)] leading-tight">{displayName}</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">@{username}</p>
          </div>

          {/* Status pill */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Session
          </div>
        </div>
      </div>

      {/* ── Account Information ───────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <User className="w-4 h-4 text-[#4778E8]" />
            Account Information
          </h3>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {/* Full Name */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-[#4778E8]" />
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)] font-medium">Full Name</div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{displayName}</div>
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <AtSign className="w-3.5 h-3.5 text-purple-500" />
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)] font-medium">Username</div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">@{username || '—'}</div>
              </div>
            </div>
          </div>

          {/* Email */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                <Mail className="w-3.5 h-3.5 text-teal-500" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[var(--text-muted)] font-medium">Email Address</div>
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{email || '—'}</div>
              </div>
            </div>
          </div>

          {/* Role */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAdmin ? 'bg-amber-500/10' : 'bg-slate-500/10'}`}>
                <Shield className={`w-3.5 h-3.5 ${isAdmin ? 'text-amber-500' : 'text-[var(--text-muted)]'}`} />
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)] font-medium">Account Role</div>
                <div className={`text-sm font-semibold capitalize ${isAdmin ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-primary)]'}`}>
                  {role}
                </div>
              </div>
            </div>
          </div>

          {/* Member Since */}
          {formattedDate && (
            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <div>
                  <div className="text-[11px] text-[var(--text-muted)] font-medium">Member Since</div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{formattedDate}</div>
                </div>
              </div>
            </div>
          )}

          {/* Account Status */}
          <div className="px-5 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div>
                <div className="text-[11px] text-[var(--text-muted)] font-medium">Account Status</div>
                <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Active</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Navigation ──────────────────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#4778E8]" />
            Quick Access
          </h3>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Link
            to="/history"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--card-bg-subtle)] border border-transparent hover:border-[var(--border-color)] transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--card-bg-subtle)] flex items-center justify-center shrink-0 group-hover:bg-blue-500/10 transition-colors">
              <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[#4778E8] transition-colors" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">History</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">View analysis history</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>

          <Link
            to="/datasets"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--card-bg-subtle)] border border-transparent hover:border-[var(--border-color)] transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--card-bg-subtle)] flex items-center justify-center shrink-0 group-hover:bg-teal-500/10 transition-colors">
              <Database className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-teal-500 transition-colors" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">My Datasets</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">Manage your data</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>

          <Link
            to="/settings"
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--card-bg-subtle)] border border-transparent hover:border-[var(--border-color)] transition-all group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--card-bg-subtle)] flex items-center justify-center shrink-0 group-hover:bg-slate-500/10 transition-colors">
              <Settings className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">Settings</div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">App preferences</div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      </div>

      {/* ── Security & Account Actions ───────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-xs">
        <div className="px-5 py-4 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#059669]" />
            Security
          </h3>
        </div>

        <div className="p-4 space-y-3">
          {/* Password reset via forgot password */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--card-bg-subtle)] border border-[var(--border-color)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--card-bg)] flex items-center justify-center shrink-0 border border-[var(--border-color)]">
                <Key className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">Password</div>
                <div className="text-[11px] text-[var(--text-muted)]">Use the forgot password flow to change your password</div>
              </div>
            </div>
            <Link
              to="/forgot-password"
              className="shrink-0 text-[11px] font-semibold text-[#059669] hover:underline flex items-center gap-1 transition-colors"
            >
              Reset
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          {/* Sign Out */}
          <div className="pt-1">
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-60"
            >
              <LogOut className="w-4 h-4" />
              <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
