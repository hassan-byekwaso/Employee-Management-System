import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import AppShell from './components/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ModulePage from './pages/ModulePage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><span className="spinner" />Loading your workspace</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

const managerRoles = ['Admin', 'HR Manager', 'Manager'];
const modules = [
  ['employees', 'Employees'], ['departments', 'Departments', managerRoles], ['attendance', 'Attendance'],
  ['leave', 'Leave'], ['payroll', 'Payroll'], ['performance', 'Performance'], ['goals', 'Goals'],
  ['notifications', 'Notifications'],
];

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reports" element={<Protected roles={managerRoles}><ReportsPage /></Protected>} />
        {modules.map(([path, title, roles]) => <Route key={path} path={`/${path}`} element={<Protected roles={roles}><ModulePage module={path} title={title} /></Protected>} />)}
      </Route>
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
