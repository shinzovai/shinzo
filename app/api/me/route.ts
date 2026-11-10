import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { userFrom } from '@/lib/auth';
import { dashboardTotals, getSetting, publicUser } from '@/lib/db';
import { safeConfig } from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  const user=userFrom(req);
  if(!user)return NextResponse.json({authenticated:false},{status:401});
  const rawConf=getSetting('template_config');
  return NextResponse.json({authenticated:true,user:publicUser(user),templateExists:!!getSetting('template_file'),
    config:safeConfig(rawConf?JSON.parse(rawConf):null), totals:user.role==='admin'?dashboardTotals():null},
    {headers:{'Cache-Control':'no-store'}});
}
