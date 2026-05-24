'use client';

import { useState } from 'react';
import { login, signup } from './actions';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
      if (isSignUp) {
        const result = await signup(formData);
        if (result?.error) {
          setErrorMsg(result.error);
        } else if (result?.success) {
          setIsSignUp(false);
          setSuccessMsg(result.success);
        }
      } else {
        const result = await login(formData);
        if (result?.error) {
          setErrorMsg(result.error);
        } else {
          router.refresh();
          router.push('/');
        }
      }
    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-container">
      <div className="login-card">
        <header className="login-header">
          <h1>TuDu</h1>
          <p className="login-subtitle">Your personal space, synchronized.</p>
        </header>

        <form onSubmit={handleSubmit} className="login-form">
          {errorMsg && <div className="auth-alert alert-danger">{errorMsg}</div>}
          {successMsg && <div className="auth-alert alert-success">{successMsg}</div>}

          <div className="auth-input-group">
            <label htmlFor="username">Username (用户名)</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username (输入用户名)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              maxLength={15}
            />
          </div>

          <div className="auth-input-group">
            <label htmlFor="password">Password (密码)</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={isLoading}>
            {isLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <footer className="login-footer">
          <button
            type="button"
            className="toggle-auth-mode-btn"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            disabled={isLoading}
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </footer>
      </div>
    </main>
  );
}
