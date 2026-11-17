import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Headphones, KeyRound, LogOut, Shield, User } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { UserProfile } from '../types/studio';

interface SettingsPageProps {
  user: UserProfile | null;
  onRequireAuth: () => void;
  onUserUpdated: (user: UserProfile | null) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, onRequireAuth, onUserUpdated }) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio);
    }
  }, [user]);

  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => setAudioOutputs(list.filter((d) => d.kind === 'audiooutput')))
        .catch(() => {});
    }
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ displayName, bio }),
      });
      onUserUpdated(res.user);
      setMsg('Profile updated successfully.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Update failed.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    setErr(null);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const res = await apiFetch<{ user: UserProfile }>('/api/profile/avatar', {
        method: 'POST',
        body: form,
      });
      onUserUpdated(res.user);
      setMsg('Profile photo updated.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Photo upload failed.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (newPassword !== confirmPassword) {
      setErr('New passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg('Password changed permanently and recorded.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Password change failed.');
    } finally {
      setSavingPw(false);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
    onUserUpdated(null);
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings & Account Security</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Manage your profile, password, audio devices, and Progressive Web App installation
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">{err}</div>
      )}

      {!user ? (
        <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-8 text-center space-y-4">
          <p className="text-base font-semibold text-white">You are browsing as a Guest</p>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Sign in or create an account to save private studio projects, customize your profile, and manage your password.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="min-h-[44px] px-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold cursor-pointer"
          >
            Sign In / Sign Up
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Profile Card */}
          <form onSubmit={handleSaveProfile} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <span>Profile</span>
              </h2>
              <span className="text-xs font-mono text-amber-400 capitalize flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                {user.role}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border border-white/15 bg-black/50 flex items-center justify-center shrink-0">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-neutral-500" />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-white cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>Change Photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
                </label>
                <p className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${user.emailVerified ? 'text-emerald-400' : 'text-neutral-500'}`} />
                  <span>{user.email} · {user.emailVerified ? 'Verified' : 'Unverified'}</span>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Studio Bio</label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 p-3 text-sm text-white"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="min-h-[42px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[42px] px-4 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-xs text-red-200 flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </form>

          {/* Change Password */}
          <form onSubmit={handleChangePassword} className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>Change Password</span>
            </h2>
            <p className="text-xs text-neutral-400">
              Password changes are permanent upon verification of your current password.
            </p>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-300 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
              />
            </div>
            <button
              type="submit"
              disabled={savingPw}
              className="w-full min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer"
            >
              {savingPw ? 'Updating Password...' : 'Update Password Permanently'}
            </button>
          </form>
        </div>
      )}

      {/* PWA & Audio Output Devices */}
      <div className="rounded-2xl border border-white/10 bg-[#0e1311] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Headphones className="w-4 h-4 text-emerald-400" />
            <span>Device Audio & Installable App</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Detected audio outputs: {audioOutputs.length > 0 ? audioOutputs.map((d) => d.label || 'System Output').join(', ') : 'Default System Audio'}
          </p>
        </div>
        <PWAInstallButton variant="hero" />
      </div>
    </div>
  );
};
