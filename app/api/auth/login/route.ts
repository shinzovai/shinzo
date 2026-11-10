import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { COOKIE, sameOrigin } from '@/lib/auth';
import { createSession, findUser } from '@/lib/db';
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
  const res=NextResponse.json({ok:true});
  res.cookies.set(COOKIE,createSession(user.id),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*7});
  return res;
}
