import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Send, BarChart3,
  User, Settings, Bell, LogOut,
  Zap, BookOpen, Sliders, Cpu, ShieldCheck,
  CheckSquare, Users, CreditCard, ClipboardList, Activity,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../lib/auth';

const ROLE_COLORS = {
  Admin:    { bg: 'rgba(99,102,241,0.15)',  color: 'var(--indigo-400)', label: 'Administrator' },
  Manager:  { bg: 'rgba(245,158,11,0.12)',  color: 'var(--amber-400)',  label: 'Manager' },
  Finance:  { bg: 'rgba(16,185,129,0.12)', color: 'var(--emerald-400)', label: 'Finance Officer' },
  Employee: { bg: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)', label: 'Employee' },
};

const NavSection = ({ label, children }) => (
  <div>
    {label && <div className="nav-section-label">{label}</div>}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {children}
    </div>
  </div>
);

const SidebarLink = ({ to, icon, label, end, badge }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
  >
    <span style={{ flexShrink: 0, display: 'flex', opacity: 0.85 }}>{icon}</span>
    <span style={{ flex: 1 }}>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span style={{
        background: 'var(--crimson-100)',
        color: 'var(--crimson-400)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: '99px',
        fontSize: '10px',
        fontWeight: 600,
        padding: '1px 6px',
        minWidth: 18,
        textAlign: 'center',
      }}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </NavLink>
);

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.Employee;

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      backgroundColor: 'var(--surface-raised)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>

      {/* Brand */}
      <div style={{
        padding: '16px 14px 15px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexShrink: 0,
      }}>
        <div style={{
          width: 30,
          height: 30,
          background: 'linear-gradient(135deg, var(--indigo-600) 0%, var(--violet-600) 100%)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
        }}>
          <Zap size={15} color="#fff" strokeWidth={2.5} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--text-md)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
          }}>
            FinanceOS
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--text-disabled)',
            lineHeight: 1.2,
            fontWeight: 400,
            letterSpacing: '0.02em',
          }}>
            Enterprise Platform
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
      }}>

        {/* ── EMPLOYEE ── */}
        {role === 'Employee' && (
          <>
            <NavSection label="My Work">
              <SidebarLink to="/" end icon={<LayoutDashboard size={15} strokeWidth={1.75} />} label="Dashboard" />
              <SidebarLink to="/expenses" icon={<FileText size={15} strokeWidth={1.75} />} label="My Claims" />
              <SidebarLink to="/submit" icon={<Send size={15} strokeWidth={1.75} />} label="Submit Claim" />
              <SidebarLink to="/invoices" icon={<Receipt size={15} strokeWidth={1.75} />} label="Invoices" />
            </NavSection>
            <NavSection label="Account">
              <SidebarLink to="/notifications" icon={<Bell size={15} strokeWidth={1.75} />} label="Notifications" />
              <SidebarLink to="/profile" icon={<User size={15} strokeWidth={1.75} />} label="Profile" />
            </NavSection>
          </>
        )}

        {/* ── MANAGER ── */}
        {role === 'Manager' && (
          <>
            <NavSection label="Workspace">
              <SidebarLink to="/" end icon={<LayoutDashboard size={15} strokeWidth={1.75} />} label="Dashboard" />
              <SidebarLink to="/expenses" icon={<CheckSquare size={15} strokeWidth={1.75} />} label="Approvals" />
              <SidebarLink to="/invoices" icon={<Receipt size={15} strokeWidth={1.75} />} label="Invoice Approvals" />
            </NavSection>
            <NavSection label="Insights">
              <SidebarLink to="/analytics" icon={<BarChart3 size={15} strokeWidth={1.75} />} label="Analytics" />
            </NavSection>
            <NavSection label="Account">
              <SidebarLink to="/notifications" icon={<Bell size={15} strokeWidth={1.75} />} label="Notifications" />
              <SidebarLink to="/profile" icon={<User size={15} strokeWidth={1.75} />} label="Profile" />
            </NavSection>
          </>
        )}

        {/* ── FINANCE ── */}
        {role === 'Finance' && (
          <>
            <NavSection label="Workspace">
              <SidebarLink to="/" end icon={<LayoutDashboard size={15} strokeWidth={1.75} />} label="Dashboard" />
              <SidebarLink to="/expenses" icon={<CreditCard size={15} strokeWidth={1.75} />} label="Payments" />
              <SidebarLink to="/invoices" icon={<Receipt size={15} strokeWidth={1.75} />} label="Invoice Payments" />
            </NavSection>
            <NavSection label="Insights">
              <SidebarLink to="/analytics" icon={<BarChart3 size={15} strokeWidth={1.75} />} label="Analytics" />
            </NavSection>
            <NavSection label="Account">
              <SidebarLink to="/notifications" icon={<Bell size={15} strokeWidth={1.75} />} label="Notifications" />
              <SidebarLink to="/profile" icon={<User size={15} strokeWidth={1.75} />} label="Profile" />
            </NavSection>
          </>
        )}

        {/* ── ADMIN ── */}
        {role === 'Admin' && (
          <>
            <NavSection label="Overview">
              <SidebarLink to="/" end icon={<LayoutDashboard size={15} strokeWidth={1.75} />} label="Dashboard" />
              <SidebarLink to="/expenses" icon={<ClipboardList size={15} strokeWidth={1.75} />} label="All Expenses" />
              <SidebarLink to="/invoices" icon={<Receipt size={15} strokeWidth={1.75} />} label="All Invoices" />
              <SidebarLink to="/analytics" icon={<BarChart3 size={15} strokeWidth={1.75} />} label="Analytics" />
            </NavSection>
            <NavSection label="Administration">
              <SidebarLink to="/settings" icon={<Settings size={15} strokeWidth={1.75} />} label="Expense Policies" />
              <SidebarLink to="/knowledge" icon={<BookOpen size={15} strokeWidth={1.75} />} label="Policy Library" />
            </NavSection>
            <NavSection label="AI Operations">
              <SidebarLink to="/policy-rules" icon={<Sliders size={15} strokeWidth={1.75} />} label="Rule Engine" />
              <SidebarLink to="/ai-config" icon={<Cpu size={15} strokeWidth={1.75} />} label="AI Config" />
              <SidebarLink to="/ai-logs" icon={<Activity size={15} strokeWidth={1.75} />} label="Audit Logs" />
            </NavSection>
            <NavSection label="Account">
              <SidebarLink to="/notifications" icon={<Bell size={15} strokeWidth={1.75} />} label="Notifications" />
              <SidebarLink to="/profile" icon={<User size={15} strokeWidth={1.75} />} label="Profile" />
            </NavSection>
          </>
        )}
      </nav>

      {/* User footer */}
      <div style={{
        padding: '10px',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            padding: '8px 9px',
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            transition: 'background var(--transition-fast)',
          }}
          onClick={() => navigate('/profile')}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {/* Avatar */}
          <div style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--indigo-100)',
            border: '1.5px solid rgba(99,102,241,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--indigo-400)',
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}>
              {user?.name}
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 6px',
              borderRadius: '99px',
              fontSize: '10px',
              fontWeight: 500,
              background: roleStyle.bg,
              color: roleStyle.color,
              marginTop: '1px',
            }}>
              {roleStyle.label || role}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); handleLogout(); }}
            className="btn btn-ghost"
            style={{ padding: '4px', color: 'var(--text-tertiary)' }}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
