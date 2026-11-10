import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { COOKIE, sameOrigin } from '@/lib/auth';
import { removeSession } from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  if(!sameOrigin(req)) return NextResponse.json({error:'Origin not allowed'},{status:403});
  const token=req.cookies.get(COOKIE)?.value;
  if(token) removeSession(token);
  const res=NextResponse.json({ok:true});
  res.cookies.delete(COOKIE);
  return res;
}
