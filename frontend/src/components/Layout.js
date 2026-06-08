import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../App';
import { useLang, LANGUAGES } from '../i18n';
import NotificationBell from './NotificationBell';
import RingostatManager from './ringostat/RingostatManager';
import RingostatLiveBar from './ringostat/RingostatLiveBar';
import RingostatSupervisionPanel from './ringostat/RingostatSupervisionPanel';
import { useRingostatPrefs } from '../hooks/useRingostatPrefs';
import { 
  ChartPieSlice,
  UsersThree,
  UserCircle,
  Handshake,
  Wallet,
  FileText,
  CarProfile,
  MagnifyingGlass,
  Calculator,
  UsersFour,
  ClipboardText,
  GearSix,
  Database,
  SignOut,
  CaretDown,
  CaretUp,
  ChartLine,
  Megaphone,
  ChartBar,
  UserPlus,
  CreditCard,
  Receipt,
  Car,
  Barcode,
  Percent,
  Users,
  ListChecks,
  Sliders,
  Wrench,
  TrendUp,
  Target,
  List,
  X,
  Globe,
  Phone,
  PhoneCall,
  Anchor,
  Heart,
  Shield,
  ShieldCheck,
  Plugs, // eslint-disable-line no-unused-vars -- kept for legacy refs; safe to remove later
  Path,
  Timer,
  Lightning,
  Briefcase,
  Stack,
  Truck,
  Bell,
  ArrowsClockwise,
  Fire,
  ChartLineUp,
  Kanban,
  User,
  Warning,
  Gauge,
  Scales,
  LockKey,
  Crown,
  Storefront,
  Compass,
  CurrencyDollar as Banknote,
  CalendarCheck,
} from '@phosphor-icons/react';

