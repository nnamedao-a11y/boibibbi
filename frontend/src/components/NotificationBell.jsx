import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCircle, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { useNotifications } from '../hooks/useNotifications';
import { useLang } from '../i18n';
import { useAuth } from '../App';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const NotificationBell = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Wave 18 — action-lifecycle notification count, polled every 30s.
  // This is ADDITIVE to the legacy useNotifications hook below; the bell
  // surfaces whichever side has unread items, but a single click on
  // "View all" routes the user to the Wave 18 Notification Center.
  const [wave18Unread, setWave18Unread] = useState(0);

  const {
    notifications,
    unreadCount,
    connected,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
  } = useNotifications({
    userId: user?.id || user?.sub,
    role: user?.role,
    soundEnabled: true,
    onNotification: (notification) => {
      // Show toast or other UI feedback
      console.log('New notification:', notification);
    },
  });

  // Poll Wave 18 unread-count every 30s while authenticated.
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');
    if (!token) return undefined;
    const fetchW18 = async () => {
      try {
        const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setWave18Unread(Number(data?.unread || 0));
      } catch (_e) { /* silent */ }
    };
    fetchW18();
    const id = setInterval(fetchW18, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  // Fetch notifications on mount
  useEffect(() => {
    if (user?.id || user?.sub) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <WarningCircle size={16} className="text-red-500" weight="fill" />;
      case 'warning':
        return <Warning size={16} className="text-amber-500" weight="fill" />;
      default:
        return <Bell size={16} className="text-blue-500" weight="fill" />;
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-100';
      case 'warning':
        return 'bg-amber-50 border-amber-100';
      default:
        return 'bg-blue-50 border-blue-100';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return t('justNow') || 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t('minutesAgo') || 'min ago'}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('hoursAgo') || 'h ago'}`;
    return date.toLocaleDateString();
  };

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    const link = notification.meta?.link;
    if (link) {
      // SPA navigation — no full page reload
      if (link.startsWith('http://') || link.startsWith('https://')) {
        window.open(link, '_blank', 'noopener,noreferrer');
      } else {
        navigate(link);
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef} data-testid="notification-bell">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-zinc-100 transition-colors"
        data-testid="notification-bell-button"
      >
        <Bell size={22} weight={(unreadCount + wave18Unread) > 0 ? 'fill' : 'regular'} className="text-[#18181B]" />
        
        {/* Unread Badge — sums legacy + Wave 18 action-lifecycle */}
        {(unreadCount + wave18Unread) > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center 
                       rounded-full bg-red-500 text-white text-xs font-bold px-1"
          >
            {(unreadCount + wave18Unread) > 99 ? '99+' : (unreadCount + wave18Unread)}
          </motion.span>
        )}
        
        {/* Connection indicator removed per design — bell stays clean */}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-auto sm:mt-2 sm:w-96 max-w-[calc(100vw-16px)] sm:max-w-none max-h-[480px] bg-white rounded-2xl shadow-xl 
                       border border-zinc-200 overflow-hidden z-50"
            data-testid="notification-dropdown"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-100">
              <h3 className="font-semibold text-zinc-900">
                {t('notifications') || 'Notifications'}
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-[#18181B] 
                               hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    <Check size={14} />
                    {t('markAllRead') || 'Mark all read'}
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  <X size={16} className="text-zinc-400" />
                </button>
              </div>
            </div>

            {/* Wave 18 Action-lifecycle pointer (always visible when there are wave18 unread) */}
            {wave18Unread > 0 && (
              <button
                onClick={() => { setIsOpen(false); navigate('/admin/notifications-center'); }}
                className="w-full px-4 py-3 border-b border-zinc-100 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left flex items-center justify-between gap-2"
                data-testid="bell-wave18-link"
              >
                <span className="text-sm font-semibold text-indigo-900">
                  {wave18Unread} action notification{wave18Unread === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-indigo-700">Open Notification Center →</span>
              </button>
            )}

            {/* Notifications List */}
            <div className="max-h-[380px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={40} className="mx-auto text-zinc-300 mb-3" />
                  <p className="text-zinc-500 text-sm">
                    {t('noNotifications') || 'No notifications yet'}
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`p-4 border-b border-zinc-50 cursor-pointer hover:bg-zinc-50 transition-colors
                               ${!notification.isRead ? 'bg-zinc-50/60' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      {/* Icon */}
                      <div className={`flex-shrink-0 p-2 rounded-xl ${getSeverityBg(notification.severity)}`}>
                        {getSeverityIcon(notification.severity)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm text-zinc-900 truncate">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[#18181B]" />
                          )}
                        </div>
                        <p className="text-sm text-zinc-600 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-100 bg-zinc-50">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/admin/notifications-center');
                }}
                className="w-full text-center text-sm text-[#18181B] hover:bg-zinc-100 font-medium rounded-lg py-2 transition-colors"
                data-testid="bell-view-all"
              >
                {t('viewAll') || 'View all notifications'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
