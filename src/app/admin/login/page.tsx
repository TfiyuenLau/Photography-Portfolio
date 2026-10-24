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
        setError(data.message || '密码错误');
      }
    } catch {
      setError('网络请求异常，请确认本地开发服务正在运行');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="text-xs uppercase tracking-widest text-red-700 font-semibold">
              PORTFOLIO STUDIO
            </span>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">
              作品集管理后台登录
            </h1>
          </div>
          <div className="size-3 rounded-full bg-red-700 animate-pulse" />
        </div>

        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          此工作台受管理员密码保护。如果您尚未在{' '}
          <code className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700">
            .env.local
          </code>{' '}
          中自定义 <code className="text-gray-700">ADMIN_PASSWORD</code>
          ，初始默认密码为 <code className="font-mono text-red-700">admin123</code>。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-password"
              className="block text-xs font-medium text-gray-600 mb-1.5"
            >
              管理员密码 / Admin Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入管理员密码..."
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-700"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gray-900 hover:bg-red-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '正在验证...' : '进入作品集工作台 →'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
          <span>本地安全工作台 · 静态托管零风险</span>
          <Link href="/" className="hover:text-gray-700">
            ← 返回前台首页
          </Link>
        </div>
      </div>
    </main>
  );
}
