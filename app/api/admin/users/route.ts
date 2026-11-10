import type {NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {adminFrom,sameOrigin} from '@/lib/auth';
import {db,listEditors} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
  if(!adminFrom(req))return NextResponse.json({error:'Admin only'},{status:403});
  return NextResponse.json({users:listEditors()},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
  if(!sameOrigin(req) || !adminFrom(req))return NextResponse.json({error:'Admin only'},{status:403});
  const b=await req.json().catch(()=>({}));
  const username=String(b.username||'').trim().toLowerCase();
  const password=String(b.password||'');
  const quota=Number(b.quota ?? 10);
  const expiresAt=b.expiresAt?String(b.expiresAt):null;
  if(!/^[a-z0-9._-]{3,32}$/.test(username)||password.length<10||password.length>128||
    !Number.isSafeInteger(quota)||quota<0||quota>100000||
    (expiresAt!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)))
    return NextResponse.json({error:'Username: 3-32 characters. Password: 10+ characters. Set a valid quota/date.'},{status:400});
  try {
    db().prepare(`INSERT INTO users(username,password_hash,role,active,quota,created_at,expires_at)
      VALUES(?,?,'editor',1,?,?,?)`).run(username,bcrypt.hashSync(password,12),quota,new Date().toISOString(),expiresAt);
    return NextResponse.json({ok:true,users:listEditors()});
  }catch{return NextResponse.json({error:'Username already exists'},{status:409});}
}
