import { NextRequest, NextResponse } from 'next/server';
import {
  computeSessionToken,
  getAdminCookieName,
  getAdminPassword,
  verifySessionToken
} from '@/lib/admin/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(getAdminCookieName())?.value;
  const authenticated = await verifySessionToken(token);
  return NextResponse.json({ authenticated });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password || password !== getAdminPassword()) {
      return NextResponse.json(
        { success: false, message: '管理员密码不正确，请重试' },
        { status: 401 }
      );
    }

    const token = await computeSessionToken(password);
    const res = NextResponse.json({ success: true });
    res.cookies.set(getAdminCookieName(), token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });
    return res;
  } catch {
    return NextResponse.json(
      { success: false, message: '登录请求解析失败' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(getAdminCookieName());
  return res;
}
