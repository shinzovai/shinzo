import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {adminFrom,sameOrigin} from '@/lib/auth';
import {setSetting} from '@/lib/db';
import {safeConfig} from '@/lib/types';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  if(!sameOrigin(req)||!adminFrom(req))return NextResponse.json({error:'Admin only'},{status:403});
  const body=await req.json().catch(()=>null);
  const config=safeConfig(body);
  setSetting('template_config',JSON.stringify(config));
  return NextResponse.json({ok:true,config});
}
