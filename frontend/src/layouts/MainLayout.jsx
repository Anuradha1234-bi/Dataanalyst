import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { datasetService } from '../services/datasetService';
import {
  Database,
  LayoutDashboard,
  UploadCloud,
  FileSearch,
  ShieldCheck,
  Filter,
  MessageSquare,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  FileText,
  Settings,
  Clock,
  User,
  LogOut,
  LogIn,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Check,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    title: null, // Top primary items
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Upload Dataset', path: '/upload', icon: UploadCloud },
    ],
  },
  {
    title: 'DATA',
    items: [
      { name: 'Datasets', path: '/datasets', icon: Database },
      { name: 'Data Profile', path: '/profile-data', icon: FileSearch },
      { name: 'Data Quality', path: '/data-quality', icon: ShieldCheck },
      { name: 'Data Cleaning', path: '/data-cleaning', icon: Filter },
    ],
  },
  {
    title: 'ANALYSIS',
    items: [
      { name: 'Data Analyst', path: '/data-analyst', icon: MessageSquare },
      { name: 'Analytics', path: '/analytics', icon: BarChart3 },
      { name: 'Anomalies', path: '/anomalies', icon: AlertTriangle },
      { name: 'Predictions', path: '/predictions', icon: TrendingUp },
    ],
  },
  {
    title: 'OUTPUT',
    items: [
      { name: 'Insights', path: '/insights', icon: Lightbulb },
      { name: 'Reports', path: '/reports', icon: FileText },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { name: 'Settings', path: '/settings', icon: Settings },
      { name: 'History', path: '/history', icon: Clock },
      { name: 'Profile', path: '/profile', icon: User },
    ],
  },
];

