import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';
import {sameOrigin,userFrom} from '@/lib/auth';
import {createDemoPdf} from '@/lib/pdf';
import {recordExport} from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return NextResponse.json({error:'Origin not allowed'},{status:403});
  const user=userFrom(req);
  if(!user)return NextResponse.json({error:'Sign in first or access expired'},{status:401});
  if(user.role==='editor' && user.quota>=0 && user.used>=user.quota)
    return NextResponse.json({error:'PDF quota reached; ask Shinzo admin for access'},{status:403});
  const body=await req.json().catch(()=>null);
  if(!body||['registration','file','date'].some(k=>typeof body[k]!=='string'||body[k].length>70)||
    (body.logo!==null && body.logo!==undefined && (typeof body.logo!=='string'||body.logo.length>7_000_000)))
    return NextResponse.json({error:'Invalid form values'},{status:400});
  try{
    const bytes=await createDemoPdf({registration:body.registration,file:body.file,date:body.date,
      logo:body.logo||null,markLabel:String(body.markLabel||'HAYA GAMING')});
    recordExport(user,String(body.markLabel||'HAYA GAMING').slice(0,70));
    return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="shinzo-demo-certificate.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
