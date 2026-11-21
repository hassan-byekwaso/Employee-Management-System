import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, Check, Clock3, Download, Plus, Search, X } from 'lucide-react';
import { api, getErrorMessage } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const definitions = {
  employees: { endpoint: 'employees', fields: [['employeeId', 'Employee ID'], ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['department', 'Department', 'department'], ['jobTitle', 'Designation'], ['phone', 'Phone'], ['hireDate', 'Date of joining', 'date'], ['salary', 'Annual salary', 'number'], ['employmentStatus', 'Status', 'select', ['active', 'on-leave', 'inactive', 'terminated']]], columns: ['fullName', 'employeeId', 'jobTitle', 'department', 'email', 'employmentStatus'] },
  departments: { endpoint: 'departments', fields: [['name', 'Department name'], ['manager', 'Manager', 'employee'], ['budget', 'Annual budget', 'number']], columns: ['name', 'manager', 'employeeCount', 'budget'] },
  attendance: { endpoint: 'attendance', fields: [['employee', 'Employee', 'employee'], ['date', 'Date', 'date'], ['checkIn', 'Check-in time', 'time'], ['checkOut', 'Check-out time', 'time'], ['status', 'Status', 'select', ['present', 'late', 'half-day', 'absent']]], columns: ['date', 'employee', 'checkIn', 'checkOut', 'workingHours', 'status'] },
  leave: { endpoint: 'leave', fields: [['employee', 'Employee', 'employee'], ['type', 'Leave type', 'select', ['Casual', 'Sick', 'Paid', 'Unpaid']], ['startDate', 'Start date', 'date'], ['endDate', 'End date', 'date'], ['days', 'Days', 'number'], ['reason', 'Reason', 'textarea']], columns: ['employee', 'type', 'startDate', 'endDate', 'days', 'status'] },
  payroll: { endpoint: 'payroll', fields: [['employee', 'Employee', 'employee'], ['periodStart', 'Period start', 'date'], ['periodEnd', 'Period end', 'date'], ['baseSalary', 'Basic salary', 'number'], ['allowances', 'Allowances', 'number'], ['bonuses', 'Bonuses', 'number'], ['deductions', 'Deductions', 'number'], ['tax', 'Tax', 'number'], ['netPay', 'Net salary', 'number']], columns: ['employee', 'periodStart', 'baseSalary', 'netPay', 'status'] },
  performance: { endpoint: 'performance', fields: [['employee', 'Employee', 'employee'], ['reviewPeriod', 'Review period'], ['rating', 'Rating (1–5)', 'number'], ['strengths', 'Strengths', 'textarea'], ['improvements', 'Areas to improve', 'textarea'], ['comments', 'Feedback', 'textarea']], columns: ['employee', 'reviewPeriod', 'rating', 'comments', 'status'] },
  goals: { endpoint: 'goals', fields: [['employee', 'Employee', 'employee'], ['title', 'Goal'], ['description', 'Description', 'textarea'], ['progress', 'Progress (%)', 'number'], ['dueDate', 'Due date', 'date']], columns: ['employee', 'title', 'progress', 'dueDate', 'status'] },
  notifications: { endpoint: 'notifications', fields: [['title', 'Title'], ['message', 'Message', 'textarea']], columns: ['title', 'message', 'createdAt', 'readAt'] },
};

const humanize = (value) => String(value ?? '—').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const format = (key, value) => {
  if (value == null || value === '') return '—';
  if (key.toLowerCase().includes('salary') || ['budget', 'netPay', 'netSalary', 'allowances', 'bonuses', 'deductions', 'tax'].includes(key)) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
  if (['employee', 'manager'].includes(key) && typeof value === 'object') return value.name || value.email || '—';
  if (key.endsWith('At') || key.endsWith('Date') || key === 'date' || key === 'periodStart' || key === 'periodEnd') return new Date(value).toLocaleDateString();
  if (typeof value === 'object') return value.name || JSON.stringify(value);
  return String(value);
};

