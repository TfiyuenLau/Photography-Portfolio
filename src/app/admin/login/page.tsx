'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.message || 'Invalid password');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col justify-center items-center px-6">
      <div className="w-full max-w-xs space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black">
            Studio
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Enter password to access local studio
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-0 py-2 border-b border-gray-300 text-sm focus:outline-none focus:border-black bg-transparent"
            autoFocus
            required
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-black transition-colors"
            >
              &larr; Back
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-black hover:bg-gray-800 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
            >
              {loading ? '...' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
