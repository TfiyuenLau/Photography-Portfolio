import { exec } from 'child_process';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const [{ stdout: statusOut }, { stdout: logOut }] = await Promise.all([
      execAsync('git status --short'),
      execAsync('git log -n 6 --pretty=format:"%h|%s|%cr"')
    ]);

    const changes = statusOut
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const commits = logOut
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(line => {
        const [hash, subject, time] = line.split('|');
        return { hash, subject, time };
      });

    return NextResponse.json({
      success: true,
      changes,
      commits
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || '读取 Git 状态失败' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commitMsg = (
      body.message || `content: update portfolio (${new Date().toLocaleDateString('zh-CN')})`
    ).replace(/"/g, '\\"');

    await execAsync('git add src/data/ public/');
    const { stdout: statusOut } = await execAsync('git status --porcelain');
    if (!statusOut.trim()) {
      return NextResponse.json({
        success: true,
        message: '当前没有新的内容变更需要提交'
      });
    }

    await execAsync(`git commit -m "${commitMsg}"`);

    return NextResponse.json({
      success: true,
      message: `已成功提交 Git 版本：${commitMsg}`
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Git 提交失败' },
      { status: 500 }
    );
  }
}
