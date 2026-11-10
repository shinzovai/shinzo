import type {NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {adminFrom,sameOrigin} from '@/lib/auth';
import {db,findUserById,listEditors} from '@/lib/db';
export const runtime='nodejs';
export async function PATCH(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
  if(!sameOrigin(req)||!adminFrom(req))return NextResponse.json({error:'Admin only'},{status:403});
  const {id}=await ctx.params; const user=findUserById(Number(id));
  if(!user||user.role!=='editor')return NextResponse.json({error:'Editor missing'},{status:404});
  const b=await req.json().catch(()=>({}));
  try{
    if(typeof b.active==='boolean')db().prepare('UPDATE users SET active=? WHERE id=?').run(b.active?1:0,user.id);
    if(b.quota!==undefined){const q=Number(b.quota);if(!Number.isSafeInteger(q)||q<0||q>100000)throw new Error('Invalid quota');db().prepare('UPDATE users SET quota=? WHERE id=?').run(q,user.id);}
    if(b.expiresAt!==undefined){const date=b.expiresAt===null?null:String(b.expiresAt);if(date!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Invalid date');db().prepare('UPDATE users SET expires_at=? WHERE id=?').run(date,user.id);}
    if(b.password!==undefined){const pass=String(b.password);if(pass.length<10||pass.length>128)throw new Error('Password must be at least 10 characters');db().prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pass,12),user.id);db().prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);}
    if(b.resetUsed===true)db().prepare('UPDATE users SET used=0 WHERE id=?').run(user.id);
  }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
  return NextResponse.json({ok:true,users:listEditors()});
}
