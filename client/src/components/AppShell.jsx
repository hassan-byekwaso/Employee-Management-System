import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, BriefcaseBusiness, Building2, CalendarCheck, ChevronDown, CircleDollarSign, LayoutDashboard, LogOut, Menu, Target, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

const links = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/employees', label: 'People', icon: Users },
  { to: '/departments', label: 'Departments', icon: Building2 },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/leave', label: 'Leave', icon: BriefcaseBusiness },
  { to: '/payroll', label: 'Payroll', icon: CircleDollarSign },
  { to: '/performance', label: 'Performance', icon: Activity },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const initials = (user?.name || 'User').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const isManager = ['Admin', 'HR Manager', 'Manager'].includes(user?.role);

  useEffect(() => {
    const refreshUnreadCount = () => {
      api.get('/notifications').then(({ data }) => {
        const payload = data.data || data;
        setUnreadCount(payload.unreadCount ?? (Array.isArray(payload) ? payload.filter((item) => !item.readAt).length : 0));
      }).catch(() => setUnreadCount(0));
    };
    refreshUnreadCount();
    window.addEventListener('ems:notifications-changed', refreshUnreadCount);
    return () => window.removeEventListener('ems:notifications-changed', refreshUnreadCount);
  }, [location.pathname]);

  async function logout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      {open && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark">o</div><span>orbit<span className="brand-light">people</span></span><button className="icon-button mobile-close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list">
          {links.filter((item) => item.to !== '/employees' || isManager || user?.role === 'Employee')
            .filter((item) => item.to !== '/departments' || isManager)
            .filter((item) => item.to !== '/payroll' || isManager || user?.role === 'Employee')
            .map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setOpen(false)}>
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Notifications' && unreadCount > 0 && <span className="nav-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </NavLink>
            ))}
          {isManager && <NavLink to="/reports" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setOpen(false)}><Activity size={18} /><span>Reports</span></NavLink>}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon">?</div><div><b>Need a hand?</b><span>Visit the help center</span></div></div>
          <button className="user-menu" onClick={logout}><div className="avatar">{initials}</div><div className="user-info"><b>{user?.name || 'Team member'}</b><span>{user?.role || 'Employee'}</span></div><LogOut size={16} className="logout-icon" /><ChevronDown size={15} className="user-chevron" /></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb">Workspace <span>/</span> <b>People operations</b></div><div className="topbar-actions"><div className="today-label">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div><NavLink to="/notifications" className="topbar-bell" aria-label={`${unreadCount} unread notifications`}><Bell size={19} />{unreadCount > 0 && <i />}</NavLink><div className="avatar avatar-small">{initials}</div></div></header>
        <div className="page-content"><Outlet /></div>
        <footer className="app-footer">Orbit People <span>·</span> Your people, in sync</footer>
      </main>
    </div>
  );
}
