import { NextRequest, NextResponse } from 'next/server';
import { getAdminCookieName, verifySessionToken } from '@/lib/admin/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/auth')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(getAdminCookieName())?.value;
  const isValid = await verifySessionToken(token);

  if (!isValid) {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        { success: false, message: '未授权访问，请先登录管理员后台' },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/admin/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*']
};
