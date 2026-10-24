import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractErrorMessage } from '../services/api';
import {
  User,
  Lock,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  GraduationCap,
  BarChart3,
  Building2,
  Cpu,
  Search,
  Users,
  Upload,
  PieChart,
  ShieldAlert,
  Wand2,
  MessageSquare,
  TrendingUp,
  FileText,
  History,
  Database,
  FileCheck2,
  HardDrive,
  Shield,
  HelpCircle,
  Mail,
  Phone,
  LifeBuoy,
  MessageSquareHeart,
} from 'lucide-react';
import { SupportModal } from '../components/SupportModal';
import { FeedbackModal } from '../components/FeedbackModal';

export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';
  const registrationSuccess = location.state?.registrationSuccess;
  const passwordResetSuccess = location.state?.passwordResetSuccess;
  const sessionExpired = new URLSearchParams(location.search).get('expired');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmed = identifier.trim();

    // Client-side validations
    if (!trimmed) {
      setError('Please enter your email or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      await login(trimmed, password, rememberMe);
      setIsSuccess(true);
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 400);
    } catch (err) {
      const friendlyMessage = extractErrorMessage(err);
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* =========================================================================
          HERO & LOGIN SECTION
      ========================================================================= */}
      <section className="relative overflow-hidden pt-8 pb-16 lg:py-20 border-b border-[#DFE7F2] dark:border-slate-800 bg-gradient-to-b from-[#F6F8FC] via-white to-[#F6F8FC] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Brand Hero Pitch */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4778E8]/10 border border-[#4778E8]/20 text-[#4778E8] dark:text-blue-400 text-xs font-semibold tracking-wide">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Next-Generation Structured Data Intelligence</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>AI Agent Ready</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#294C9B] dark:text-blue-300 tracking-tight leading-tight">
                AI Data Analyst Agent
              </h1>

              <p className="text-lg sm:text-xl text-[#4778E8] dark:text-blue-400 font-semibold max-w-2xl mx-auto lg:mx-0">
                Upload, Understand, Clean and Analyze Your Data with AI.
              </p>

              <p className="text-sm text-[#6B7890] dark:text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
                Transform raw CSV and Excel datasets into interactive statistical profiles, detected anomalies, automated data-cleaning steps, and actionable executive summaries.
              </p>

              {/* Quick Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 max-w-2xl mx-auto lg:mx-0 text-left">
                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#26334A] dark:text-slate-200 mb-1">
                    <PieChart className="w-4 h-4 text-[#4778E8]" />
                    <span>Instant Profiling</span>
                  </div>
                  <p className="text-[11px] text-[#6B7890] dark:text-slate-400">
                    Full column statistics, missing values & distribution charts.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#26334A] dark:text-slate-200 mb-1">
                    <Wand2 className="w-4 h-4 text-[#7465D9]" />
                    <span>Smart Cleaning</span>
                  </div>
                  <p className="text-[11px] text-[#6B7890] dark:text-slate-400">
                    AI deduplication, whitespace trimming & imputation.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#26334A] dark:text-slate-200 mb-1">
                    <MessageSquare className="w-4 h-4 text-[#38A995]" />
                    <span>Natural Q&A</span>
                  </div>
                  <p className="text-[11px] text-[#6B7890] dark:text-slate-400">
                    Ask plain-English questions to query your datasets.
                  </p>
                </div>
              </div>

              {/* Quick Jump Buttons */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
                <a
                  href="#who-should-use"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#26334A] dark:text-slate-200 hover:text-[#4778E8] bg-white dark:bg-slate-800 border border-[#DFE7F2] dark:border-slate-700 px-3.5 py-2 rounded-xl shadow-2xs hover:border-[#4778E8] transition-colors"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Who Should Use This</span>
                </a>
                <a
                  href="#how-to-use"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#26334A] dark:text-slate-200 hover:text-[#4778E8] bg-white dark:bg-slate-800 border border-[#DFE7F2] dark:border-slate-700 px-3.5 py-2 rounded-xl shadow-2xs hover:border-[#4778E8] transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How It Works (9 Steps)</span>
                </a>
              </div>
            </div>

            {/* Right Column: Refined Sign-In Card (Section 3) */}
            <div className="lg:col-span-5 max-w-md w-full mx-auto">
              <div className="bg-gradient-to-b from-[#FAFCFF] to-white dark:from-slate-900 dark:to-slate-900/95 border border-[#DFE7F2] dark:border-slate-800 rounded-3xl shadow-sm hover:shadow-md p-6 sm:p-8 transition-shadow">
                <div className="flex items-center gap-3.5 mb-6">
                  {/* Restored original graph-style icon */}
                  <div className="w-12 h-12 rounded-2xl bg-[#EAF3FF] dark:bg-blue-950/60 border border-[#BFDBFE] dark:border-blue-900/60 flex items-center justify-center text-[#4778E8] shrink-0 shadow-xs">
                    <BarChart3 className="w-6 h-6 text-[#4778E8]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-[#294C9B] dark:text-blue-300 tracking-tight">Sign In</h2>
                    <p className="text-xs text-[#6B7890] dark:text-slate-400 mt-0.5">
                      Access your datasets, analysis history, and reports
                    </p>
                  </div>
                </div>

                {/* Status Banners */}
                {passwordResetSuccess && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Password reset successfully! Please sign in with your new password.</span>
                  </div>
                )}

                {registrationSuccess && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Account created successfully! Please sign in with your credentials.</span>
                  </div>
                )}

                {sessionExpired && (
                  <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Your session has expired. Please sign in again.</span>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {/* Email or Username */}
                  <div>
                    <label
                      htmlFor="login-identifier"
                      className="block text-xs font-semibold text-[#0F172A] mb-1.5"
                    >
                      Email or Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        id="login-identifier"
                        type="text"
                        autoComplete="username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="name@example.com or username"
                        disabled={loading || isSuccess}
                        required
                        className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:bg-slate-50 transition-all text-[#0F172A] placeholder:text-[#94A3B8]"
                      />
                    </div>
                  </div>

                  {/* Password with Show/Hide Toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Password
                      </label>
                      <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] hover:underline"
                      >
                        Forgot Password?
                      </Link>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading || isSuccess}
                        required
                        className="w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] disabled:bg-slate-50 transition-all text-[#0F172A] placeholder:text-[#94A3B8]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#0F172A] cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <label className="flex items-center gap-2 text-[#475569] cursor-pointer select-none">
                      <input
                        id="remember-me"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={loading || isSuccess}
                        className="w-4 h-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                      />
                      <span>Remember session (7 days)</span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || isSuccess}
                    className="w-full mt-3 py-2.5 px-4 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl shadow-xs hover:shadow flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Signing In...</span>
                      </div>
                    ) : isSuccess ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span>Authenticated</span>
                      </div>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Create Account Link */}
                <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-slate-800 text-center text-xs text-[#64748B] dark:text-slate-400">
                  New to AI Data Analyst Agent?{' '}
                  <Link
                    to="/register"
                    className="font-semibold text-[#2563EB] dark:text-blue-400 hover:underline"
                  >
                    Create Account
                  </Link>
                </div>

                {/* Direct Support & Feedback Quick Strip */}
                <div className="mt-4 pt-3.5 border-t border-dashed border-[#E2E8F0] dark:border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-[#64748B] dark:text-slate-400 gap-2">
                  <div className="flex items-center gap-2">
                    <a
                      href="mailto:dataanalystagent@gmail.com"
                      className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                      title="Email Support"
                    >
                      <Mail className="w-3 h-3 text-blue-500" />
                      <span>Support</span>
                    </a>
                    <span>•</span>
                    <a
                      href="tel:9021964018"
                      className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 transition-colors"
                      title="Call Support"
                    >
                      <Phone className="w-3 h-3 text-emerald-500" />
                      <span>9021964018</span>
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSupportModalOpen(true)}
                      className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                    >
                      Help Form
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => setFeedbackModalOpen(true)}
                      className="text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
                    >
                      Feedback
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 5: WHO SHOULD USE THIS PLATFORM?
      ========================================================================= */}
      <section id="who-should-use" className="py-16 sm:py-20 bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold mb-3">
              <Users className="w-3.5 h-3.5" />
              <span>Target Audiences</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
              Who Should Use This Platform?
            </h2>
            <p className="text-sm sm:text-base text-[#64748B] mt-2">
              Tailored analytical capabilities designed for users across academia, analytics, business management, and industry research.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Students & Researchers */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Students and Researchers
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Explore datasets and understand statistical patterns.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Learn hands-on data profiling and exploratory data analysis.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Generate clear, evidence-based data summaries for academic projects.</span>
                </li>
              </ul>
            </div>

            {/* Card 2: Data Analysts */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Data Analysts
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Inspect datasets and identify hidden data-quality problems.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Clean messy data and investigate historical trends quickly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Generate structured reports and analytical insights for stakeholders.</span>
                </li>
              </ul>
            </div>

            {/* Card 3: Business Owners and Managers */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Business Owners and Managers
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Understand business performance without writing code.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Examine sales, expenses, and operational performance metrics.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Support key decisions using empirical evidence from uploaded data.</span>
                </li>
              </ul>
            </div>

            {/* Card 4: Data Science & AI/ML Learners */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Data Science and AI/ML Learners
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Explore datasets thoroughly before model development.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Identify missing values, anomalies, and candidate features.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Investigate feature distributions that support prediction tasks.</span>
                </li>
              </ul>
            </div>

            {/* Card 5: Researchers and Domain Professionals */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Researchers and Domain Professionals
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Analyze structured research surveys and operational telemetry data.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Compare variables, cross-tabulations, and correlation scores.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Generate clear summary statistics and tabular exports for documentation.</span>
                </li>
              </ul>
            </div>

            {/* Card 6: Organizations and Teams */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Organizations and Teams
              </h3>
              <ul className="space-y-2 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Explore business datasets and automated reporting workflows.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Maintain data isolation with per-user dataset sandboxing.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#2563EB] font-bold">•</span>
                  <span>Access analytical tools with appropriate authorization and controls.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 6: HOW TO USE AI DATA ANALYST AGENT (9-STEP WORKFLOW)
      ========================================================================= */}
      <section id="how-to-use" className="py-16 sm:py-20 bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold mb-3">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Step-by-Step Workflow</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
              How to Use AI Data Analyst Agent
            </h2>
            <p className="text-sm sm:text-base text-[#64748B] mt-2">
              Follow this systematic workflow to explore, diagnose, clean, and extract intelligence from your datasets.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    1
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#2563EB]" />
                  <span>Create Account & Sign In</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Register with your email or username and sign in to access your secure, isolated workspace.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    2
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#2563EB]" />
                  <span>Upload Dataset</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Upload supported CSV or Excel (.xlsx, .xls) files up to 50MB for immediate local parsing and storage.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    3
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-[#2563EB]" />
                  <span>Open Data Profile</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Inspect columns, inferred datatypes, mean/median/std statistics, null counts, and value distributions.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    4
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#2563EB]" />
                  <span>Open Data Quality</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Scan for missing values, duplicate rows, column inconsistencies, and overall dataset hygiene scores.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    5
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-[#2563EB]" />
                  <span>Use Data Cleaning</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Review AI-assisted cleaning suggestions, remove duplicate records, handle nulls, and trim whitespaces.
                </p>
              </div>
            </div>

            {/* Step 6 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    6
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#2563EB]" />
                  <span>Ask Natural Language Q&A</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Use the Data Analyst chat to query the active dataset in plain English with automated answers and query explanations.
                </p>
              </div>
            </div>

            {/* Step 7 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    7
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#2563EB]" />
                  <span>Analytics, Anomalies & Predictions</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Explore multivariate correlations, detect statistical outliers with Isolation Forest, and train ML predictive models.
                </p>
              </div>
            </div>

            {/* Step 8 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    8
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2563EB]" />
                  <span>Generate & Download Reports</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Compile comprehensive executive audit reports and export findings in downloadable PDF, HTML, or JSON formats.
                </p>
              </div>
            </div>

            {/* Step 9 */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#2563EB] text-white text-xs font-bold">
                    9
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Operational
                  </span>
                </div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1.5 flex items-center gap-2">
                  <History className="w-4 h-4 text-[#2563EB]" />
                  <span>Review History & Datasets</span>
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Revisit previous queries, inspect prior cleaning runs, and delete or replace datasets as needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 7: SUPPORTED DATA & PRIVACY GUIDANCE
      ========================================================================= */}
      <section id="supported-data" className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#2563EB] text-xs font-semibold mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Data Governance & Guidelines</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] tracking-tight">
              Supported Data and Privacy Guidance
            </h2>
            <p className="text-sm sm:text-base text-[#64748B] mt-2">
              Learn about supported file types, user responsibilities, and how your datasets are processed and stored.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Box 1: File Formats */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Supported File Types & Limits
              </h3>
              <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
                The application supports tabular files in the following verified formats:
              </p>
              <ul className="space-y-1.5 text-xs text-[#475569]">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"></span>
                  <span><strong>CSV</strong> (Comma Separated Values, .csv)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"></span>
                  <span><strong>Excel</strong> (.xlsx and legacy .xls)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"></span>
                  <span>Maximum file size: <strong>50 MB</strong> per upload</span>
                </li>
              </ul>
            </div>

            {/* Box 2: Sensitive Data & Authorization */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Authorized Use & Sensitive Data
              </h3>
              <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
                Please maintain strict data hygiene and adhere to the following safety policies:
              </p>
              <ul className="space-y-1.5 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>Upload only data you are legally authorized and permitted to access.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>Never upload plaintext passwords, API keys, or secret tokens.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>Avoid payment-card details (PAN/CVV) or unnecessary personal identifiers.</span>
                </li>
              </ul>
            </div>

            {/* Box 3: Storage & Retention */}
            <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center mb-4">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] mb-2">
                Storage & Data Retention
              </h3>
              <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
                Datasets and reports are managed according to the active application storage design:
              </p>
              <ul className="space-y-1.5 text-xs text-[#475569]">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>Uploaded files are saved in the project's local <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[11px]">uploads/</code> folder.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>Generated reports reside locally in <code className="bg-slate-200/60 px-1 py-0.5 rounded text-[11px]">reports/</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] mt-1"></span>
                  <span>You can delete your datasets at any time from the Datasets page.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Support and Feedback Modals */}
      <SupportModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
      />
    </div>
  );
};
