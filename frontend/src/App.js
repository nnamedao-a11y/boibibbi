/**
 * BIBI Cars - Main Application
 * 
 * Структура:
 * / - Публічний сайт (каталог, VIN перевірка)
 * /admin - CRM панель (з авторизацією)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from 'sonner';

// Phase B1: React Query — frontend HTTP cache + stale-while-revalidate.
// One QueryClient lives at the root; every catalogue/welcome/detail fetch
// uses it. Default staleTime = 5 min so back-navigation never re-pulls
// listing pages, only revalidates on focus.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// i18n
import { LanguageProvider } from './i18n';

// Theming
import { CabinetThemeProvider } from './context/CabinetThemeContext';

// Public pages
import PublicLayout from './components/public/PublicLayout';
import ScrollToTop from './components/ScrollToTop';
import { initTracker } from './lib/tracker';
import { GetInTouchProvider } from './components/public/GetInTouchModal';
import './components/public/GetInTouchModal.css';
import { PolicyModalProvider } from './components/public/PolicyModal';
import './components/public/PolicyModal.css';
import HomePage from './pages/public/HomePage';
import FigmaHomePage from './figma_home';
import VehiclesPage from './pages/public/VehiclesPage';
import VinCheckPage from './pages/public/VinCheckPage';
import VinResultPage from './pages/public/VinResultPage';
import VehicleDetailPage from './pages/public/VehicleDetailPage';
import CalculatorPage from './pages/public/CalculatorPage';
import ComingSoonPage from './pages/public/ComingSoonPage';
import CatalogPage from './pages/public/CatalogPage';
import CustomerLoginPage, { CustomerAuthProvider, CustomerProtectedRoute, AuthCallback } from './pages/public/CustomerAuth';
import SingleCarPage from './pages/public/SingleCarPage/SingleCarPage';
import ForgotPasswordPage from './pages/public/ForgotPasswordPage';
import ResetPasswordPage from './pages/public/ResetPasswordPage';
import { CollectionsPage, CollectionDetailPage } from './pages/public/CollectionsPage';
import AboutPage from './pages/public/AboutPage';
import ContactsPage from './pages/public/ContactsPage';
import BlogPage from './pages/public/BlogPage';
import BlogArticlePage from './pages/public/BlogArticlePage';
import PolicyPage from './pages/public/PolicyPage';
import QuoteSharePage from './pages/public/QuoteSharePage';
import CookieConsentBanner from './components/public/CookieConsentBanner';

// Admin pages
// import Login from './pages/Login'; // deprecated — unified auth in CustomerAuth
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
// Legacy pages — kept as files but no longer mounted in routes.
// import Deals from './pages/Deals';
// import Deposits from './pages/Deposits';
// Deposits page deprecated — replaced by Legal Workflow (P0.3 tab). Redirect lives in routes.
// import Deposits from './pages/Deposits';
import Tasks from './pages/Tasks';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import Documents from './pages/Documents';
import ProxySettings from './pages/ProxySettings';
import ParserControl from './pages/ParserControl';
import ProxyManager from './pages/ProxyManager';
import ParserLogs from './pages/ParserLogs';
import ParserSettings from './pages/ParserSettings';
import CalculatorAdmin from './pages/CalculatorAdmin';
import Customer360 from './pages/Customer360';
import Lead360 from './pages/Lead360';
import Deal360 from './pages/Deal360';
import Finance360 from './pages/Finance360';
import Delivery360 from './pages/Delivery360';
import Operations360 from './pages/Operations360';
import Forecasting360 from './pages/Forecasting360';
import Contract360 from './pages/Contract360';
import ExecutiveCenter from './pages/ExecutiveCenter';
import ActionCenter from './pages/ActionCenter';
import NotificationCenter from './pages/NotificationCenter';
import AdminAnalyticsDashboard from './components/AdminAnalyticsDashboard';
import InsightsPage from './pages/InsightsPage';
import AdminBusinessMetricsPage from './pages/admin/AdminBusinessMetricsPage';
import ProviderHealthPage from './pages/admin/ProviderHealthPage';
import MarketingControlPanel from './components/MarketingControlPanel';
import ModerationPage from './pages/ModerationPage';
import SourceHealthDashboard from './pages/admin/SourceHealthDashboard';
import VinEngineDashboard from './pages/admin/VinEngineDashboard';
import HistoryReportsAdmin from './pages/admin/HistoryReportsAdmin';
import StaffSessionsBoard from './pages/admin/StaffSessionsBoard';
import KPIDashboard from './pages/admin/KPIDashboard';
import CallBoardPage from './pages/admin/CallBoardPage';
import PredictiveLeadsPage from './pages/admin/PredictiveLeadsPage';
import SecuritySettings from './pages/admin/SecuritySettings';
import NotificationSettings from './pages/admin/NotificationSettings';
import CarfaxAdminPage from './pages/admin/CarfaxAdminPage';
// TeamLeadDashboard is no longer rendered — /admin/team-lead now redirects to /team/dashboard
// (operational deduplication, see Wave 7 plan). Keep the import comment for archaeology.
// import TeamLeadDashboard from './pages/admin/TeamLeadDashboard';
// Wave 6 — Deal Workspace + Legal Policy Settings
import DealWorkspacePage from './pages/admin/DealWorkspacePage';
import LegalPolicySettingsPage from './pages/admin/LegalPolicySettingsPage';
// IntegrationsPage is no longer a standalone route (Wave 3 refactor) — it is
// still embedded inside Payments / Auth / Notifications / System pages.
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage';
import AdminServicesPage from './pages/admin/AdminServicesPage';
import NotificationsHubPage from './pages/admin/NotificationsHubPage';
import EmailOutboxPage from './pages/admin/EmailOutboxPage';
import ManagerOrdersPage from './pages/manager/ManagerOrdersPage';
import TeamOrdersPage from './pages/team/TeamOrdersPage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AuthSettingsPage from './pages/admin/AuthSettingsPage';
import SystemPage from './pages/admin/SystemPage';
import AdminInfoPage from './pages/admin/AdminInfoPage';
import RoutingRulesPage from './pages/admin/RoutingRulesPage';
import CadencesPage from './pages/admin/CadencesPage';
import ScoreRulesPage from './pages/admin/ScoreRulesPage';
import JourneyPage from './pages/admin/JourneyPage';
import RiskDashboardPage from './pages/admin/RiskDashboardPage';
import EscalationDashboard from './pages/admin/EscalationDashboard';
import ContractsAccountingPage from './pages/admin/ContractsAccountingPage';
import LegalWorkflowPage from './pages/admin/LegalWorkflowPage';
import RingostatAdminPage from './pages/admin/RingostatAdminPage';
import AdminSystemSettingsPage from './pages/admin/AdminSystemSettingsPage';
// import AdminWorkersPage from './pages/admin/AdminWorkersPage'; // now embedded inside SystemPage as a tab
import VesselFinderSessionPage from './pages/admin/VesselFinderSessionPage';
import ExceptionsDashboardPage from './pages/admin/ExceptionsDashboardPage';
import AutomationExceptionsPage from './pages/admin/AutomationExceptionsPage';
import ExtClientsPage from './pages/admin/ExtClientsPage';
import ShipmentJourneyManager from './pages/admin/ShipmentJourneyManager';
import TrackingLayout, { TrackingIndex } from './pages/admin/TrackingLayout';

// Team Lead pages
import TeamDashboardPage from './pages/team/TeamDashboardPage';
import TeamManagersPage from './pages/team/TeamManagersPage';
import ManagerProfilePage from './pages/team/ManagerProfilePage';
import TeamLeadsPage from './pages/team/TeamLeadsPage';
import ReassignmentCenterPage from './pages/team/ReassignmentCenterPage';
import TeamTasksPage from './pages/team/TeamTasksPage';
import TeamPaymentsPage from './pages/team/TeamPaymentsPage';
import TeamShippingPage from './pages/team/TeamShippingPage';
import TeamAlertsPage from './pages/team/TeamAlertsPage';
import TeamPerformancePage from './pages/team/TeamPerformancePage';

// Manager pages
import ManagerWorkspacePage from './pages/manager/ManagerWorkspacePage';
import ManagerShipmentsPage from './pages/manager/ManagerShipmentsPage';
import UniversalTrackerPage from './pages/manager/UniversalTrackerPage';
// ManagerEngagementPage removed in Wave 7.5 — consolidated into UserEngagementPage (top-level).
import ManagerWishlistPage from './pages/manager/ManagerWishlistPage';
import TeamWishlistApprovalsPage from './pages/team/TeamWishlistApprovalsPage';
// Security / audit pages
import LoginAuditPage from './pages/security/LoginAuditPage';
import AdminSecurityPage from './pages/security/AdminSecurityPage';
import ChangePasswordPage from './pages/ChangePasswordPage';

import NotificationsPage from './pages/NotificationsPage';
import ParserTestLab from './pages/ParserTestLab';
import AdminRoadmapsPage from './pages/AdminRoadmapsPage';
import AdminDocumentTemplatesPage from './pages/AdminDocumentTemplatesPage';
import CabinetRoadmap from './components/cabinet/CabinetRoadmap';
import CabinetContractSign from './pages/CabinetContractSign';
import {
  CabinetLayout,
  CabinetDashboard,
  CabinetOrders,
  CabinetOrderDetails,
  CabinetRequests,
  CabinetDeposits,
  CabinetTimeline,
  CabinetProfile,
  CabinetNotifications,
  CabinetCarfax,
  CabinetContracts,
  CabinetInvoices,
  CabinetShipping
} from './pages/CustomerCabinet';
import Layout from './components/Layout';

// User Engagement Cabinet pages
import FavoritesPage from './pages/cabinet/FavoritesPage';
import WatchlistPage from './pages/cabinet/WatchlistPage';
import ComparePage from './pages/cabinet/ComparePage';
import SharedCarsPage from './pages/cabinet/SharedCarsPage';
import HistoryPage from './pages/cabinet/HistoryPage';
import HistoryReportsPage from './pages/cabinet/HistoryReportsPage';
import CarfaxPage from './pages/cabinet/CarfaxPage';
import ManagerCallsPage from './pages/manager/ManagerCallsPage';
import MissedCallsBoard from './pages/manager/MissedCallsBoard';
import ManagerTasksPage from './pages/manager/ManagerTasksPage';

// Cabinet P1 pages
import InvoicesPage from './pages/cabinet/InvoicesPage';
import ContractsPage from './pages/cabinet/ContractsPage';
import ShippingPage from './pages/cabinet/ShippingPage';
import PaymentSuccessPage from './pages/cabinet/PaymentSuccessPage';
import { CabinetFinancialsListPage, CabinetDealFinancialsPage } from './pages/cabinet/FinancialsPage';

// Manager pages
import ManagerInvoicesPage from './pages/ManagerInvoicesPage';

// Intent & AI Dashboard
import IntentDashboard from './pages/IntentDashboard';
// Twilio & AutoCallSettings removed - using Ringostat instead
import UserEngagementPage from './pages/UserEngagementPage';

// Owner & Finance Dashboards
import OwnerPaymentDashboard from './pages/OwnerPaymentDashboard';
import InvoiceRemindersDashboard from './pages/InvoiceRemindersDashboard';

// Analytics
import { initAnalytics } from './utils/analytics';

// Wave 19 — Customer Portal View (inside admin shell, cross-cutting for manager / team_lead / admin)
import CustomerPortalView from './pages/CustomerPortalView';

import './App.css';

// Initialize analytics tracking
if (typeof window !== 'undefined') {
  initAnalytics();
}

// Use REACT_APP_BACKEND_URL for API calls
// Falls back to same origin if not set
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  // Setup axios interceptor for auth errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error.response?.status;
        const detail = error.response?.data?.detail;
        const resetHdr = error.response?.headers?.['x-session-reset'];
        // ── Daily-reset for managers (Europe/Sofia 12:00) ──────────────
        // Backend signals an expired daily session with:
        //   401 + detail "session_expired_daily_reset"  OR
        //   header X-Session-Reset: daily
        // In either case we wipe the local session, tell the user, and
        // bounce them to /login. This is intentionally global so EVERY
        // axios call (catalog, deals, cabinet, etc) triggers the same
        // UX, not just /api/auth/me.
        if (
          status === 401 &&
          (detail === 'session_expired_daily_reset' || resetHdr === 'daily')
        ) {
          try {
            // Lazy import to avoid pulling sonner into the bootstrap path.
            import('sonner').then(({ toast }) => {
              toast.warning('Your daily session has expired. Please log in again.');
            }).catch(() => {});
          } catch { /* ignore */ }
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
          setToken(null);
          setUser(null);
          // Hard navigate so all in-memory queries are flushed.
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.assign('/login?reason=daily_reset');
          }
          return Promise.reject(error);
        }
        // Standard /me-only logout (existing behaviour)
        if (status === 401 && error.config?.url?.includes('/api/auth/me')) {
          logout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/me`);
      setUser(res.data);
    } catch (err) {
      // Only logout if it's an auth error
      if (err.response?.status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const data = res.data || {};
    // ── Multi-step login ───────────────────────────────────────────────
    // Backend returns either an access_token (single-step roles like
    // manager, or admin without TOTP), or a `challenge` payload that
    // tells the UI to gather a second factor:
    //   { challenge: 'totp',      user_id, role, ... }
    //   { challenge: 'email_otp', challenge_token, recipient_masked, ... }
    // We propagate that payload up so the LoginPage can render step 2.
    if (data.challenge) {
      return { __challenge: true, ...data };
    }
    const { access_token, user } = data;
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(user);
    return user;
  };

  // Complete a multi-step login by exchanging a verified challenge
  // response for a JWT. Mirrors `login()` for the second step.
  const completeChallenge = async (path, body) => {
    const res = await axios.post(`${API_URL}${path}`, body);
    const { access_token, user } = res.data || {};
    if (!access_token) throw new Error('No access_token in challenge response');
    localStorage.setItem('token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(user);
    return user;
  };

  const logout = async () => {
    // best-effort logout audit
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {});
    } catch { /* ignore */ }
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, completeChallenge }}>
      {children}
    </AuthContext.Provider>
  );
};

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F8]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#0A0A0B] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-sm text-[#71717A]">Завантаження...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/cabinet/login" replace />;
  }
  
  return children;
};

// Phase B1 — single root QueryClient for the whole app.
// Defaults tuned for catalogue-class data:
//   • staleTime 5 min — listing pages don't refetch on back-nav
//   • gcTime    30 min — keep cache warm across route changes
//   • retry once on network blips, no aggressive polling
//   • refetchOnWindowFocus = false (auctions update every hour, not every tab focus)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function App() {
  // Real-data analytics tracker — записываем page_view и UTM в analytics_events.
  // Хост определяется из window.location.host и хранится в каждом событии,
  // так что после переезда на боевой домен dashboard покажет именно его.
  useEffect(() => {
    initTracker();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <CabinetThemeProvider>
          <AuthProvider>
            <CustomerAuthProvider>
              <PolicyModalProvider>
              <GetInTouchProvider>
              <Toaster
                position="top-right"
                theme="dark"
                closeButton
                toastOptions={{
                  classNames: {
                    toast:
                      'bibi-toast !bg-[#1D1D1B] !text-white !border !border-[#3a3a38] !rounded-lg !shadow-[0_12px_40px_rgba(0,0,0,0.6)]',
                    title: '!text-white !font-semibold',
                    description: '!text-[#B0B0B0]',
                    success: '!border-[#FEAE00]/40',
                    error: '!border-red-500/50',
                    info: '!border-[#FEAE00]/30',
                    actionButton:
                      '!bg-[#FEAE00] !text-black !font-semibold hover:!bg-[#FFBF2D]',
                    cancelButton:
                      '!bg-transparent !text-[#B0B0B0] hover:!text-white',
                    closeButton:
                      '!bg-[#2a2a28] !border !border-[#3a3a38] !text-[#B0B0B0] hover:!text-[#FEAE00]',
                  },
                }}
              />
            <Routes>
              {/* ====== PUBLIC HOMEPAGE — figma body wrapped with shared chrome ====== */}
              <Route path="/" element={<PublicLayout />}>
                <Route index element={<FigmaHomePage />} />
              </Route>

              {/* ====== PUBLIC SITE (catalog/calculator/legacy with shared layout) ====== */}
              <Route path="/" element={<PublicLayout />}>
                {/* /catalog and /calculator — placeholder while new UI is being built.
                    Old VehiclesPage / CalculatorPage stay in the codebase but are not
                    wired to public routes; backend endpoints remain available. */}
                {/* /catalog ─── placeholder while new catalog listing UI is being built.
                 *
                 * The new SingleCarPage (Figma "BIBICARS Origine" May 2026) is reachable via
                 * EXACTLY TWO entry points — never through /catalog:
                 *
                 *   1) Click a car card on the welcome page → `/cars/:vin`
                 *      (figma_home/card1, CarRowCard, CarCardVertical all unified on /cars/)
                 *   2) Header VIN/lot search                → `/vin/:query` and `/search/:query`
                 *
                 * The legacy `/catalog/:id`, `/vehicle/:id`, `/cars/:slug→VehicleDetailPage`,
                 * and `/vin/:query→VinResultPage` routes have all been retired so users can
                 * never land on a stale layout. */}
                <Route path="catalog" element={<CatalogPage />} />
                <Route path="calculator" element={<CalculatorPage />} />
                {/* Single Car detail (Figma) — the ONLY car detail page in the app. */}
                <Route path="cars/:slug" element={<SingleCarPage />} />
                <Route path="vin-check" element={<VinCheckPage />} />
                <Route path="vin-check/:vin" element={<VinCheckPage />} />
                <Route path="vin/:query" element={<SingleCarPage />} />
                <Route path="search/:query" element={<SingleCarPage />} />
                <Route path="blog" element={<BlogPage />} />
                <Route path="blog/:slug" element={<BlogArticlePage />} />
                <Route path="collections" element={<CollectionsPage />} />
                <Route path="collections/:slug" element={<CollectionDetailPage />} />

                {/* About / Contacts / Legal — same unified chrome */}
                <Route path="about" element={<AboutPage />} />
                <Route path="contacts" element={<ContactsPage />} />
                <Route path="privacy" element={<PolicyPage policyKey="privacy" />} />
                <Route path="terms" element={<PolicyPage policyKey="terms" />} />
                <Route path="cookies" element={<PolicyPage policyKey="cookies" />} />
                <Route path="conditions" element={<PolicyPage policyKey="conditions" />} />
              </Route>

            {/* ====== PUBLIC SHARE — Quote (calculation) by share_token ====== */}
            <Route path="/quote/:shareToken" element={<QuoteSharePage />} />

            {/* ====== CUSTOMER AUTH ====== */}
            <Route path="/cabinet/login" element={<CustomerLoginPage />} />
            <Route path="/cabinet/callback" element={<AuthCallback />} />
            <Route path="/cabinet/auth/callback" element={<AuthCallback />} />
            <Route path="/cabinet/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/cabinet/reset-password" element={<ResetPasswordPage />} />
            {/* Mini Sprint Contracts Final — public contract sign page (no auth, view_token grants access) */}
            <Route path="/cabinet/contracts/:token" element={<CabinetContractSign />} />
            
            {/* ====== CABINET - ПРЯМОЙ ДОСТУП БЕЗ АВТОРИЗАЦИИ ====== */}
            <Route path="/cabinet" element={<Navigate to="/cabinet/test_customer_001" replace />} />
            <Route path="/cabinet/favorites" element={<FavoritesPage />} />
            <Route path="/cabinet/compare" element={<ComparePage />} />
            <Route path="/cabinet/history" element={<HistoryPage />} />
            <Route path="/cabinet/history-reports" element={<HistoryReportsPage />} />
            <Route path="/cabinet/carfax" element={<CarfaxPage />} />
            <Route path="/cabinet/invoices" element={<InvoicesPage />} />
            <Route path="/cabinet/contracts" element={<ContractsPage />} />
            <Route path="/cabinet/shipping" element={<ShippingPage />} />
            <Route path="/cabinet/financials" element={<CabinetFinancialsListPage />} />
            <Route path="/cabinet/deals/:dealId/financials" element={<CabinetDealFinancialsPage />} />

            {/* ====== ADMIN CRM ====== */}
            {/* /admin/login is gone — unified auth lives at /cabinet/login
                (reached via the profile icon in the public header). Any
                stale bookmarks to /admin/login get redirected there. */}
            <Route path="/admin/login" element={<Navigate to="/cabinet/login" replace />} />
            <Route path="/admin" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<Lead360 />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id/360" element={<Customer360 />} />
              {/* Sprint 3.5 — company-wide vehicle roadmaps */}
              <Route path="roadmaps" element={<AdminRoadmapsPage />} />
              {/* Mini Sprint Contracts Final — Document Templates editor */}
              <Route path="document-templates" element={<AdminDocumentTemplatesPage />} />
              {/* Legacy /admin/deals — fully redirected to new Deal Pipeline (P0.2 tab in Legal Workflow). */}
              <Route path="deals" element={<Navigate to="/admin/legal?tab=deal_pipeline" replace />} />
              {/* Wave 6 — Deal Workspace (operations-centric, thin) */}
              <Route path="deals/:id" element={<DealWorkspacePage />} />
              {/* Wave 11 — Deal360 (single pane of glass: finance, delivery, contracts, documents, timeline, notes) */}
              <Route path="deals/:id/360" element={<Deal360 />} />
              {/* Wave 12A — Finance360 (company-wide money control center) */}
              <Route path="finance" element={<Finance360 />} />
              {/* Wave 13 — Delivery360 (carriers, milestones, ETA, documents) */}
              <Route path="delivery" element={<Delivery360 />} />
              {/* Wave 14 — Operations360 (CEO dashboard, bottlenecks, team, SLA, risk) */}
              <Route path="operations" element={<Operations360 />} />
              {/* Wave 12C — Forecasting360 (deterministic — revenue / cash flow / pipeline / capacity / risk) */}
              <Route path="forecast" element={<Forecasting360 />} />
              {/* Wave 15 — Contract360 (Contract Lifecycle Management — templates, approvals, signatures, amendments, health) */}
              <Route path="contracts" element={<Contract360 />} />
              {/* Wave 16 — Executive Center (owner dashboard — dashboard / forecast / bottlenecks / risks / team) */}
              <Route path="executive" element={<ExecutiveCenter />} />
              {/* Wave 17 — Action Center (execution layer — Inbox / My / Team / Analytics) */}
              <Route path="actions" element={<ActionCenter />} />
              {/* Wave 18 — Communication & Notification Center (Inbox / Preferences / Analytics / SLA Engine) */}
              <Route path="notifications-center" element={<NotificationCenter />} />
              {/* Wave 19 — Customer Portal View (cross-cutting: manager / team_lead / admin).
                  Single sweeping view of a customer's order experience: My Car, Delivery
                  Timeline, Documents, Payments, Notifications. Read-only — uses the
                  existing /api/customer-portal/{customer_id}/* BFF behind staff auth. */}
              <Route path="customer-portal" element={<CustomerPortalView />} />
              <Route path="customer-portal/:customerId" element={<CustomerPortalView />} />
              {/* Legacy /admin/deposits — fully redirected to new Legal Workflow (P0.3 tab). */}
              <Route path="deposits" element={<Navigate to="/admin/legal?tab=deposit_v2" replace />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="staff" element={<Staff />} />
              <Route path="documents" element={<Navigate to="/admin/insights?tab=revenue" replace />} />
              <Route path="documents-legacy" element={<Documents />} />
              <Route path="settings" element={<SystemPage />} />
              <Route path="settings/auth" element={<Navigate to="/admin/settings?tab=auth" replace />} />
              <Route path="info" element={<AdminInfoPage />} />
              <Route path="proxy-settings" element={<ProxySettings />} />
              <Route path="parser" element={<ParserControl />} />
              <Route path="parsers" element={<Navigate to="/admin/parser?tab=ingestion" replace />} />
              <Route path="parser-control-legacy" element={<ParserControl />} />
              <Route path="parser/proxies" element={<ProxyManager />} />
              <Route path="parser/logs" element={<ParserLogs />} />
              <Route path="parser/settings" element={<ParserSettings />} />
              {/* Chrome Extension install + download page (Ctrl Center CTA links here) */}
              <Route path="parser-mesh/test" element={<ParserTestLab />} />
              {/* Legacy: Chrome Extension page is now a tab inside /admin/parser */}
              <Route path="parser/chrome-extension" element={<Navigate to="/admin/parser?tab=extension" replace />} />
              <Route path="source-health" element={<SourceHealthDashboard />} />
              <Route path="vin-engine" element={<VinEngineDashboard />} />
              {/* ❌ REMOVED (April 2026): /admin/vin (Parser Sources Control) — duplicate
                   of functionality already covered by /admin/parser/settings.
                  ❌ REMOVED: /admin/vehicles (catalog rudiment) and /admin/analytics/quotes (mock-only data) */}
              <Route path="calculator" element={<CalculatorAdmin />} />
              {/* ═══════════════════ NEW INSIGHTS HUB ═══════════════════
                * Single role-aware Analytics + Risk + Revenue + Pipeline + Team hub.
                * Replaces 8 legacy sidebar entries. Old URLs are redirected below. */}
              <Route path="insights" element={<InsightsPage />} />
              {/* Legacy aliases (preserve old deep-links / bookmarks). */}
              <Route path="analytics" element={<Navigate to="/admin/insights?tab=traffic" replace />} />
              <Route path="analytics-legacy" element={<AdminAnalyticsDashboard />} />
              <Route path="business-metrics" element={<AdminBusinessMetricsPage />} />
              <Route path="provider-health" element={<ProviderHealthPage />} />
              {/* ❌ REMOVED: marketing control (не используется, логика неясна) */}
              {/* <Route path="marketing" element={<MarketingControlPanel />} /> */}
              <Route path="moderation" element={<ModerationPage />} />
              <Route path="listings/moderation" element={<ModerationPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="intent" element={<Navigate to="/admin/insights?tab=traffic" replace />} />
              <Route path="intent-legacy" element={<IntentDashboard />} />
              <Route path="engagement" element={<Navigate to="/admin/insights?tab=traffic" replace />} />
              <Route path="engagement-legacy" element={<UserEngagementPage />} />
              {/* Twilio & auto-call removed - use /admin/ringostat */}
              <Route path="history-reports" element={<HistoryReportsAdmin />} />
              <Route path="staff-sessions" element={<StaffSessionsBoard />} />
              <Route path="kpi" element={<KPIDashboard />} />
              <Route path="call-board" element={<CallBoardPage />} />
              <Route path="predictive-leads" element={<PredictiveLeadsPage />} />
              <Route path="security" element={<AdminSecurityPage />} />
              <Route path="security-legacy" element={<SecuritySettings />} />
              <Route path="login-audit" element={<LoginAuditPage scope="admin" />} />
              <Route path="profile/password" element={<ChangePasswordPage />} />
              <Route path="notification-settings" element={<NotificationSettings />} />
              <Route path="carfax" element={<CarfaxAdminPage />} />
              {/* Operational deduplication: /admin/team-lead === /team/dashboard.
                  We redirect instead of merging so all existing deep-links keep working. */}
              <Route path="team-lead" element={<Navigate to="/team/dashboard" replace />} />
              {/* Wave-3 refactor: /admin/integrations hub is removed.
                  Stripe → /admin/payments
                  Email + Resend + SMS → /admin/settings/notifications-rules
                  Google Sign-In → /admin/settings?tab=auth
                  OpenAI → /admin/settings?tab=ai
                  Ringostat → /admin/ringostat (dedicated page)
                  Legacy URL redirects to the System hub so saved bookmarks still land somewhere sane. */}
              <Route path="integrations" element={<Navigate to="/admin/settings" replace />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route path="services" element={<AdminServicesPage />} />
              <Route path="settings/notifications" element={<NotificationsHubPage />} />
              {/* Legacy paths — redirect to the unified Notifications hub */}
              <Route path="settings/email-templates" element={<Navigate to="/admin/settings/notifications" replace />} />
              <Route path="settings/notifications-rules" element={<Navigate to="/admin/settings/notifications" replace />} />
              <Route path="settings/email-outbox" element={<Navigate to="/admin/settings?tab=email" replace />} />
              <Route path="routing-rules" element={<RoutingRulesPage />} />
              <Route path="cadences" element={<CadencesPage />} />
              <Route path="score-rules" element={<ScoreRulesPage />} />
              <Route path="journey" element={<Navigate to="/admin/insights?tab=pipeline" replace />} />
              <Route path="risk" element={<Navigate to="/admin/insights?tab=risk" replace />} />
              <Route path="escalations" element={<Navigate to="/admin/insights?tab=risk" replace />} />
              <Route path="contracts/accounting" element={<Navigate to="/admin/insights?tab=revenue" replace />} />
              <Route path="legal" element={<LegalWorkflowPage />} />
              {/* Wave 6 — Legal Policy (config only, separate from /admin/legal workspace) */}
              <Route path="settings/legal-policy" element={<LegalPolicySettingsPage />} />
              <Route path="ringostat" element={<RingostatAdminPage />} />
              <Route path="system-settings" element={<AdminSystemSettingsPage />} />
              {/* Wave-8.4 — Workers Health is now embedded inside the System hub.
                  Legacy /admin/workers route redirects to the tab. */}
              <Route path="workers" element={<Navigate to="/admin/settings?tab=workers" replace />} />

              {/* ═══════════════════ Unified TRACKING hub ═══════════════════
                * Single sidebar entry in the main left nav → `/admin/tracking`.
                * All scattered shipping/vessel/exception pages now live under
                * this nested layout with an internal horizontal tab header.
                * Legacy URLs below redirect to the new paths for back-compat. */}
              <Route path="tracking" element={<TrackingLayout />}>
                <Route index element={<Navigate to="/admin/tracking/vesselfinder" replace />} />
                <Route path="vesselfinder" element={<VesselFinderSessionPage />} />
                <Route path="shipments" element={<ShipmentJourneyManager />} />
                <Route path="exceptions/shipments" element={<ExceptionsDashboardPage />} />
                <Route path="exceptions/automation" element={<AutomationExceptionsPage />} />
                <Route path="ext-clients" element={<ExtClientsPage />} />
                <Route path="*" element={<TrackingIndex />} />
              </Route>

              {/* Legacy redirects — keep old URLs working without 404 */}
              <Route path="vesselfinder" element={<Navigate to="/admin/tracking/vesselfinder" replace />} />
              <Route path="shipments/exceptions" element={<Navigate to="/admin/tracking/exceptions/shipments" replace />} />
              <Route path="identity/exceptions" element={<Navigate to="/admin/tracking/exceptions/automation" replace />} />
              <Route path="ext-clients" element={<Navigate to="/admin/tracking/ext-clients" replace />} />
              <Route path="shipment-journey" element={<Navigate to="/admin/tracking/shipments" replace />} />
              <Route path="owner-dashboard" element={<Navigate to="/admin/insights?tab=revenue" replace />} />
              <Route path="owner-dashboard-legacy" element={<OwnerPaymentDashboard />} />
              <Route path="invoice-reminders" element={<InvoiceRemindersDashboard />} />

              {/* Catch-all for unknown /admin/* routes — redirects to dashboard.
                  Covers removed routes like /admin/vehicles and /admin/analytics/quotes
                  so users land on a sane page instead of falling through to public site. */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>

            {/* ====== TEAM LEAD WORKSPACE ====== */}
            <Route path="/team" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<TeamDashboardPage />} />
              <Route path="dashboard" element={<TeamDashboardPage />} />
              <Route path="managers" element={<TeamManagersPage />} />
              <Route path="managers/:id" element={<ManagerProfilePage />} />
              <Route path="leads" element={<TeamLeadsPage />} />
              <Route path="reassignments" element={<ReassignmentCenterPage />} />
              <Route path="tasks" element={<TeamTasksPage />} />
              <Route path="payments" element={<TeamPaymentsPage />} />
              <Route path="shipping" element={<TeamShippingPage />} />
              <Route path="alerts" element={<TeamAlertsPage />} />
              <Route path="performance" element={<TeamPerformancePage />} />
              <Route path="orders" element={<TeamOrdersPage />} />
              <Route path="wishlist-approvals" element={<TeamWishlistApprovalsPage />} />
              <Route path="login-audit" element={<LoginAuditPage scope="team" />} />
              <Route path="profile/password" element={<ChangePasswordPage />} />
            </Route>

            {/* ====== MANAGER WORKSPACE ====== */}
            <Route path="/manager" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<ManagerWorkspacePage />} />
              <Route path="calls" element={<ManagerCallsPage />} />
              <Route path="calls/missed" element={<MissedCallsBoard />} />
              <Route path="tasks" element={<ManagerTasksPage />} />
              <Route path="invoices" element={<ManagerInvoicesPage />} />
              <Route path="orders" element={<ManagerOrdersPage />} />
              <Route path="shipments" element={<ManagerShipmentsPage />} />
              <Route path="tracking" element={<UniversalTrackerPage />} />
              {/* Wave-8: /manager/engagement → consolidated into Insights → Traffic tab. */}
              <Route path="engagement" element={<Navigate to="/admin/insights?tab=traffic" replace />} />
              <Route path="wishlist" element={<ManagerWishlistPage />} />
              <Route path="profile/password" element={<ChangePasswordPage />} />
            </Route>

            {/* ====== CUSTOMER CABINET (CLIENT PORTAL) ====== */}
            <Route path="/cabinet/:customerId" element={<CabinetLayout />}>
              <Route index element={<CabinetDashboard />} />
              <Route path="notifications" element={<CabinetNotifications />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="watchlist" element={<WatchlistPage />} />
              <Route path="compare" element={<ComparePage />} />
              <Route path="shared" element={<SharedCarsPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="requests" element={<CabinetRequests />} />
              <Route path="orders" element={<CabinetOrders />} />
              <Route path="orders/:dealId" element={<CabinetOrderDetails />} />
              {/* Sprint 3.5 — Client-facing vehicle journey (read-only) */}
              <Route path="roadmap" element={<CabinetRoadmap />} />
              <Route path="deposits" element={<CabinetDeposits />} />
              <Route path="carfax" element={<CabinetCarfax />} />
              <Route path="contracts" element={<CabinetContracts />} />
              <Route path="invoices" element={<CabinetInvoices />} />
              <Route path="payment-success" element={<PaymentSuccessPage />} />
              <Route path="shipping" element={<CabinetShipping />} />
              <Route path="timeline" element={<CabinetTimeline />} />
              <Route path="profile" element={<CabinetProfile />} />
            </Route>

            {/* Legacy redirect: /login → unified /cabinet/login */}
            <Route path="/login" element={<Navigate to="/cabinet/login" replace />} />
            
            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            <CookieConsentBanner />
              </GetInTouchProvider>
              </PolicyModalProvider>
            </CustomerAuthProvider>
          </AuthProvider>
        </CabinetThemeProvider>
    </LanguageProvider>
    </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
export { API_URL };
