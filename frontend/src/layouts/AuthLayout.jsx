import React, { useState } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Sun,
  Moon,
  BarChart3,
  Mail,
  Phone,
  LifeBuoy,
  MessageSquareHeart,
} from 'lucide-react';
import { SupportModal } from '../components/SupportModal';
import { FeedbackModal } from '../components/FeedbackModal';

export const AuthLayout = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const isLoginPage = location.pathname === '/login';
  const isRegisterPage = location.pathname === '/register';

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-main)] flex flex-col text-[var(--text-primary)] selection:bg-blue-600 selection:text-white transition-colors duration-200">
      {/* Top Brand Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[var(--header-bg)]/90 backdrop-blur-md border-b border-[var(--header-border)] transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#294C9B] to-[#4778E8] text-white flex items-center justify-center shadow-xs group-hover:shadow transition-all">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-[var(--text-primary)] block leading-tight">
                AI Data Analyst Agent
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] hidden sm:block leading-tight">
                Upload, Understand, Clean & Analyze
              </span>
            </div>
          </Link>

          {/* Quick Guidance Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-[var(--text-secondary)]">
            <a href="/login#who-should-use" className="hover:text-blue-500 transition-colors">
              Who It's For
            </a>
            <a href="/login#how-to-use" className="hover:text-blue-500 transition-colors">
              How It Works
            </a>
            <a href="/login#supported-data" className="hover:text-blue-500 transition-colors">
              Data & Privacy
            </a>
            <button
              type="button"
              onClick={() => setSupportModalOpen(true)}
              className="hover:text-blue-500 transition-colors cursor-pointer"
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => setFeedbackModalOpen(true)}
              className="hover:text-purple-500 transition-colors cursor-pointer"
            >
              Feedback
            </button>
          </nav>

          {/* Right Action Switcher & Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer text-xs font-medium shadow-xs"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-amber-400">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-500" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-700">Dark</span>
                </>
              )}
            </button>

            {isRegisterPage ? (
              <Link
                to="/login"
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 px-3.5 py-2 rounded-lg hover:bg-blue-500/10 transition-colors"
              >
                Sign In
              </Link>
            ) : (
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#4F7DF3] hover:bg-[#3B66D6] text-white px-3.5 py-2 rounded-lg shadow-xs hover:shadow transition-all"
              >
                <span>Create Account</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Area */}
      <main className="flex-1 w-full min-w-0">
        <Outlet />
      </main>

      {/* =========================================================================
          SECTION 12: SIGN-IN PAGE FOOTER
          A. Contact / Help section above the footer
          B. Dark navy footer below with organized columns and direct support options
      ========================================================================= */}

      {/* Part A: Contact / Need Help Banner Above the Footer */}
      <section className="bg-white dark:bg-slate-900 border-t border-[var(--border-color)] py-10 sm:py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[#4778E8] dark:text-blue-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Assisted Data Science Workflow</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#294C9B] dark:text-blue-300 tracking-tight">
              Need help with your data analysis?
            </h2>
            <div className="h-1 w-20 bg-gradient-to-r from-[#4778E8] via-[#7465D9] to-[#38A995] rounded-full my-2" />
            <p className="text-sm text-[#6B7890] dark:text-slate-400 leading-relaxed">
              From automated dataset profiling and statistical anomaly detection to rule-based data cleaning and machine learning predictions, our team is here to assist. Contact support or share your thoughts with us.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSupportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition-all cursor-pointer"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>Contact Support</span>
            </button>
            <button
              type="button"
              onClick={() => setFeedbackModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            >
              <MessageSquareHeart className="w-4 h-4 text-purple-500" />
              <span>Feedback</span>
            </button>
            <a
              href="/login#how-to-use"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-subtle)] text-[var(--text-primary)] font-medium text-xs sm:text-sm transition-all group"
            >
              <span>Explore 9-Step Guide</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Part B: Contrasting Dark Navy Footer Below */}
      <footer className="bg-[#0B1120] text-slate-400 border-t border-slate-800 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
            {/* Column 1: Application Branding & Mascot (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-xs">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <span className="font-bold text-base sm:text-lg text-white tracking-tight block">
                    AI Data Analyst Agent
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Autonomous Exploratory Data Intelligence
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pr-2">
                A self-hosted, explainable data analysis platform combining deterministic pandas & scikit-learn analytics with natural language synthesis. Clean, profile, analyze, and forecast datasets with zero guesswork.
              </p>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Local Session Security with Argon2 & JWT</span>
              </div>
            </div>

            {/* Column 2: Capabilities (3 cols) */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Core Capabilities
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href="/login#supported-data" className="hover:text-blue-400 transition-colors flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Dataset Ingestion (.csv, .xlsx)</span>
                  </a>
                </li>
                <li>
                  <a href="/login#how-to-use" className="hover:text-blue-400 transition-colors flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    <span>Automated Statistical Profiling</span>
                  </a>
                </li>
                <li>
                  <a href="/login#how-to-use" className="hover:text-blue-400 transition-colors flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    <span>Rule-Based Data Cleaning</span>
                  </a>
                </li>
                <li>
                  <a href="/login#how-to-use" className="hover:text-blue-400 transition-colors flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Anomaly & Outlier Detection</span>
                  </a>
                </li>
                <li>
                  <a href="/login#who-should-use" className="hover:text-blue-400 transition-colors flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span>Predictive ML Regression & Classifiers</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3: Documentation & Guides (2 cols) */}
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Guides
              </h3>
              <ul className="space-y-2 text-xs">
                <li>
                  <a href="/login#who-should-use" className="hover:text-blue-400 transition-colors">
                    Target Audiences
                  </a>
                </li>
                <li>
                  <a href="/login#how-to-use" className="hover:text-blue-400 transition-colors">
                    9-Step Workflow
                  </a>
                </li>
                <li>
                  <a href="/login#supported-data" className="hover:text-blue-400 transition-colors">
                    Data Structures
                  </a>
                </li>
                <li>
                  <a href="/login#supported-data" className="hover:text-blue-400 transition-colors">
                    Data Privacy
                  </a>
                </li>
                <li>
                  <Link to="/forgot-password" className="hover:text-blue-400 transition-colors">
                    Password Reset
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Contact Support & Feedback (3 cols) */}
            <div className="lg:col-span-3 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Contact & Support
              </h3>
              <ul className="space-y-2.5 text-xs">
                <li>
                  <a
                    href="mailto:dataanalystagent@gmail.com"
                    aria-label="Send email to support at dataanalystagent@gmail.com"
                    title="Send email to support"
                    className="hover:text-blue-400 transition-colors flex items-center gap-2 group"
                  >
                    <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="group-hover:underline">dataanalystagent@gmail.com</span>
                  </a>
                </li>
                <li>
                  <a
                    href="tel:9021964018"
                    aria-label="Call support at 9021964018"
                    title="Call support line"
                    className="hover:text-emerald-400 transition-colors flex items-center gap-2 group"
                  >
                    <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="group-hover:underline">9021964018</span>
                  </a>
                </li>
                <li className="pt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSupportModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <LifeBuoy className="w-3.5 h-3.5 text-blue-400" />
                    <span>Contact Support</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackModalOpen(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <MessageSquareHeart className="w-3.5 h-3.5 text-purple-400" />
                    <span>Feedback</span>
                  </button>
                </li>
              </ul>

              <div className="pt-2">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                  <div className="font-semibold text-slate-300">FastAPI & Gmail SMTP</div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>STARTTLS Port 587 Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Sign-In Sub-footer Bar */}
          <div className="border-t border-slate-800/80 pt-6 mt-10 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p>
              &copy; {new Date().getFullYear()} AI Data Analyst Agent. Built for deterministic, explainable data intelligence.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-[11px]">
              <a
                href="mailto:dataanalystagent@gmail.com"
                aria-label="Send email to support at dataanalystagent@gmail.com"
                title="Send email to support"
                className="hover:text-blue-400 transition-colors flex items-center gap-1"
              >
                <Mail className="w-3 h-3 text-blue-400" />
                <span>dataanalystagent@gmail.com</span>
              </a>
              <span className="text-slate-700">•</span>
              <a
                href="tel:9021964018"
                aria-label="Call support at 9021964018"
                title="Call support line"
                className="hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                <Phone className="w-3 h-3 text-emerald-400" />
                <span>9021964018</span>
              </a>
              <span className="text-slate-700">•</span>
              <button
                type="button"
                onClick={() => setSupportModalOpen(true)}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Contact Support
              </button>
              <span className="text-slate-700">•</span>
              <button
                type="button"
                onClick={() => setFeedbackModalOpen(true)}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Feedback
              </button>
              <span className="text-slate-700">•</span>
              <Link to="/login" className="hover:text-slate-300 transition-colors">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Support & Feedback Modals */}
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

export default AuthLayout;
