import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../services/api.js';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@orbitpeople.com', password: 'Admin123!' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(form);
      navigate('/dashboard', { replace: true });
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-showcase"><div className="login-brand"><span className="brand-mark">o</span> orbit<span>people</span></div><div className="showcase-copy"><span className="eyebrow">PEOPLE FIRST. ALWAYS.</span><h1>Build a workplace<br />where everyone<br /><em>can thrive.</em></h1><p>The tools to bring your people, processes, and purpose together — all in one place.</p><div className="showcase-foot"><div className="avatar-stack"><span>AM</span><span>JR</span><span>SK</span><b>+12</b></div><span>Trusted by teams who put<br />people at the heart of work.</span></div></div><div className="showcase-orbit orbit-one" /><div className="showcase-orbit orbit-two" /></section>
      <section className="login-panel"><form className="login-form" onSubmit={submit}><div className="login-mobile-brand"><span className="brand-mark">o</span> orbit<span>people</span></div><span className="eyebrow">WELCOME BACK</span><h2>Sign in to your<br />workspace</h2><p className="login-subtitle">Enter your details below to continue.</p>
        <label className="field-label" htmlFor="email">Work email</label><div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="you@company.com" /></div>
        <div className="password-label"><label className="field-label" htmlFor="password">Password</label><a href="#help" onClick={(e) => e.preventDefault()}>Forgot password?</a></div><div className="input-wrap"><LockKeyhole size={18} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="Enter your password" /><button type="button" className="password-toggle" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} {!busy && <ArrowRight size={17} />}</button>
        <div className="secure-note"><Fingerprint size={16} /> Protected by enterprise-grade security</div><div className="demo-hint">Demo account: <b>admin@orbitpeople.com</b> · <b>Admin123!</b></div></form><div className="login-copyright">© 2025 Orbit People <span>·</span> Privacy <span>·</span> Terms</div></section>
    </main>
  );
}
