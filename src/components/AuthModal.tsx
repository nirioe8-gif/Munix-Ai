import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, User, X } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import { UserProfile } from '../types/studio';

interface AuthModalProps {
  open: boolean;
  adminEmailHint: string | null;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, adminEmailHint, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await apiFetch<{
        token: string;
        user: UserProfile;
        verificationPending?: boolean;
        verificationToken?: string | null;
      }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      });
      setStoredToken(res.token);
      onSuccess(res.user);
      if (res.verificationPending && res.verificationToken) {
        setVerifyToken(res.verificationToken);
        setInfo('Account created! Verify your email using the confirmation code below, or close to enter the studio.');
        setMode('verify');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
      });
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ message: string; resetTokenPreview?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setInfo(
        res.resetTokenPreview
          ? `${res.message} Reset code: ${res.resetTokenPreview}`
          : res.message
      );
      if (res.resetTokenPreview) setResetToken(res.resetTokenPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, resetToken, newPassword }),
      });
      setInfo('Password updated permanently. You can now sign in.');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1210] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {mode === 'login'
                ? 'Sign In to MUNIX Studio'
                : mode === 'signup'
                  ? 'Create Creator Account'
                  : mode === 'verify'
                    ? 'Verify Email Address'
                    : 'Reset Password'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">Private projects, cloud audio saves & studio sync</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex gap-1 rounded-lg bg-black/50 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); setInfo(null); }}
            className={`flex-1 min-h-[40px] rounded-md text-xs font-medium transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
            className={`flex-1 min-h-[40px] rounded-md text-xs font-medium transition-colors cursor-pointer ${
              mode === 'signup' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
          <button
            type="button"
            onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
            className={`flex-1 min-h-[40px] rounded-md text-xs font-medium transition-colors cursor-pointer ${
              mode === 'forgot' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Forgot Password
          </button>
        </div>

        {adminEmailHint && mode === 'signup' && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Initial DJ MUNIX Admin setup: Registering with the configured owner email (<strong className="text-white">{adminEmailHint}</strong>) initializes the verified Administrator account securely.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
            {error}
          </div>
        )}
        {info && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-200 break-words">
            {info}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">DJ / Producer Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. DJ MUNIX"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 pl-9 pr-3 text-sm text-white placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold transition-colors cursor-pointer"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerifyEmail} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Verification Code</label>
              <input
                type="text"
                required
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 px-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium cursor-pointer"
              >
                Confirm Email
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-lg border border-white/10 text-neutral-300 hover:text-white text-sm cursor-pointer"
              >
                Skip for Now
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <div className="mt-5 space-y-5">
            <form onSubmit={handleRequestReset} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Registered Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-sm font-medium cursor-pointer"
              >
                Generate Reset Code
              </button>
            </form>

            <form onSubmit={handleCompleteReset} className="space-y-3 border-t border-white/10 pt-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Reset Code</label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset code"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 px-3 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">New Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/50 px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold cursor-pointer"
              >
                Save New Password
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
