import React, { useState } from 'react';
import { api } from '../api';
import { X, Shield, User, KeyRound } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [email, setEmail] = useState('customer@shopcloud.dev');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login({ email, password });
      localStorage.setItem('shopcloud_token', res.accessToken);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSwitch = (role: 'ADMIN' | 'CUSTOMER') => {
    if (role === 'ADMIN') {
      setEmail('admin@shopcloud.dev');
      setPassword('Password123!');
    } else {
      setEmail('customer@shopcloud.dev');
      setPassword('Password123!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-slate-900">Sign In to ShopCloud</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {/* Quick Demo Switcher */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-semibold text-slate-600 block">
              Demo Portfolio Credentials:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickSwitch('CUSTOMER')}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-700 transition"
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Customer</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickSwitch('ADMIN')}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-700 transition"
              >
                <Shield className="w-3.5 h-3.5 text-purple-600" />
                <span>Super Admin</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-md shadow-blue-500/25 transition active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
