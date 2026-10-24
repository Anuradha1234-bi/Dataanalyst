import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  MessageSquareHeart,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lightbulb,
  Bug,
  AlertTriangle,
  Smile,
} from 'lucide-react';
import { submitFeedback } from '../services/feedbackService';
import { extractErrorMessage } from '../services/api';

const FEEDBACK_TYPES = [
  { value: 'Suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { value: 'Bug Report', label: 'Bug Report', icon: Bug, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  { value: 'Complaint', label: 'Complaint', icon: AlertTriangle, color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
  { value: 'General Feedback', label: 'General Feedback', icon: Smile, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
];

const RATING_LABELS = {
  1: '1 - Poor',
  2: '2 - Fair',
  3: '3 - Good',
  4: '4 - Very Good',
  5: '5 - Excellent',
};

export const FeedbackModal = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [feedbackType, setFeedbackType] = useState('Suggestion');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Close on Escape key
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

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    // Client-side validations
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      setError('Please provide a valid email address or leave the field blank.');
      return;
    }
    if (!feedbackType) {
      setError('Please select a feedback type.');
      return;
    }
    if (!trimmedMessage || trimmedMessage.length < 5) {
      setError('Please provide feedback comments (minimum 5 characters).');
      return;
    }

    try {
      setLoading(true);
      const res = await submitFeedback({
        name: trimmedName || undefined,
        email: trimmedEmail || undefined,
        feedback_type: feedbackType,
        rating: rating > 0 ? rating : undefined,
        message: trimmedMessage,
        website: honeypot, // Spam bot trap
      });

      setSuccess(true);
      setSuccessMessage(res.message || 'Thank you for your feedback! It helps improve the platform.');
    } catch (err) {
      const friendlyErr = extractErrorMessage(err);
      setError(friendlyErr);
    } finally {
      setLoading(false);
    }
  };

  const handleResetForm = () => {
    setName('');
    setEmail('');
    setFeedbackType('Suggestion');
    setRating(0);
    setHoverRating(0);
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
      aria-labelledby="feedback-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleModalClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden my-6 transition-all transform animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-50/70 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <MessageSquareHeart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2
                id="feedback-modal-title"
                className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-slate-100 leading-tight"
              >
                Send Us Feedback
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Share your ideas, suggestions, or bug reports
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            disabled={loading}
            aria-label="Close feedback dialog"
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
                  Thank You for Your Feedback!
                </h3>
                <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-300 leading-relaxed">
                  {successMessage ||
                    'Your insights and suggestions have been delivered directly to our product and engineering team.'}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-4 py-2 text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 rounded-xl transition-colors cursor-pointer"
                >
                  Submit More Feedback
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
                <label htmlFor="feedback-website">Leave this field blank</label>
                <input
                  type="text"
                  id="feedback-website"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Feedback Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1.5">
                  Feedback Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FEEDBACK_TYPES.map((type) => {
                    const IconComponent = type.icon;
                    const isSelected = feedbackType === type.value;
                    return (
                      <button
                        type="button"
                        key={type.value}
                        onClick={() => setFeedbackType(type.value)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 font-bold'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <IconComponent className={`w-4 h-4 mb-1 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                        <span className="text-center text-[11px] leading-tight">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Star Rating (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                    Overall Experience Rating <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  {(rating > 0 || hoverRating > 0) && (
                    <span className="text-xs font-semibold text-amber-500 dark:text-amber-400">
                      {RATING_LABELS[hoverRating || rating]}
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl"
                  role="radiogroup"
                  aria-label="Star Rating from 1 to 5"
                >
                  {[1, 2, 3, 4, 5].map((starValue) => {
                    const isFilled = (hoverRating || rating) >= starValue;
                    return (
                      <button
                        key={starValue}
                        type="button"
                        role="radio"
                        aria-checked={rating === starValue}
                        aria-label={`${starValue} Star${starValue > 1 ? 's' : ''}`}
                        onClick={() => setRating(rating === starValue ? 0 : starValue)}
                        onMouseEnter={() => setHoverRating(starValue)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <Star
                          className={`w-5 h-5 transition-transform hover:scale-110 ${
                            isFilled
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                      </button>
                    );
                  })}
                  {rating > 0 && (
                    <button
                      type="button"
                      onClick={() => setRating(0)}
                      className="ml-auto text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="feedback-message"
                    className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200"
                  >
                    Feedback Message <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {message.length}/5000
                  </span>
                </div>
                <textarea
                  id="feedback-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What did you like? What features would you love to see in AI Data Analyst Agent?"
                  disabled={loading}
                  maxLength={5000}
                  required
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all resize-y"
                />
              </div>

              {/* Optional Name and Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label
                    htmlFor="feedback-name"
                    className="block text-xs font-medium text-[#475569] dark:text-slate-300 mb-1"
                  >
                    Your Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="feedback-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex"
                    disabled={loading}
                    maxLength={100}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="feedback-email"
                    className="block text-xs font-medium text-[#475569] dark:text-slate-300 mb-1"
                  >
                    Your Email <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    disabled={loading}
                    maxLength={255}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB] text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] disabled:opacity-60 transition-all"
                  />
                </div>
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
                      <span>Sending Feedback...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Feedback</span>
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

export default FeedbackModal;
