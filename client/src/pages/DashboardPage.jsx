import { useEffect, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, CircleDollarSign, Clock3, MoreHorizontal, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const fallback = {
  totalEmployees: null, presentToday: null, onLeave: null, monthlyPayroll: null,
  departments: [], recentActivity: [], newStarters: [],
};

function metricValue(value, kind) {
  if (value == null) return '—';
  return kind === 'currency' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value) : Number(value).toLocaleString();
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(fallback);
  const [error, setError] = useState('');
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  useEffect(() => {
    api.get('/dashboard').then(({ data: result }) => {
      const payload = result.data || result;
      setData({
        ...fallback,
        ...payload,
        totalEmployees: payload.totalEmployees ?? payload.employees,
        presentToday: payload.presentToday ?? payload.attendanceToday,
        onLeave: payload.onLeave ?? payload.pendingLeaves,
        departments: payload.departments?.length ? payload.departments : fallback.departments,
      });
    })
      .catch((requestError) => setError(`${getErrorMessage(requestError)}. Live dashboard data is unavailable.`));
  }, []);
  const isEmployee = user?.role === 'Employee';
  const cards = [
    isEmployee
      ? { title: 'My attendance today', value: data.presentToday, icon: Clock3, tone: 'green', change: data.presentToday ? 'Checked in' : 'Not checked in', direction: 'up', note: 'today' }
      : { title: 'Total employees', value: data.totalEmployees, icon: Users, tone: 'blue', change: '+8.2%', direction: 'up', note: 'vs. last month' },
    isEmployee
      ? { title: 'On leave today', value: data.onLeave, icon: BriefcaseBusiness, tone: 'orange', change: 'Time off', direction: 'down', note: 'your status' }
      : { title: 'Present today', value: data.presentToday, icon: Clock3, tone: 'green', change: 'Checked in', direction: 'up', note: 'employees today' },
    isEmployee
      ? { title: 'My pending requests', value: data.pendingLeaves, icon: BriefcaseBusiness, tone: 'orange', change: 'Leave', direction: 'down', note: 'awaiting review' }
      : { title: 'On leave today', value: data.onLeave, icon: BriefcaseBusiness, tone: 'orange', change: 'Time off', direction: 'down', note: 'employees today' },
    { title: isEmployee ? 'My monthly pay' : 'Monthly payroll', value: data.monthlyPayroll, kind: 'currency', icon: CircleDollarSign, tone: 'purple', change: isEmployee ? 'Current period' : '+2.4%', direction: 'up', note: isEmployee ? 'net pay' : 'vs. last month' },
  ];
  return (
    <div className="dashboard-page">
      <div className="page-heading"><div><div className="eyebrow">{dateLabel} <span className="eyebrow-dot" /> {greeting.toUpperCase()}</div><h1>{greeting}, {user?.name?.split(' ')[0] || 'there'} <span className="wave">✦</span></h1><p>Here’s what’s happening with your people today.</p></div><button className="button button-secondary"><CalendarDays size={16} /> This month <span className="chevron-down">⌄</span></button></div>
      {error && <div className="inline-notice">{error}</div>}
      <div className="metric-grid">{cards.map(({ title, value, kind, icon: Icon, tone, change, direction, note }) => <article className="metric-card" key={title}><div className="metric-top"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><button aria-label={`More ${title} options`} className="more-button"><MoreHorizontal size={19} /></button></div><div className="metric-title">{title}</div><div className="metric-value">{metricValue(value, kind)}</div><div className="metric-foot"><span className={`metric-change ${direction}`}>{direction === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</span><span>{note}</span></div></article>)}</div>
      <div className="dashboard-grid">
        <section className="panel headcount-panel"><div className="panel-heading"><div><h2>Team overview</h2><p>Headcount by department</p></div><button className="text-button">View all <ArrowRight size={15} /></button></div><div className="chart-area"><div className="chart-y-labels"><span>80</span><span>60</span><span>40</span><span>20</span><span>0</span></div><div className="chart-main"><div className="chart-gridlines"><i /><i /><i /><i /><i /></div><div className="chart-bars">{(data.departments || []).slice(0, 6).map((department, index) => <div className="chart-column" key={department._id || department.name}><div className={`bar bar-${index % 5}`} style={{ height: `${Math.min(100, (department.employeeCount || department.count || 0) / 80 * 100)}%` }} title={`${department.employeeCount ?? department.count ?? 0} employees`} /><span>{department.name}</span></div>)}</div></div></div><div className="chart-legend"><span><i className="legend-dot blue-dot" /> Current headcount</span><span className="chart-period">Updated just now</span></div></section>
        <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates across your team</p></div><button className="more-button" aria-label="Activity options"><MoreHorizontal size={19} /></button></div><div className="activity-list">{(data.recentActivity || []).slice(0, 5).map((item, index) => <div className="activity-item" key={item._id || item.id || index}><div className={`activity-icon activity-${item.type || 'default'}`}>{item.type === 'payroll' ? <CircleDollarSign size={16} /> : item.type === 'employee' ? <Users size={16} /> : <BriefcaseBusiness size={16} />}</div><div className="activity-copy"><b>{item.title || item.action}</b><span>{item.description || item.message}</span></div><time>{index === 0 ? 'Now' : `${index}h ago`}</time></div>)}{!data.recentActivity?.length && <div className="empty-starts">No recent updates to show.</div>}</div><Link to="/notifications" className="activity-link">See all activity <ArrowRight size={15} /></Link></section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel onboarding-panel"><div className="panel-heading"><div><h2>New starters</h2><p>Welcome your newest teammates</p></div><Link to="/employees" className="text-button">View all <ArrowRight size={15} /></Link></div>{(data.newStarters || []).length ? data.newStarters.map((starter, index) => <div className="starter-row" key={starter._id}><div className={`avatar starter-avatar ${index % 2 ? 'lilac' : 'peach'}`}>{starter.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><div><b>{starter.fullName}</b><span>{starter.jobTitle} · {starter.department}</span></div><span className="start-date">{new Date(starter.hireDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>) : <div className="empty-starts">No new starters in the last 30 days.</div>}</section>
        <section className="panel snapshot-panel"><div className="panel-heading"><div><h2>Time off snapshot</h2><p>Upcoming team absences</p></div><Link to="/leave" className="text-button">Manage <ArrowRight size={15} /></Link></div><div className="timeoff-number">{data.onLeave ?? '—'}<span> people out today</span></div><div className="timeoff-progress"><i style={{ width: `${data.totalEmployees ? Math.min(100, (data.onLeave || 0) / data.totalEmployees * 100) : 0}%` }} /></div><div className="timeoff-foot"><span>{data.totalEmployees ? `${data.onLeave || 0} of ${data.totalEmployees} employees` : 'Workforce data unavailable'}</span><span>{data.totalEmployees ? `${((data.onLeave || 0) / data.totalEmployees * 100).toFixed(1)}%` : '—'}</span></div></section>
      </div>
    </div>
  );
}