const Layout = () => {
  const { user, logout, token } = useAuth();
  const { prefs: ringostatPrefs, role: ringostatRole, loading: loadingPrefs } = useRingostatPrefs();
  const { t, lang, changeLang, languages } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Language dropdown state
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef(null);
  
  // Mobile search state
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [automationExceptionsCount, setAutomationExceptionsCount] = useState(0);
  
  // Track expanded sections - all collapsed by default
  const [expandedSections, setExpandedSections] = useState({
    crm: false,
    finance: false,
    auto: false,
    team: false,
    teamWorkspace: false,
    managerWorkspace: false,
    control: false,
    settings: false,
    marketing: false
  });

  // Auto-expand the sidebar group that contains the active route, so the
  // highlighted child is always visible when the user navigates directly
  // to a deep URL (e.g. /admin/legal?tab=deal_pipeline → expand CRM).
  // This only OPENS groups; it never closes a manually-expanded one.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlTab = new URLSearchParams(location.search).get('tab');
    const targets = {};
    for (const g of navGroups || []) {
      if (g.type !== 'group' || !Array.isArray(g.items)) continue;
      const hit = g.items.some((it) => {
        const [basePath, q] = (it.path || '').split('?');
        if (basePath !== location.pathname) {
          if (it.matchPrefix && location.pathname.startsWith(basePath + '/')) {
            // matchPrefix items only own the prefix, not the tab — count it.
            return true;
          }
          return false;
        }
        // pathname matches; if either side has no tab spec, consider it a hit
        // when the URL also has no tab; otherwise require an exact tab match.
        const itTab = q ? new URLSearchParams(q).get('tab') : null;
        if (!itTab) return true; // "main" items always match the bare pathname
        return itTab === urlTab;
      });
      if (hit) targets[g.id] = true;
    }
    if (Object.keys(targets).length > 0) {
      setExpandedSections((prev) => ({ ...prev, ...targets }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Close language dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search navigation items
  const searchItems = [
    { path: '/admin', label: t('dashboard'), keywords: ['dashboard', t('i18n_dashboard_7e6c9a'), t('i18n_panel_c86b88')] },
    { path: '/admin/leads', label: t('leads'), keywords: ['leads', t('i18n_leads_c10bd0'), t('i18n_clients_8c58d5')] },
    { path: '/admin/customers', label: t('customers'), keywords: ['customers', t('i18n_clients_8c58d5')] },
    { path: '/admin/legal?tab=deal_pipeline', label: t('deals'), keywords: ['deals', t('i18n_deals_4ec303'), 'deal pipeline'] },
    { path: '/admin/legal?tab=deposit_v2', label: t('deposits'), keywords: ['deposits', t('i18n_deposits_6633bf'), 'deposit'] },
    { path: '/admin/documents', label: t('documents'), keywords: ['documents', t('i18n_documents_14684f')] },
    { path: '/admin/legal', label: t('legalWorkflow'), keywords: ['legal', 'egn', 'depozit', 'contract', t('i18n_legal_fe8b9d'), t('i18n_deposit_ed89d7')] },
    { path: '/admin/finance', label: t('w12a_title'), keywords: ['finance', 'money', 'cash', 'outstanding', 'transactions', 'refunds'] },
    { path: '/admin/delivery', label: t('w13_title'), keywords: ['delivery', 'shipment', 'shipments', 'carrier', 'carriers', 'eta', 'cmr', 'customs', 'logistics'] },
    { path: '/admin/operations', label: t('w14_title'), keywords: ['operations', 'ops', 'ceo', 'owner', 'dashboard', 'bottleneck', 'bottlenecks', 'sla', 'team', 'risk'] },
    { path: '/admin/calculator', label: t('calculatorAdmin'), keywords: ['calculator', t('i18n_calculator_c43f5c')] },
    { path: '/admin/staff', label: t('staff'), keywords: ['staff', t('i18n_team_3d2671'), t('i18n_staff_d3dfee')] },
    { path: '/admin/tasks', label: t('tasks'), keywords: ['tasks', t('i18n_tasks_4cbd2c')] },
    { path: '/admin/settings', label: t('system'), keywords: ['settings', t('i18n_settings_07cc11')] },
  ];

  const filteredSearchItems = searchQuery.trim() 
    ? searchItems.filter(item => 
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const handleSearchSelect = (path) => {
    navigate(path);
    setSearchQuery('');
    setIsMobileSearchOpen(false);
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  // Phase E badge — poll pending resolver/transfer exceptions every 30 s.
  useEffect(() => {
    if (!user || !['master_admin', 'admin'].includes(user?.role)) return;
    let cancelled = false;
    const API = process.env.REACT_APP_BACKEND_URL || '';
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) return;
    const load = () => {
      fetch(`${API}/api/admin/identity/exceptions/count`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && !cancelled) setAutomationExceptionsCount(d.pending || 0); })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Check if any item in section is active (uses smart resolver below)
  const isSectionActive = (items) => {
    return items.some(item => isItemActive(item.path));
  };

  // Navigation structure with groups - using translations
  // Roles: master_admin (admin), team_lead, manager
  const navGroups = [
    {
      id: 'dashboard',
      type: 'single',
      item: { path: '/admin', icon: ChartPieSlice, labelKey: 'dashboard' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 16 — Executive Center. Owner-level governance lens that mounts
      // ABOVE every operational 360 (Ops / Forecast / Contract / Finance / Delivery).
      // Five tabs: dashboard / forecast / bottlenecks / risks / team.
      id: 'executive',
      type: 'single',
      item: { path: '/admin/executive', icon: Crown, labelKey: 'w16_title' },
      roles: ['master_admin', 'admin']
    },
    {
      // Wave 17 — Action Center. Execution layer on top of every risk/bottleneck
      // surfaced by Ops360 / Forecast360 / Contract360 / Delivery360.
      // Inbox / My Actions / Team / Analytics.
      id: 'actions',
      type: 'single',
      item: { path: '/admin/actions', icon: Lightning, labelKey: 'w17_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 18 — Communication & Notification Center. First delivery channel
      // layer driven by the Action lifecycle (Wave 17). Inbox / Preferences /
      // Analytics / SLA Engine (Wave 18.1) — auto-escalates overdue actions
      // 24h → owner, 72h → team_lead, 7d → admin.
      id: 'notifications-center',
      type: 'single',
      item: { path: '/admin/notifications-center', icon: Bell, labelKey: 'w18_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'crm',
      type: 'group',
      labelKey: 'crm',
      icon: UsersThree,
      items: [
        { path: '/admin/leads', icon: UserPlus, labelKey: 'leads' },
        { path: '/admin/customers', icon: UserCircle, labelKey: 'customers' },
        // Phase Final / Block 2 — Sales entity (sold vehicles, USA/Korea/Other).
        { path: '/admin/sales', icon: Banknote, labelKey: 'sales_nav' },
        // Phase Final / Block 3 — Meetings + Calendar (.ics export).
        { path: '/admin/meetings', icon: CalendarCheck, labelKey: 'meetings_nav' },
        // Wave 19 — Customer Portal View. Cross-cutting read-only screen
        // (manager / team_lead / admin) that answers "what is the customer
        // currently seeing about their order?" via 5 read-only blocks:
        // My Car · Delivery Timeline · Documents · Payments · Notifications.
        { path: '/admin/customer-portal', icon: Storefront, labelKey: 'cp_portal_title' },
        // Sprint 3.5 — Customer Roadmaps. Company-wide vehicle journey
        // dashboard (auction → handover) with SLA breach surfacing for
        // Team Lead / Master Admin.
        { path: '/admin/roadmaps', icon: Compass, labelKey: 'roadmaps_nav' },
        // Mini Sprint Contracts Final — Document Templates editor.
        // Master-admin can edit the Jinja2/HTML templates that the PDF
        // Engine uses to generate contracts / invoices / acceptance acts.
        { path: '/admin/document-templates', icon: FileText, labelKey: 'doctpl_nav' },
        // "Deals" removed — it was a `?tab=deal_pipeline` shortcut to Legal Workflow.
        // Legal Workflow page now serves as the single entry; Deal Pipeline lives
        // as the second horizontal tab within it.
      ],
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 14 — Operations 360. CEO/Owner-grade overview that sits ABOVE
      // every other 360 (Lead/Customer/Deal/Finance/Delivery). Lives at the
      // very top of the sidebar so the owner lands on it first thing every
      // morning.
      id: 'operations',
      type: 'single',
      item: { path: '/admin/operations', icon: Lightning, labelKey: 'w14_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 12C — Forecasting 360. Deterministic forecaster (no AI/ML):
      // revenue weighted by stage probability, cash flow projection,
      // pipeline buckets, capacity load and forecast risk.
      id: 'forecast',
      type: 'single',
      item: { path: '/admin/forecast', icon: ChartLineUp, labelKey: 'w12c_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 15 — Contract 360. Contract Lifecycle Management — templates,
      // approval flow (manager → team_lead → admin → customer), signatures,
      // amendments, attachments, contract health scorer (8 segments).
      id: 'contracts',
      type: 'single',
      item: { path: '/admin/contracts', icon: FileText, labelKey: 'w15_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'finance',
      type: 'group',
      labelKey: 'finance',
      icon: Wallet,
      items: [
        // Wave 12A — Finance 360. Operational money control center
        // (Overview / Transactions journal / Outstanding). Scope-aware:
        // admin = company-wide, team_lead = team, manager = own deals.
        { path: '/admin/finance', icon: ChartLine, labelKey: 'w12a_title' },
        // Finance — единая точка входа в финансовый workflow:
        //   Legal Workflow → 6 горизонтальных табов (Customer Legal · Deal Pipeline ·
        //   Deposit · Contract · Financials & Payments · Calculations).
        // Documents и Payment Analytics вынесены в Analytics & Insights, чтобы
        // в этом разделе не было дубликатов с тем, что уже доступно как вкладки
        // внутри Legal Workflow.
        { path: '/admin/legal', icon: Scales, labelKey: 'legalWorkflow' },
        { path: '/admin/invoice-reminders', icon: PhoneCall, labelKey: 'invoiceReminders', roles: ['master_admin', 'admin', 'team_lead'] },
      ],
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave 13 — Delivery 360. "Where is the car?" control plane:
      // milestones, carrier center, ETA engine, delivery documents.
      id: 'delivery',
      type: 'single',
      item: { path: '/admin/delivery', icon: Truck, labelKey: 'w13_title' },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Calculator — flat single item (was: nested under "Авто" group along with
      // Parser Sources Control, Vehicle DB, Quote Analytics — all of those
      // were removed because Parser tooling already lives under /admin/parser*
      // and is not a duplicate of "Auto" tab).
      id: 'calculator',
      type: 'single',
      item: { path: '/admin/calculator', icon: Percent, labelKey: 'calculatorAdmin' },
      roles: ['master_admin', 'moderator', 'admin', 'team_lead', 'manager']
    },
    {
      id: 'team',
      type: 'group',
      labelKey: 'staffSection',
      icon: UsersFour,
      items: [
        { path: '/admin/team-lead', icon: Shield, labelKey: 'teamLeadPanel', roles: ['team_lead'] },
        { path: '/admin/staff', icon: Users, labelKey: 'staff' },
        { path: '/admin/tasks', icon: ListChecks, labelKey: 'tasks' },
        // Wave 7.5 — Login Audit moved here from "Settings": it's a staff-
        // management tool (who logged in / when / from where / how), not
        // a configuration knob. Lives with Staff + Tasks where you actually
        // manage people.
        { path: '/admin/login-audit', icon: Shield, label: 'Login Audit', roles: ['master_admin', 'admin'] },
      ],
      roles: ['master_admin', 'admin', 'team_lead']
    },
    {
      id: 'teamWorkspace',
      type: 'single',
      // Sub-pages (Manager Load Board, Team Leads, Team Tasks, Payments Watch,
      // Team Orders, Shipping Watch, Alerts Feed, Reassignments, Team Performance)
      // are reachable from inside Team Dashboard — no need to clutter the sidebar
      // with the same links. Each sub-page has a Back-to-Dashboard button.
      item: { path: '/team/dashboard', icon: Kanban, labelKey: 'teamDashboard', matchPrefix: true },
      roles: ['master_admin', 'admin', 'team_lead']
    },
    {
      id: 'managerWorkspace',
      type: 'single',
      // Sub-pages (My Tasks, My Invoices, My Orders, My Shipments, My Calls) are
      // reachable from inside the Manager Workspace dashboard. Each sub-page has
      // a Back-to-Workspace button.
      item: { path: '/manager', icon: User, labelKey: 'myWorkspace', matchPrefix: true },
      roles: ['master_admin', 'admin', 'team_lead', 'manager']
    },
    {
      // Wave-8 — User Engagement folded into /admin/insights → Traffic & Engagement tab.
      // The standalone entry is removed; we keep the route alias above for old bookmarks.
      // Old top-level item removed (was here in Wave 7.5).
      id: 'userEngagement',
      type: 'single',
      item: { path: '/admin/insights?tab=traffic', icon: Heart, labelKey: 'userEngagement' },
      roles: []  // hidden — accessible inside Insights → Traffic tab
    },
    {
      // «Top Deals Builder» — основная рабочая страница менеджера для
      // подборок. У тимлида/админа есть та же логика прямо внутри
      // «Top Deals Approvals» (кнопка «+ Create Top Deal»), поэтому
      // отдельный пункт меню им НЕ нужен, чтобы не плодить дубли.
      id: 'managerWishlist',
      type: 'single',
      item: { path: '/manager/wishlist', icon: Fire, labelKey: 'topDealsBuilder' },
      roles: ['master_admin', 'manager']
    },
    {
      // Team-lead approval queue for the wishlist cards above.
      // Only team_lead + admin see this entry.
      id: 'teamWishlistApprovals',
      type: 'single',
      item: { path: '/team/wishlist-approvals', icon: Lightning, labelKey: 'topDealsApprovals' },
      roles: ['master_admin', 'admin', 'team_lead']
    },
    {
      id: 'control',
      type: 'single',
      // Control is a hub. The page itself renders a horizontal sub-nav at
      // the top with all 5 sections (Business Metrics · Provider Pressure ·
      // Routing Rules · Cadences · Score Rules) — no need to duplicate them
      // in the sidebar dropdown. The sidebar entry points to the first
      // Control page and `matchPrefix` keeps it highlighted on every
      // Control sub-page.
      item: {
        path: '/admin/business-metrics',
        icon: Lightning,
        labelKey: 'control',
        // also match all Control sub-routes so the entry stays highlighted
        extraMatch: [
          '/admin/provider-health',
          '/admin/routing-rules',
          '/admin/cadences',
          '/admin/score-rules',
        ],
      },
      roles: ['master_admin', 'admin'],
    },
    {
      id: 'settings',
      type: 'group',
      labelKey: 'settings',
      icon: Sliders,
      items: [
        { path: '/admin/payments', icon: CreditCard, label: t('i18n_payments_stripe_c21776'), roles: ['master_admin', 'admin'] },
        { path: '/admin/services', icon: Stack, label: t('i18n_services_catalog_16a322'), roles: ['master_admin', 'admin'] },
        { path: '/admin/settings/notifications', icon: Bell, label: t('hub_sidebar_label'), roles: ['master_admin', 'admin'] },
        // Tracking-hub items moved to top-level `/admin/tracking` (see TrackingLayout.jsx)
        { path: '/admin/ringostat', icon: Phone, labelKey: 'ringostat', roles: ['master_admin', 'admin'] },
        {
          // Unified Tracking hub (VesselFinder · Shipment journey ·
          // Shipment/Automation exceptions · HMAC ext-clients).
          // Nested routes live under /admin/tracking/* — see TrackingLayout.jsx.
          path: '/admin/tracking',
          icon: Anchor,
          label: t('i18n_tracking_f7f54d'),
          badge: 'automationExceptions',
          matchPrefix: true,
          roles: ['master_admin', 'admin'],
        },
        { path: '/admin/parser', icon: Database, label: t('i18n_vin_parser_4ae3fa') },
        { path: '/admin/security', icon: Shield, label: 'Security & 2FA', roles: ['master_admin', 'admin'] },
        // Login Audit moved to Staff group (Wave 7.5) — it's staff management,
        // not configuration. See team group above.
        // Unified System hub: combines old "System" + "Auth & URLs" + "Email outbox"
        { path: '/admin/settings', icon: Wrench, label: 'System', matchPrefix: true, roles: ['master_admin', 'admin'] },
        { path: '/admin/system-settings', icon: Globe, label: 'Domain & CORS', roles: ['master_admin'] },
        // Wave-8.4 — Workers Health migrated into the System hub as a tab.
        // Legacy link removed (route still redirects → /admin/settings?tab=workers).
        { path: '/admin/info', icon: FileText, label: 'Info' },
      ],
      roles: ['master_admin', 'moderator', 'admin']
    },
    {
      // Wave-8 — Insights Hub.
      // Replaces the legacy "Analytics & Insights" group (8 sub-items):
      //   Analytics · Payment Analytics · Journey Funnel · Risk Dashboard ·
      //   Priority Alerts · Documents · Contracts Accounting · Intent Dashboard.
      // All of those are now horizontal sub-tabs INSIDE /admin/insights, with
      // role-aware scoping (admin → company, team_lead → team, manager → personal).
      // Old URLs still work via 301-style redirects in App.js routing.
      id: 'insights',
      type: 'single',
      item: {
        path: '/admin/insights',
        icon: ChartBar,
        labelKey: 'analyticsAndInsights',
        matchPrefix: true,
        // keep highlight when user lands on a legacy alias (before redirect kicks in)
        extraMatch: [
          '/admin/analytics',
          '/admin/owner-dashboard',
          '/admin/journey',
          '/admin/risk',
          '/admin/escalations',
          '/admin/documents',
          '/admin/contracts/accounting',
          '/admin/intent',
          '/admin/engagement',
        ],
      },
      roles: ['master_admin', 'moderator', 'admin', 'team_lead', 'manager']
    }
  ];

  // Filter groups based on user role
  const visibleGroups = navGroups.filter(group => {
    if (!group.roles) return true;
    return group.roles.includes(user?.role);
  });

  // ─────────────────────────────────────────────────────────────────────
  //  Smart sidebar active-state resolver
  //
  //  Multiple sidebar items can share the same pathname but differ in the
  //  `?tab=` query string (e.g. Deals → /admin/legal?tab=deal_pipeline,
  //  Deposits → /admin/legal?tab=deposit_v2, Legal Workflow → /admin/legal).
  //
  //  React-Router's NavLink only inspects pathname which would light up
  //  ALL THREE simultaneously — visually misleading. We pre-compute a
  //  single canonical `activePath` per render so exactly ONE item gets
  //  the .active class.
  //
  //  Resolution rules (deterministic):
  //   1. Collect every nav-item whose base pathname == current pathname.
  //   2. If exactly one candidate → it wins.
  //   3. If >1 candidates and one of them carries ?tab=X equal to the
  //      URL's ?tab=X → that one wins.
  //   4. Otherwise the "main" candidate (no ?tab= in its `to`) wins —
  //      this handles the case where the page rendered the default tab
  //      because no ?tab= was in the URL.
  // ─────────────────────────────────────────────────────────────────────
  const allNavPaths = React.useMemo(() => {
    const out = [];
    for (const g of visibleGroups) {
      if (g.type === 'single' && g.item) {
        out.push({ path: g.item.path, matchPrefix: !!g.item.matchPrefix });
        // `extraMatch` lets a single sidebar entry stay highlighted on a
        // set of sibling URLs (used by Control hub: one entry, 5 pages).
        // Each alias is recorded with the same canonical `path` so the
        // resolver picks the correct entry.
        if (Array.isArray(g.item.extraMatch)) {
          for (const alias of g.item.extraMatch) {
            out.push({ path: g.item.path, alias, matchPrefix: !!g.item.matchPrefix });
          }
        }
      }
      if (g.type === 'group' && Array.isArray(g.items)) {
        for (const it of g.items) {
          if (!it.roles || it.roles.includes(user?.role)) {
            out.push({ path: it.path, matchPrefix: !!it.matchPrefix });
          }
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.role]);

  const activePath = React.useMemo(() => {
    const urlTab = new URLSearchParams(location.search).get('tab');
    // Each candidate has a {path, matchPrefix, alias?} shape; we track
    // whether it's an EXACT match (basePath equals current pathname) or
    // a PREFIX match (startsWith basePath + '/'). Exact wins over prefix
    // always — otherwise a generic "/manager" workspace entry would steal
    // the highlight from a specific child like "/manager/engagement".
    const candidates = [];
    for (const item of allNavPaths) {
      const { path, alias, matchPrefix } = item;
      const target = alias || path;
      const basePath = target.split('?')[0];
      if (basePath === location.pathname) {
        candidates.push({ ...item, basePath, exact: true });
      } else if (matchPrefix && location.pathname.startsWith(basePath + '/')) {
        candidates.push({ ...item, basePath, exact: false });
      }
    }
    if (candidates.length === 0) return null;

    // Prefer EXACT matches over PREFIX matches.
    const exacts = candidates.filter((c) => c.exact);
    const pool = exacts.length > 0 ? exacts : candidates;

    if (pool.length === 1) return pool[0].path;

    // Multi-candidate → prefer the one whose ?tab= matches the URL's tab.
    const matchTab = pool.find(({ path }) => {
      const params = new URLSearchParams(path.split('?')[1] || '');
      return urlTab != null && params.get('tab') === urlTab;
    });
    if (matchTab) return matchTab.path;

    // Otherwise prefer the "main" candidate (no ?tab=)…
    const mainItem = pool.find(({ path }) => !path.includes('?tab='));
    if (mainItem) return mainItem.path;

    // …else just the longest basePath (most specific URL).
    pool.sort((a, b) => b.basePath.length - a.basePath.length);
    return pool[0].path;
  }, [allNavPaths, location.pathname, location.search]);

  const isItemActive = React.useCallback(
    (path) => path === activePath,
    [activePath],
  );

  const roleLabels = {
    master_admin: t('roleMasterAdmin'),
    admin: t('roleAdmin'),
    team_lead: t('roleTeamLead') || 'Team Lead',
    moderator: t('roleModerator'),
    manager: t('roleManager'),
    finance: t('roleFinance')
  };

  return (
    <div className="admin-layout flex h-screen bg-[#F7F7F8]">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          data-testid="mobile-overlay"
        />
      )}

      {/* Sidebar - hidden on mobile (<768px), visible on md+ */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E4E4E7]
        transform transition-transform duration-300 ease-out
        flex flex-col
        md:static md:translate-x-0 md:w-[260px] md:flex
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="p-4 md:p-5 border-b border-[#E4E4E7] flex items-center justify-between">
          <img 
            src="/images/logo.svg" 
            alt={t('logoLabel')} 
            className="h-8 md:h-10 w-auto"
          />
          {/* Close button for mobile */}
          <button
            className="md:hidden p-2 -mr-2 text-[#71717A] hover:text-[#18181B] transition-colors"
            onClick={() => setIsMobileMenuOpen(false)}
            data-testid="mobile-menu-close"
          >
            <X size={24} weight="bold" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 md:py-4 overflow-y-auto" data-testid="sidebar-nav">
          {visibleGroups.map((group) => {
            if (group.type === 'single') {
              // Single item (Dashboard / Tracking hub)
              const { path, icon: Icon, labelKey, label, badge, matchPrefix } = group.item;
              const displayLabel = label || t(labelKey);
              const showBadge = badge === 'automationExceptions' && automationExceptionsCount > 0;
              return (
                <NavLink
                  key={group.id}
                  to={path}
                  end={!matchPrefix}
                  className={() =>
                    `sidebar-item min-h-[44px] ${isItemActive(path) ? 'active' : ''}`
                  }
                  data-testid={`nav-${labelKey || group.id}`}
                >
                  <Icon size={20} weight="duotone" />
                  <span style={{ flex: 1 }}>{displayLabel}</span>
                  {showBadge && (
                    <span
                      data-testid={`badge-${group.id}`}
                      style={{
                        background: '#f59e0b',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        marginLeft: 6,
                      }}
                    >
                      {automationExceptionsCount}
                    </span>
                  )}
                </NavLink>
              );
            }

            // Group with items
            const isExpanded = expandedSections[group.id];
            const isActive = isSectionActive(group.items);
            const GroupIcon = group.icon;
            const groupLabel = group.label || t(group.labelKey);

            return (
              <div key={group.id} className="mb-1">
                {/* Group Header */}
                <button
                  onClick={() => toggleSection(group.id)}
                  className={`sidebar-group-header min-h-[44px] ${isActive ? 'active' : ''}`}
                  data-testid={`nav-group-${group.id}`}
                >
                  <div className="flex items-center gap-3">
                    <GroupIcon size={20} weight="duotone" />
                    <span>{groupLabel}</span>
                  </div>
                  {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
                </button>

                {/* Group Items */}
                {isExpanded && (
                  <div className="sidebar-group-items">
                    {group.items
                      .filter(item => !item.roles || item.roles.includes(user?.role))
                      .map(({ path, icon: Icon, labelKey, label, badge }) => (
                      <NavLink
                        key={path}
                        to={path}
                        className={() =>
                          `sidebar-subitem min-h-[44px] ${isItemActive(path) ? 'active' : ''}`
                        }
                        data-testid={`nav-${labelKey || path.replace(/\//g, '-')}`}
                      >
                        <Icon size={16} weight="duotone" />
                        <span style={{ flex: 1 }}>{label || t(labelKey)}</span>
                        {badge === 'automationExceptions' && automationExceptionsCount > 0 && (
                          <span
                            data-testid="badge-automation-exceptions"
                            style={{
                              background: '#f59e0b',
                              color: '#fff',
                              borderRadius: 999,
                              padding: '2px 7px',
                              fontSize: 11,
                              fontWeight: 700,
                              marginLeft: 6,
                            }}
                          >
                            {automationExceptionsCount}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 md:p-4 border-t border-[#E4E4E7]">
          <div className="text-xs text-[#A1A1AA] px-3 mb-2">{roleLabels[user?.role] || user?.role}</div>
          <NavLink
            to={
              (user?.role || '').toLowerCase() === 'manager'  ? '/manager/profile/password' :
              (user?.role || '').toLowerCase() === 'team_lead' ? '/team/profile/password'    :
                                                                  '/admin/profile/password'
            }
            className="w-full flex items-center gap-2 px-3 py-2.5 mb-1 text-sm font-medium text-[#52525B] hover:text-[#18181B] rounded-xl hover:bg-[#F4F4F5] transition-all"
            data-testid="change-password-link"
          >
            <LockKey size={18} weight="duotone" />
            <span>Change password</span>
          </NavLink>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#71717A] hover:text-[#DC2626] rounded-xl hover:bg-[#FEE2E2] transition-all"
            data-testid="logout-btn"
          >
            <SignOut size={18} weight="duotone" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Header */}
        <header className="relative z-30 h-14 md:h-16 bg-white border-b border-[#E4E4E7] flex items-center justify-between px-3 sm:px-4 md:px-8 gap-2">
          {/* Mobile Menu Button + Search */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            {/* Hamburger Menu Button */}
            <button
              className="md:hidden p-2 -ml-1 text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors flex-shrink-0"
              onClick={() => setIsMobileMenuOpen(true)}
              data-testid="mobile-menu-toggle"
            >
              <List size={22} weight="bold" />
            </button>
            
            {/* Search - Desktop */}
            <div className="hidden md:block w-80 relative">
              <input 
                type="text" 
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input w-full"
                data-testid="search-input"
              />
              {searchQuery && filteredSearchItems.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 py-2 max-h-64 overflow-auto">
                  {filteredSearchItems.map(item => (
                    <button
                      key={item.path}
                      onClick={() => handleSearchSelect(item.path)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-[#F4F4F5] transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
            {/* Mobile Search Button */}
            <button 
              className="md:hidden p-2 text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors flex-shrink-0"
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              data-testid="mobile-search-btn"
            >
              <MagnifyingGlass size={20} weight="bold" />
            </button>
            
            {/* Language Switcher Dropdown */}
            <div className="relative flex-shrink-0" ref={langDropdownRef}>
              <button
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-2 text-sm font-medium text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-all"
                data-testid="lang-switcher-btn"
              >
                <Globe size={20} weight="duotone" />
                <span className="hidden sm:inline">{(languages || LANGUAGES).find(l => l.code === lang)?.label}</span>
                <CaretDown size={14} className={`transition-transform ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isLangDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg py-1 min-w-[140px] z-50">
                  {(languages || LANGUAGES).map((language) => (
                    <button
                      key={language.code}
                      onClick={() => {
                        changeLang(language.code);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        lang === language.code 
                          ? 'bg-[#F4F4F5] text-[#18181B] font-medium' 
                          : 'text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B]'
                      }`}
                      data-testid={`lang-${language.code}`}
                    >
                      <span className="text-base">{language.flag}</span>
                      <span>{language.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Ringostat live bar — gated by per-user preference */}
            {!loadingPrefs && ringostatPrefs?.show_live_bar && (
              <div className="hidden xs:block sm:block">
                <RingostatLiveBar />
              </div>
            )}
            <button
              onClick={() => navigate('/manager/tracking')}
              className="hidden sm:flex w-9 h-9 rounded-full hover:bg-[#F4F4F5] items-center justify-center transition-colors flex-shrink-0"
              title={t('i18n_universal_tracker_vin_containe_26edea')}
              data-testid="global-tracker-btn"
            >
              <MagnifyingGlass size={20} className="text-[#52525B]" />
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Content — unified 50px horizontal padding across every admin page,
            so internal pages (Dashboard, CRM, Leads, Deals, Deposits, Finance,
            Legal Workflow, Calculators, Staff, Team alerts, etc.) all share
            the exact same alignment relative to the header & sidebar. */}
        <main className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-6 lg:px-[50px] lg:py-8">
          {/* Mobile Search Panel */}
          {isMobileSearchOpen && (
            <div className="md:hidden mb-4 relative">
              <input 
                type="text" 
                placeholder={t('search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="input w-full"
                data-testid="mobile-search-input"
              />
              {searchQuery && filteredSearchItems.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E4E4E7] rounded-xl shadow-lg z-50 py-2 max-h-64 overflow-auto">
                  {filteredSearchItems.map(item => (
                    <button
                      key={item.path}
                      onClick={() => handleSearchSelect(item.path)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F4F4F5] transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Ringostat widgets — gated by per-user prefs.
          Phase IV-6: don't mount any intrusive UI until prefs have
          actually loaded, otherwise the FALLBACK (all-on) would briefly
          fire managerial popups for admins on first paint. */}
      {!loadingPrefs && (
        <>
          {(ringostatPrefs?.show_incoming_popup ||
            ringostatPrefs?.show_outcome_banner ||
            ringostatPrefs?.show_missed_alerts) && (
              <RingostatManager prefs={ringostatPrefs} />
          )}
          {ringostatPrefs?.show_aggregate_summary && (
            <RingostatSupervisionPanel role={ringostatRole} />
          )}
        </>
      )}
    </div>
  );
};

export default Layout;
