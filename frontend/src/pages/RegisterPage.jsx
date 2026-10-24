import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractErrorMessage } from '../services/api';
import { User, Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff, BarChart3 } from 'lucide-react';

export const RegisterPage = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const validateEmail = (val) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    // 1. Required fields validation
    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    // 2. Email format validation
    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    // 3. Password length (minimum 8 characters)
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    // 4. Password complexity (letter + number or symbol)
    if (!/[A-Za-z]/.test(password) || !/[0-9!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setError('Password must contain at least one letter and one number or special character.');
      return;
    }

    // 5. Password confirmation match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await register(trimmedName, trimmedEmail, password, confirmPassword);
      // Section 4 & 12: Redirect to login with success state
      navigate('/login', {
        state: { registrationSuccess: true },
        replace: true,
      });
    } catch (err) {
      const friendlyMessage = extractErrorMessage(err);
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-12 px-4">
      {/* Create Account Container (Section 4) */}
      <div className="bg-gradient-to-b from-[#FAFCFF] to-white dark:from-slate-900 dark:to-slate-900/95 border border-[#DFE7F2] dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-md p-6 sm:p-8 transition-shadow">
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#EAF3FF] dark:bg-blue-950/60 border border-[#BFDBFE] dark:border-blue-900/60 flex items-center justify-center text-[#4778E8] shrink-0 shadow-xs">
            <BarChart3 className="w-6 h-6 text-[#4778E8]" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-[#294C9B] dark:text-blue-300 tracking-tight">Create Account</h2>
            <p className="text-xs text-[#6B7890] dark:text-slate-400 mt-0.5">Start analyzing datasets with autonomous AI workflows</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#26334A] dark:text-slate-200 mb-1.5">Full Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Example User"
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F2] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4778E8]/20 focus:border-[#4778E8] disabled:bg-slate-50 transition-all text-[#26334A] dark:text-white placeholder:text-[#94A3B8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26334A] dark:text-slate-200 mb-1.5">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={loading}
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F2] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4778E8]/20 focus:border-[#4778E8] disabled:bg-slate-50 transition-all text-[#26334A] dark:text-white placeholder:text-[#94A3B8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26334A] dark:text-slate-200 mb-1.5">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                disabled={loading}
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F2] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4778E8]/20 focus:border-[#4778E8] disabled:bg-slate-50 transition-all text-[#26334A] dark:text-white placeholder:text-[#94A3B8]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#26334A] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-[#6B7890] dark:text-slate-400 mt-1">Must be at least 8 characters with letters & numbers/symbols</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#26334A] dark:text-slate-200 mb-1.5">Confirm Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={loading}
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-[#DFE7F2] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4778E8]/20 focus:border-[#4778E8] disabled:bg-slate-50 transition-all text-[#26334A] dark:text-white placeholder:text-[#94A3B8]"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#26334A] cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl shadow-xs hover:shadow flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Creating account...</span>
              </div>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[#6B7890] dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-[#059669] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
