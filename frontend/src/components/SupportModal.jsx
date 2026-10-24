import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, LifeBuoy, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { submitSupportRequest } from '../services/supportService';
import { extractErrorMessage } from '../services/api';

export const SupportModal = ({ isOpen, onClose }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const validateEmail = (val) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    // Client-side validations
    if (!trimmedName || trimmedName.length < 2) {
      setError('Please provide your full name (minimum 2 characters).');
      return;
    }
    if (!trimmedEmail) {
      setError('Please provide your email address.');
      return;
    }
    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!trimmedSubject || trimmedSubject.length < 3) {
      setError('Please enter a descriptive subject (minimum 3 characters).');
      return;
    }
    if (!trimmedMessage || trimmedMessage.length < 10) {
      setError('Please enter a message explaining your request (minimum 10 characters).');
      return;
    }

    try {
      setLoading(true);
      const res = await submitSupportRequest({
        full_name: trimmedName,
        email: trimmedEmail,
        subject: trimmedSubject,
        message: trimmedMessage,
        website: honeypot, // Spam honeypot
      });

      setSuccess(true);
      setSuccessMessage(res.message || 'Your support request has been dispatched successfully.');
    } catch (err) {
      const friendlyErr = extractErrorMessage(err);
      setError(friendlyErr);
      // Preserves form values on failure
    } finally {
      setLoading(false);
    }
  };

  const handleResetForm = () => {
    setFullName('');
    setEmail('');
    setSubject('');
    setMessage('');
    setHoneypot('');
    setError('');
    setSuccess(false);
    setSuccessMessage('');
  };

  const handleModalClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-sm overflow-y-auto transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleModalClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-6 transition-all transform animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-[#2563EB] dark:text-blue-400 flex items-center justify-center shrink-0">
              <LifeBuoy className="w-5 h-5 text-[#2563EB] dark:text-blue-400" />
            </div>
            <div>
              <h2
                id="support-modal-title"
                className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-slate-100 leading-tight"
              >
                Contact Support
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Direct inquiry dispatched via Gmail SMTP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            disabled={loading}
            aria-label="Close support dialog"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6">
          {success ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-slate-100">
                  Support Request Received!
                </h3>
                <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-300 leading-relaxed">
                  {successMessage ||
                    'Your message was sent to our support desk. A representative will contact your email address shortly.'}
                </p>
              </div>

              {/* Direct channels reminder */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-center gap-3">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-500" />
                  <a href="mailto:dataanalystagent@gmail.com" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    dataanalystagent@gmail.com
                  </a>
                </span>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-500" />
                  <a href="tel:9021964018" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                    9021964018
                  </a>
                </span>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
                >
                  Send Another Inquiry
                </button>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#4778E8] hover:bg-[#3664CC] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Quick direct support badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 text-xs">
                <span className="text-[#334155] dark:text-slate-300">
                  Direct Line: <strong className="text-slate-900 dark:text-white">9021964018</strong>
                </span>
                <a
                  href="mailto:dataanalystagent@gmail.com"
                  className="text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  <span>dataanalystagent@gmail.com</span>
                </a>
              </div>

              {/* Error Banner */}
              {error && (
                <div
                  className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5 animate-in fade-in"
                  role="alert"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Spam Honeypot Field (hidden) */}
              <div className="opacity-0 absolute -z-10 h-0 w-0 overflow-hidden" aria-hidden="true">
                <label htmlFor="support-website">Leave this field blank</label>
                <input
                  type="text"
                  id="support-website"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Full Name & Email grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="support-full-name"
                    className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1"
                  >
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="support-full-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    disabled={loading}
                    maxLength={100}
                    required
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="support-email"
                    className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="support-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={loading}
                    maxLength={255}
                    required
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all"
                  />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label
                  htmlFor="support-subject"
                  className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1"
                >
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  id="support-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How can our data analyst team assist you?"
                  disabled={loading}
                  maxLength={200}
                  required
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all"
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="support-message"
                    className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                  >
                    Message <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {message.length}/5000
                  </span>
                </div>
                <textarea
                  id="support-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe your question, dataset challenge, or platform technical issue in detail..."
                  disabled={loading}
                  maxLength={5000}
                  required
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all resize-y"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleModalClose}
                  disabled={loading}
                  className="px-4 py-2.5 text-xs font-semibold text-[#475569] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-[#4778E8] hover:bg-[#3864C7] text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs hover:shadow flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Support Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportModal;
