import type {NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { userFrom } from '@/lib/auth';
import { dataDir, getSetting } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
  if(!userFrom(req)) return NextResponse.json({error:'Unauthorized'},{status:401});
  const name=getSetting('template_file'); const mime=getSetting('template_mime');
  if(!name || !mime)return NextResponse.json({error:'Upload a template first'},{status:404});
  try{
    const bytes=await fs.readFile(path.join(dataDir(),path.basename(name)));
    return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return NextResponse.json({error:'Template image missing'},{status:404});}
}
