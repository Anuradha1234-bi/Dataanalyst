import React, { useState } from 'react';
import { Mail, Phone, LifeBuoy, MessageSquareHeart } from 'lucide-react';
import { SupportModal } from './SupportModal';
import { FeedbackModal } from './FeedbackModal';

export const SignInFooter = ({
  onOpenSupport,
  onOpenFeedback,
  className = '',
  compact = false,
}) => {
  const [internalSupportOpen, setInternalSupportOpen] = useState(false);
  const [internalFeedbackOpen, setInternalFeedbackOpen] = useState(false);

  const handleOpenSupport = () => {
    if (onOpenSupport) {
      onOpenSupport();
    } else {
      setInternalSupportOpen(true);
    }
  };

  const handleOpenFeedback = () => {
    if (onOpenFeedback) {
      onOpenFeedback();
    } else {
      setInternalFeedbackOpen(true);
    }
  };

  return (
    <>
      <footer
        className={`w-full bg-[#0B1120] text-slate-400 border-t border-slate-800 transition-colors duration-200 ${className}`}
        aria-label="Sign-in page footer"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
            {/* Left: Direct Support Contacts (Email & Phone) */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 sm:gap-6 text-xs">
              <a
                href="mailto:dataanalystagent@gmail.com"
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-blue-400 transition-colors font-medium group"
                aria-label="Send email to support at dataanalystagent@gmail.com"
              >
                <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                </div>
                <span>dataanalystagent@gmail.com</span>
              </a>

              <a
                href="tel:9021964018"
                className="inline-flex items-center gap-1.5 text-slate-300 hover:text-emerald-400 transition-colors font-medium group"
                aria-label="Call support at 9021964018"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <span>9021964018</span>
              </a>
            </div>

            {/* Center / Right: Interactive Form Triggers & Copyright */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs">
              {/* Contact Support Button */}
              <button
                type="button"
                onClick={handleOpenSupport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-white transition-all cursor-pointer font-medium shadow-2xs hover:shadow-xs active:scale-98"
                aria-label="Open contact support form dialog"
              >
                <LifeBuoy className="w-3.5 h-3.5 text-blue-400" />
                <span>Contact Support</span>
              </button>

              {/* Feedback Button */}
              <button
                type="button"
                onClick={handleOpenFeedback}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:text-white transition-all cursor-pointer font-medium shadow-2xs hover:shadow-xs active:scale-98"
                aria-label="Open feedback form dialog"
              >
                <MessageSquareHeart className="w-3.5 h-3.5 text-purple-400" />
                <span>Feedback</span>
              </button>

              <span className="hidden lg:inline text-slate-700">•</span>

              {/* Copyright Text */}
              <p className="text-[11px] text-slate-500 text-center sm:text-left">
                &copy; {new Date().getFullYear()} AI Data Analyst Agent. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Internal Modals if triggered standalone */}
      {!onOpenSupport && (
        <SupportModal
          isOpen={internalSupportOpen}
          onClose={() => setInternalSupportOpen(false)}
        />
      )}
      {!onOpenFeedback && (
        <FeedbackModal
          isOpen={internalFeedbackOpen}
          onClose={() => setInternalFeedbackOpen(false)}
        />
      )}
    </>
  );
};

export default SignInFooter;