export const MainLayout = () => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Dataset selector state in navbar
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetDropdownOpen, setDatasetDropdownOpen] = useState(false);
  const datasetDropdownRef = useRef(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Persist sidebar collapsed state
  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  // Load available datasets for the navbar selector
  useEffect(() => {
    let isMounted = true;
    const fetchDatasets = async () => {
      try {
        const data = await datasetService.getDatasets();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setDatasets(data);
          // Check if there is an active dataset in URL or default to first
          const params = new URLSearchParams(location.search);
          const currentId = params.get('dataset_id') || params.get('id');
          if (currentId) {
            const found = data.find((d) => String(d.id) === String(currentId));
            if (found) setSelectedDataset(found);
            else setSelectedDataset(data[0]);
          } else {
            setSelectedDataset(data[0]);
          }
        }
      } catch {
        // Fallback gracefully without breaking
      }
    };
    fetchDatasets();
    return () => {
      isMounted = false;
    };
  }, [location.search]);

  // Close dataset dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (datasetDropdownRef.current && !datasetDropdownRef.current.contains(e.target)) {
        setDatasetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Helper to determine if a nav item is active, supporting route aliases
  const isItemActive = (path) => {
    const current = location.pathname;
    if (path === '/profile-data') {
      return current === '/profile-data' || current === '/profiling';
    }
    if (path === '/data-cleaning') {
      return current === '/data-cleaning' || current === '/cleaning';
    }
    if (path === '/data-analyst') {
      return current === '/data-analyst' || current === '/analysis' || current === '/ask-analyst';
    }
    if (path === '/predictions') {
      return current === '/predictions' || current === '/prediction';
    }
    return current === path;
  };

  // Find active page title across all sections
  const allItems = NAV_SECTIONS.flatMap((sec) => sec.items);
  const activeItem = allItems.find((item) => isItemActive(item.path));
  const currentTitle = activeItem ? activeItem.name : (location.pathname === '/datasets' ? 'Datasets' : 'AI Data Analyst');

  // User display metadata
  const userFullName = user?.full_name || 'Samruddhi Ashok Dake';
  const userShortName = user?.full_name ? user.full_name.split(' ').slice(0, 2).join(' ') : 'Samruddhi Ashok';
  const userEmail = user?.email || 'dakes426@gmail.com';
  const userInitial = userFullName.charAt(0).toUpperCase() || 'S';

  const selectedDatasetName = selectedDataset?.original_filename || selectedDataset?.filename || 'Sales_Data.csv';

  return (
    <div className="flex h-full w-full max-w-[100vw] bg-[var(--bg-main)] text-[var(--text-primary)] overflow-hidden transition-colors duration-200">
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation - Approved Deep Green Theme */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-full max-h-full bg-[#073B36] text-[#F8FAFC] flex flex-col justify-between shrink-0 shadow-xl border-r border-[#0A4D46] select-none transition-all duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'w-[68px]' : 'w-64'}`}
        aria-label="Main navigation"
      >
        {/* Sidebar Header & Nav Items */}
        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {/* Brand Header */}
          <div className={`px-4 py-4 border-b border-[#0A4D46] shrink-0 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-3 min-w-0 overflow-hidden">
              {/* Stylized Modern 'A' Logo Glyph */}
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#059669] to-[#10B981] flex items-center justify-center shrink-0 shadow-sm text-white">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3L4 19h4.5l1.8-4.2h3.4L15.5 19H20L12 3z" fill="currentColor" fillOpacity="0.15" />
                  <path d="M12 3L4 19h4.5l1.8-4.2h3.4L15.5 19H20L12 3z" />
                  <path d="M10.3 14.8h3.4" strokeWidth="2" />
                </svg>
              </div>

              {!sidebarCollapsed && (
                <div className="min-w-0 overflow-hidden">
                  <h1 className="text-sm font-bold tracking-tight text-[#F8FAFC] truncate">
                    AI Data Analyst
                  </h1>
                  <p className="text-[10px] text-emerald-200/60 font-medium tracking-wide truncate">
                    Intelligent Workspace
                  </p>
                </div>
              )}
            </div>

            {/* Mobile close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-emerald-200/70 hover:text-white hover:bg-[#064E3B] transition-colors shrink-0 cursor-pointer"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Desktop collapse button */}
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="hidden lg:flex p-1.5 rounded-lg text-emerald-200/60 hover:text-white hover:bg-[#064E3B] transition-colors shrink-0 cursor-pointer"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Expand button when collapsed (desktop) */}
          {sidebarCollapsed && (
            <div className="hidden lg:flex justify-center py-2 border-b border-[#0A4D46]">
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded-lg text-emerald-200/60 hover:text-white hover:bg-[#064E3B] transition-colors cursor-pointer"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Grouped Navigation */}
          <nav className={`py-3 space-y-3 overflow-y-auto flex-1 min-h-0 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
            {NAV_SECTIONS.map((section, sIdx) => (
              <div key={sIdx} className="space-y-0.5">
                {section.title && !sidebarCollapsed && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-teal-200/60 tracking-wider uppercase">
                    {section.title}
                  </div>
                )}
                {section.title && sidebarCollapsed && (
                  <div className="h-px bg-[#0A4D46] mx-2 my-2" />
                )}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`group flex items-center rounded-xl text-xs transition-all duration-150 relative ${
                        sidebarCollapsed
                          ? 'justify-center w-10 h-10 mx-auto'
                          : 'gap-3 px-3 py-2.5'
                      } ${
                        active
                          ? 'bg-[#064E3B] text-[#F8FAFC] font-semibold shadow-xs'
                          : 'text-emerald-100/75 hover:text-[#F8FAFC] hover:bg-[#064E3B]/60 font-medium'
                      }`}
                      title={sidebarCollapsed ? item.name : undefined}
                    >
                      {/* Active indicator bar on left when expanded */}
                      {active && !sidebarCollapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#10B981]" />
                      )}

                      <div
                        className={`flex items-center justify-center shrink-0 transition-colors ${
                          sidebarCollapsed ? 'w-5 h-5' : 'w-5 h-5'
                        } ${
                          active
                            ? 'text-[#10B981]'
                            : 'text-emerald-200/60 group-hover:text-emerald-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      {!sidebarCollapsed && (
                        <span className="truncate tracking-tight">{item.name}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* User Card & Authentication Action - Approved Design */}
        <div className={`border-t border-[#0A4D46] bg-[#05322E]/80 shrink-0 ${sidebarCollapsed ? 'p-2' : 'p-3.5'}`}>
          {sidebarCollapsed ? (
            /* Collapsed: show avatar only with tooltip */
            <div className="flex flex-col items-center gap-2">
              <Link
                to="/profile"
                title={`${userFullName} (${userEmail})`}
                className="w-8 h-8 rounded-full bg-[#10B981] text-white flex items-center justify-center font-bold text-xs uppercase shadow-xs hover:ring-2 hover:ring-emerald-400/50 transition-all cursor-pointer"
              >
                {userInitial}
              </Link>
              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-200/70 hover:text-white hover:bg-[#064E3B] transition-all cursor-pointer"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-300 hover:text-white hover:bg-[#064E3B] transition-all cursor-pointer"
                  title="Sign In"
                  aria-label="Sign In"
                >
                  <LogIn className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            /* Expanded: show full user card exactly as in approved design */
            <div className="space-y-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-[#10B981] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0 shadow-xs">
                  {userInitial}
                </div>
                <div className="truncate min-w-0">
                  <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                    {userFullName}
                  </div>
                  <div className="text-[11px] text-emerald-200/60 truncate">
                    {userEmail}
                  </div>
                </div>
              </div>

              {user ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-xs font-medium text-emerald-100/75 hover:text-white hover:bg-[#064E3B]/70 transition-all cursor-pointer mt-1"
                >
                  <LogOut className="w-4 h-4 text-emerald-200/70" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-xs font-medium text-emerald-300 hover:text-white hover:bg-[#064E3B]/70 transition-all cursor-pointer mt-1"
                >
                  <LogIn className="w-4 h-4 text-emerald-400" />
                  <span>Sign In</span>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-h-full overflow-hidden">
        {/* Top Header - White in Light Mode, Never Black */}
        <header className="h-14 min-h-[3.5rem] max-h-14 bg-white dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 px-4 sm:px-6 flex items-center shrink-0 shadow-xs transition-colors duration-200">
          <div className="w-full max-w-7xl mx-auto flex items-center justify-between min-w-0 gap-3">
            {/* Left: Breadcrumbs & Toggle */}
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile Hamburger Button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 mr-1 cursor-pointer"
                aria-label="Open navigation menu"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Desktop sidebar toggle button */}
              <button
                onClick={() => setSidebarCollapsed((c) => !c)}
                className="hidden lg:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 mr-1 cursor-pointer transition-colors"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Menu className="w-4 h-4" />
              </button>

              <span className="text-xs font-medium text-[#64748B] hidden sm:inline">Workspace</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] hidden sm:inline" />
              <h2 className="text-xs sm:text-sm font-bold text-[#111827] dark:text-slate-100 truncate">
                {currentTitle}
              </h2>
            </div>

            {/* Right Controls: Dataset Selector, Theme Pill, Notifications, User Avatar */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Dataset Selector Dropdown */}
              <div className="relative" ref={datasetDropdownRef}>
                <button
                  onClick={() => setDatasetDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                  title="Active Dataset"
                  aria-label="Select active dataset"
                >
                  <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[160px]">{selectedDatasetName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {datasetDropdownOpen && (
                  <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/60">
                      Select Working Dataset
                    </div>
                    {datasets.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">
                        No uploaded datasets yet
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {datasets.map((d) => {
                          const name = d.original_filename || d.filename;
                          const isSelected = selectedDataset?.id === d.id;
                          return (
                            <button
                              key={d.id}
                              onClick={() => {
                                try {
                                  localStorage.setItem('selected_dataset_id', String(d.id));
                                } catch {}
                                setSelectedDataset(d);
                                setDatasetDropdownOpen(false);
                                const searchParams = new URLSearchParams(location.search);
                                searchParams.set('dataset_id', String(d.id));
                                navigate(`${location.pathname}?${searchParams.toString()}`);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer ${
                                isSelected ? 'text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50/50 dark:bg-emerald-950/20' : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <span className="truncate pr-2">{name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="border-t border-slate-100 dark:border-slate-700/60 pt-1 mt-1 px-2">
                      <Link
                        to="/upload"
                        onClick={() => setDatasetDropdownOpen(false)}
                        className="w-full text-center block py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        + Upload New Dataset
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Theme Toggle Pill (Sun & Moon Icons) */}
              <div className="flex items-center p-0.5 rounded-full border border-[#E2E8F0] dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                <button
                  onClick={() => isDark && toggleTheme()}
                  className={`p-1.5 rounded-full transition-all cursor-pointer ${
                    !isDark
                      ? 'bg-white text-emerald-600 shadow-2xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Switch to light mode"
                  aria-label="Light mode"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => !isDark && toggleTheme()}
                  className={`p-1.5 rounded-full transition-all cursor-pointer ${
                    isDark
                      ? 'bg-slate-700 text-emerald-400 shadow-2xs'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                  title="Switch to dark mode"
                  aria-label="Dark mode"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Notification Bell */}
              <button
                className="relative p-2 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs transition-colors cursor-pointer"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-800" />
              </button>

              {/* Profile Avatar Control */}
              <Link
                to="/profile"
                className="flex items-center gap-2 p-1 pr-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-800 dark:text-slate-100"
                title="Account Profile"
              >
                <div className="w-7 h-7 rounded-full bg-[#10B981] text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                  {userInitial}
                </div>
                <span className="hidden md:inline font-semibold text-xs max-w-[120px] truncate">
                  {userShortName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:inline" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main className="flex-1 overflow-y-auto min-w-0 min-h-0 w-full p-4 sm:p-6 pb-12 sm:pb-16 bg-[var(--bg-main)] transition-colors duration-200">
          <div className="w-full max-w-7xl mx-auto min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
