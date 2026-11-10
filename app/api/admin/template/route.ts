import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {adminFrom,sameOrigin} from '@/lib/auth';
import {dataDir,getSetting,setSetting} from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest) {
  if(!sameOrigin(req)||!adminFrom(req))return NextResponse.json({error:'Admin only'},{status:403});
  const body=await req.formData().catch(()=>null);
  const file=body?.get('image');
  if(!(file instanceof File)||file.size>10*1024*1024||file.size<500)
    return NextResponse.json({error:'Upload a JPG or PNG under 10MB'},{status:400});
  const buffer=Buffer.from(await file.arrayBuffer());
  const jpg=buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!jpg&&!png)return NextResponse.json({error:'Only valid JPG/PNG images are accepted'},{status:415});
  const newName=`template-${crypto.randomBytes(8).toString('hex')}.${png?'png':'jpg'}`;
  await fs.mkdir(dataDir(),{recursive:true,mode:0o700});
  await fs.writeFile(path.join(dataDir(),newName),buffer,{mode:0o600});
  const old=getSetting('template_file');
  setSetting('template_file',newName);setSetting('template_mime',png?'image/png':'image/jpeg');
  if(old&&old!==newName)await fs.unlink(path.join(dataDir(),path.basename(old))).catch(()=>{});
  return NextResponse.json({ok:true});
}
