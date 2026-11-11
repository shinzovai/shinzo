import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { COOKIE, sameOrigin } from '@/lib/auth';
import { createSession, findUser, verifyEditorDevice } from '@/lib/db';
export const runtime = 'nodejs';
const attempts = new Map<string,{count:number,until:number}>();
export async function POST(req:NextRequest) {
  if(!sameOrigin(req)) return NextResponse.json({error:'Origin not allowed'},{status:403});
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now=Date.now(); const a=attempts.get(ip);
  if (a && a.until > now && a.count >= 8) return NextResponse.json({error:'Too many attempts; try again later'},{status:429});
  const {username,password}=await req.json().catch(()=>({username:'',password:''}));
  const user=typeof username==='string' ? findUser(username.trim()) : undefined;
  const valid=typeof password==='string' && user && bcrypt.compareSync(password,user.password_hash);
  const expired=user?.expires_at && user.expires_at < new Date().toISOString().slice(0,10);
  if(!valid || !user?.active || expired) {
    const prev = a && a.until>now ? a.count : 0;
    attempts.set(ip,{count:prev+1,until:now+15*60_000});
    return NextResponse.json({error:'Invalid username, password, or access expired'},{status:401});
  }
  attempts.delete(ip);
    const existingDeviceToken = req.cookies.get('shinzo_device')?.value;

  const deviceToken =
    existingDeviceToken && /^[a-f0-9]{64}$/.test(existingDeviceToken)
      ? existingDeviceToken
      : randomBytes(32).toString('hex');
  
  // Verify the editor's registered device before creating a session.
  if (user.role === 'editor') {

    if (!deviceToken || !/^[a-f0-9]{64}$/.test(deviceToken)) {
      return NextResponse.json(
        { error: 'Device registration required' },
        { status: 403 }
      );
    }

    const browser = (req.headers.get('user-agent') || 'Unknown').slice(0, 500);

    const result = verifyEditorDevice(
      user.id,
      deviceToken,
      browser,
      ip
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.reason === 'DEVICE_LIMIT_EXCEEDED'
            ? 'Account blocked: device limit exceeded. Contact admin.'
            : 'Account blocked. Contact admin.'
        },
        { status: 403 }
      );
    }
  }

  const res=NextResponse.json({ok:true});
  res.cookies.set(COOKIE,createSession(user.id),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*7});
    if (user.role === 'editor') {
    res.cookies.set('shinzo_device', deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 365
    });
  }
  return res;
}
