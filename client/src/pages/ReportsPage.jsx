import { Printer, Download, FileSpreadsheet } from 'lucide-react';
import { api, getErrorMessage } from '../services/api.js';
import { useState } from 'react';

const reports = [
  { key: 'employees', title: 'Employee roster', description: 'A complete directory of your people, roles, and departments.' },
  { key: 'attendance', title: 'Attendance report', description: 'Check-in, check-out, and attendance summaries by date.' },
  { key: 'payroll', title: 'Payroll report', description: 'Monthly salary, deductions, and payment status.' },
];

export default function ReportsPage() {
  const [error, setError] = useState('');
  async function download(key) {
    setError('');
    try {
      const { data } = await api.get(`/reports/${key}/csv`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${key}-report.csv`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }
  return <section className="reports-page"><div className="page-heading"><div><div className="eyebrow">PEOPLE OPERATIONS</div><h1>Reports</h1><p>Export key workforce data for your team.</p></div><button className="button button-secondary" onClick={() => window.print()}><Printer size={16} /> Print page</button></div>
    {error && <div className="inline-notice error-notice">{error}</div>}
    <div className="reports-grid">{reports.map((report) => <article className="panel report-card" key={report.key}><div className="report-icon"><FileSpreadsheet size={20} /></div><h2>{report.title}</h2><p>{report.description}</p><button className="button button-secondary" onClick={() => download(report.key)}><Download size={15} /> Download CSV</button></article>)}</div>
  </section>;
}