export default function ModulePage({ module, title }) {
  const { user } = useAuth();
  const config = definitions[module];
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [relatedEmployees, setRelatedEmployees] = useState([]);
  const [relatedDepartments, setRelatedDepartments] = useState([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const isHr = ['Admin', 'HR Manager'].includes(user?.role);
  const isManager = isHr || user?.role === 'Manager';
  const canManageRecords = isHr || (user?.role === 'Manager' && ['performance', 'goals'].includes(module));
  const canCreate = isHr || (user?.role === 'Manager' && ['attendance', 'performance', 'goals'].includes(module)) ||
    (user?.role === 'Employee' && module === 'leave');
  const employeeQuery = module === 'employees' ? query : '';

  async function load() {
    setBusy(true);
    setError('');
    try {
      const params = { page, limit: 20 };
      if (module === 'attendance' && monthFilter) params.month = monthFilter;
      if (module === 'employees') {
        if (employeeQuery) params.q = employeeQuery;
        if (departmentFilter) params.department = departmentFilter;
        if (roleFilter) params.role = roleFilter;
      }
      const { data } = await api.get(`/${config.endpoint}`, { params });
      const list = data.data?.items || data.data || data[config.endpoint] || data.items || data;
      setRows(Array.isArray(list) ? list : []);
      if (data.pagination) setPageInfo(data.pagination);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }
  useEffect(() => { setPage(1); }, [module]);
  useEffect(() => { load(); }, [module, page, monthFilter, employeeQuery, departmentFilter, roleFilter]);
  useEffect(() => {
    if (module === 'leave' && user?.role === 'Employee') api.get('/leave/balance').then(({ data }) => setLeaveBalance(data.data || data.balance || data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
    else setLeaveBalance(null);
  }, [module, user?.role]);
  useEffect(() => {
    if (user?.role === 'Employee') return;
    Promise.all([
      api.get('/employees', { params: { limit: 100 } }),
      api.get('/departments', { params: { limit: 100 } }),
    ]).then(([employeesResponse, departmentsResponse]) => {
      setRelatedEmployees(employeesResponse.data.data || []);
      setRelatedDepartments(departmentsResponse.data.data || []);
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, [user?.role]);

  const visibleRows = useMemo(() => rows.filter((row) => {
    const department = typeof row.department === 'object' ? row.department?._id : row.department;
    const role = typeof row.user === 'object' ? row.user?.role : row.role;
    return JSON.stringify(row).toLowerCase().includes(query.toLowerCase()) &&
      (!monthFilter || module !== 'attendance' || String(row.date || row.checkIn || '').slice(0, 7) === monthFilter) &&
      (!departmentFilter || String(department) === departmentFilter) && (!roleFilter || role === roleFilter);
  }), [rows, query, monthFilter, module, departmentFilter, roleFilter]);
  const departments = relatedDepartments;
  const roles = [
    { value: 'admin', label: 'Admin' }, { value: 'hr', label: 'HR Manager' },
    { value: 'manager', label: 'Manager' }, { value: 'employee', label: 'Employee' }
  ];
  function openForm(row) {
    setEditing(row || {});
    setForm(row ? Object.fromEntries(config.fields.map(([key]) => [key, key === 'fullName' ? row.fullName : typeof row[key] === 'object' ? row[key]?._id || row[key]?.name || '' : row[key] ?? ''])) : {});
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (module === 'notifications' && !(editing?._id || editing?.id)) await api.post('/notifications/announcement', form);
      else if (editing?._id || editing?.id) await api.put(`/${config.endpoint}/${editing._id || editing.id}`, form);
      else await api.post(`/${config.endpoint}`, form);
      setEditing(null); setNotice(module === 'notifications' ? 'Announcement published.' : `${title} saved successfully.`); await load();
    } catch (saveError) { setError(getErrorMessage(saveError)); }
    finally { setBusy(false); }
  }
  async function remove(row) {
    if (!window.confirm(`Delete this ${title.toLowerCase().replace(/s$/, '')}?`)) return;
    try { await api.delete(`/${config.endpoint}/${row._id || row.id}`); setNotice('Record deleted.'); await load(); }
    catch (deleteError) { setError(getErrorMessage(deleteError)); }
  }
  async function action(row, name) {
    try {
      if (module === 'attendance' && ['check-in', 'check-out'].includes(name)) await api.post(`/${config.endpoint}/${name}`);
      else if (module === 'payroll' && name === 'generate') await api.post('/payroll/generate', { month: new Date().toISOString().slice(0, 7) });
      else await api.patch(`/${config.endpoint}/${row._id || row.id}/${name}`);
      setNotice(name === 'approve' ? 'Request approved.' : name === 'reject' ? 'Request rejected.' : name === 'generate' ? 'Payroll run generated.' : 'Updated successfully.');
      if (module === 'notifications' && name === 'read') window.dispatchEvent(new Event('ems:notifications-changed'));
      await load();
    } catch (actionError) { setError(getErrorMessage(actionError)); }
  }
  async function exportCsv() {
    try {
      const params = module === 'attendance' && monthFilter ? { month: monthFilter } : undefined;
      const response = await api.get(`/reports/${module}/csv`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${module}-report.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (exportError) { setError(getErrorMessage(exportError)); }
  }
  async function downloadPayslip(row) {
    try {
      const { data } = await api.get(`/payroll/${row._id || row.id}/slip`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `payslip-${row.month || 'payroll'}.html`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }
  async function markAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotice('All notifications marked as read.');
      window.dispatchEvent(new Event('ems:notifications-changed'));
      await load();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  return <section className="module-page">  <div className="page-heading"><div><div className="eyebrow">PEOPLE OPERATIONS</div><h1>{title}</h1><p>Manage and review your {title.toLowerCase()} in one place.</p></div><div className="heading-actions">{['employees', 'attendance', 'payroll'].includes(module) && isManager && <button className="button button-secondary" onClick={exportCsv}><Download size={16} /> Export</button>}{module === 'payroll' && isHr && <button className="button button-secondary" onClick={() => action({}, 'generate')}><Plus size={16} /> Generate monthly run</button>}{module === 'notifications' && rows.some((row) => !row.readAt) && <button className="button button-secondary" onClick={markAllRead}>Mark all read</button>}{canCreate && <button className="button button-primary" onClick={() => openForm()}><Plus size={17} /> {module === 'notifications' ? 'New announcement' : `Add ${title.replace(/s$/, '')}`}</button>}{module === 'attendance' && user?.role === 'Employee' && <><button className="button button-primary" onClick={() => action({}, 'check-in')}><Clock3 size={16} /> Check in</button><button className="button button-secondary" onClick={() => action({}, 'check-out')}><Clock3 size={16} /> Check out</button></>}</div></div>
    {module === 'leave' && leaveBalance && <div className="leave-balance-strip"><b>My leave balance</b>{Object.entries(leaveBalance).filter(([key, value]) => typeof value === 'number' && key !== 'year').map(([key, value]) => <span key={key}>{humanize(key)} <strong>{value} days</strong></span>)}</div>}
    {notice && <div className="success-notice"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}
    {error && <div className="inline-notice error-notice">{error}</div>}
    <div className="panel table-panel">
      <div className="table-toolbar">
        <div><b>{visibleRows.length}</b> records <span className="table-updated">· {pageInfo.total} total</span></div>
        <div className="table-filters">
          {module === 'attendance' && <label className="month-filter">Month <input type="month" value={monthFilter} onChange={(event) => { setPage(1); setMonthFilter(event.target.value); }} /></label>}
          {module === 'employees' && <>
            <select className="filter-select" aria-label="Filter by department" value={departmentFilter} onChange={(event) => { setPage(1); setDepartmentFilter(event.target.value); }}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
            </select>
            <select className="filter-select" aria-label="Filter by role" value={roleFilter} onChange={(event) => { setPage(1); setRoleFilter(event.target.value); }}>
              <option value="">All roles</option>
              {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </>}
          <label className="search-box"><Search size={16} /><input placeholder={`Search ${title.toLowerCase()}...`} value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} /></label>
        </div>
      </div>
      <div className="table-scroll"><table><thead><tr>{config.columns.map((column) => <th key={column}>{humanize(column)}</th>)}<th className="actions-heading">Actions</th></tr></thead><tbody>
      {!busy && visibleRows.map((row, index) => <tr key={row._id || row.id || index}>{config.columns.map((column) => <td key={column}>{column === 'status' || column === 'readAt' ? <span className={`status-pill status-${column === 'readAt' ? (row.readAt ? 'read' : 'pending') : String(row[column] || 'pending').toLowerCase().replace(/\s/g, '-')}`}>{column === 'readAt' ? (row.readAt ? 'Read' : 'Unread') : humanize(row[column])}</span> : <span className={column === 'name' || column === 'fullName' ? 'table-name' : ''}>{format(column, row[column] ?? (column === 'employee' ? row.user : undefined))}</span>}</td>)}<td className="row-actions">{module === 'leave' && ['Pending', 'pending'].includes(row.status) && (isManager ? <><button className="table-action approve-action" onClick={() => action(row, 'approve')}>Approve</button><button className="table-action reject-action" onClick={() => action(row, 'reject')}>Reject</button></> : <button className="table-action reject-action" onClick={() => action(row, 'cancel')}>Cancel</button>)}{module === 'payroll' && <><button className="table-action" onClick={() => downloadPayslip(row)}>Payslip</button>{isHr && row.status === 'draft' && <button className="table-action approve-action" onClick={() => action(row, 'process')}>Process</button>}{isHr && row.status === 'processed' && <button className="table-action" onClick={() => action(row, 'pay')}>Mark paid</button>}</>}{module === 'notifications' && !row.readAt && <button className="table-action" onClick={() => action(row, 'read')}>Mark read</button>}{canManageRecords && <><button className="table-action" onClick={() => openForm(row)}>Edit</button><button className="table-action reject-action" onClick={() => remove(row)}>Delete</button></>}</td></tr>)}
      {!busy && visibleRows.length === 0 && <tr><td className="empty-cell" colSpan={config.columns.length + 1}><div className="empty-state"><div><ArrowDownToLine size={20} /></div><b>No {title.toLowerCase()} to show yet</b><span>{query ? 'Try another search term.' : 'Add a record to get started.'}</span>{canCreate && !query && <button className="text-button" onClick={() => openForm()}>Add your first record <Plus size={15} /></button>}</div></td></tr>}
      {busy && <tr><td className="empty-cell" colSpan={config.columns.length + 1}><span className="spinner" /> Loading {title.toLowerCase()}…</td></tr>}
      </tbody></table></div><div className="table-pagination"><span>Showing {pageInfo.total ? (pageInfo.page - 1) * pageInfo.limit + 1 : 0}–{Math.min(pageInfo.page * pageInfo.limit, pageInfo.total)} of {pageInfo.total} records</span><div><button disabled={pageInfo.page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button disabled={pageInfo.page >= pageInfo.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
    </div>
    {editing !== null && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
      <form className="edit-modal" onSubmit={save}>
        <div className="modal-heading"><div><h2>{editing._id || editing.id ? 'Edit' : 'Add'} {title.replace(/s$/, '')}</h2><p>Enter the details below to save this record.</p></div><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="Close"><X size={19} /></button></div>
        <div className="modal-fields">{config.fields.map(([key, label, type, options]) => {
          const choices = type === 'select' ? options.map((option) => ({ id: option, label: option }))
            : type === 'employee' ? relatedEmployees.map((employee) => ({ id: employee._id, label: employee.fullName || employee.name }))
              : type === 'department' ? relatedDepartments.map((department) => ({ id: department._id, label: department.name }))
                : [];
          const optional = ['phone', 'reason', 'feedback', 'comments'].includes(key) ||
            (key === 'employee' && user?.role === 'Employee');
          return <label key={key} className={`modal-field ${type === 'textarea' ? 'field-wide' : ''}`}>
            {label}
            {type === 'textarea'
              ? <textarea value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={!optional} />
              : ['select', 'employee', 'department'].includes(type)
                ? <select value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={!optional}>
                  {(type === 'employee' || type === 'department') && <option value="">Select {label.toLowerCase()}</option>}
                  {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
                </select>
                : <input type={type || 'text'} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={!optional} />}
          </label>;
        })}</div>
        <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></div>
      </form>
    </div>}
  </section>;
}
