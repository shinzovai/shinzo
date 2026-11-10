'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfigKey, TemplateConfig, UserPublic } from '@/lib/types';
import { DEFAULT_CONFIG } from '@/lib/types';

type MeData={authenticated:true;user:UserPublic;templateExists:boolean;config:TemplateConfig;totals:{users:number;active:number;exports:number}|null};
type Tab='studio'|'access'|'template';
type EditorFields={registration:string;file:string;date:string;markLabel:string};
const slotNames:Record<ConfigKey,string>={registration:'Registration number',file:'File number',date:'Registration date',logo:'Logo image'};
const MONTHS = [
  ['janv', 'Jan'],
  ['févr', 'Feb'],
  ['mars', 'Mar'],
  ['avr', 'Apr'],
  ['mai', 'May'],
  ['juin', 'Jun'],
  ['juill', 'Jul'],
  ['août', 'Aug'],
  ['sept', 'Sept'],
  ['oct', 'Oct'],
  ['nov', 'Nov'],
  ['déc', 'Dec'],
];

const ENGLISH_MONTHS = [
  'january', 'february', 'march', 'april',
  'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'
];

function formatBilingualDate(input: string): string {
  const match = input.trim().match(
    /^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/
  );

  if (!match) return input;

  const [, day, month, year] = match;
  const index = ENGLISH_MONTHS.findIndex(
    m => m === month.toLowerCase() ||
         m.slice(0, 3) === month.toLowerCase()
  );

  if (index === -1) return input;

  const [fr, en] = MONTHS[index];
  return `${day} ${fr}/${en} ${year}`;
}

const api=async(path:string,options?:RequestInit)=>{
  const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  if(!res.ok){const e=await res.json().catch(()=>({error:'Request failed'}));throw new Error(e.error||'Request failed');}
  return res;
};
const json=(obj:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});

export default function Home(){
  const [me,setMe]=useState<MeData|null>(null);
  const [loading,setLoading]=useState(true);
  const [loginName,setLoginName]=useState('shinzo');
  const [loginPass,setLoginPass]=useState('');
  const [tab,setTab]=useState<Tab>('studio');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [users,setUsers]=useState<UserPublic[]>([]);
  const [newName,setNewName]=useState('');
  const [newPass,setNewPass]=useState('');
  const [newQuota,setNewQuota]=useState(10);
  const [newExpiry,setNewExpiry]=useState('');
  const [fields,setFields]=useState<EditorFields>({registration:'TMA1,085,925',file:'1886778',date:'22 oct/Oct 2020',markLabel:'HAYA GAMING'});
  const [logo,setLogo]=useState<string|null>(null);
  const [config,setConfig]=useState<TemplateConfig>(structuredClone(DEFAULT_CONFIG));
  const [selected,setSelected]=useState<ConfigKey>('registration');
  const [imageVersion,setImageVersion]=useState(0);
  const pageRef=useRef<HTMLDivElement|null>(null);
  const logoInputRef=useRef<HTMLInputElement|null>(null);
  const isAdmin=me?.user.role==='admin';

  const refresh=useCallback(async()=>{
    const res=await fetch('/api/me',{cache:'no-store'});
    if(res.ok){const data=await res.json() as MeData;setMe(data);setConfig(data.config);}
    else setMe(null);
    setLoading(false);
  },[]);
  const refreshUsers=useCallback(async()=>{
    try{const response=await api('/api/admin/users');setUsers((await response.json()).users);}catch(e){setError((e as Error).message);}
  },[]);
  useEffect(()=>{refresh()},[refresh]);
  useEffect(()=>{if(me?.user.role==='admin')refreshUsers()},[me?.user.role,refreshUsers]);
  const hasTemplate=!!me?.templateExists;
  const remaining=me?.user.role==='admin'?Infinity:Math.max(0,(me?.user.quota||0)-(me?.user.used||0));
  const showError=(e:unknown)=>{setError((e as Error).message||'Something went wrong');setNotice('');};
  const notify=(text:string)=>{setError('');setNotice(text);};
  const onLogin=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    try{await api('/api/auth/login',json({username:loginName,password:loginPass}));setLoginPass('');await refresh();notify('Signed in successfully');}
    catch(e){showError(e);}finally{setBusy(false);}
  };
  const logout=async()=>{setBusy(true);try{await api('/api/auth/logout',{method:'POST'});setMe(null);setTab('studio');setNotice('');setError('');}catch(e){showError(e);}finally{setBusy(false);}};
  const uploadTemplate=async(file?:File)=>{
    if(!file)return;setBusy(true);
    try{if(file.size>10*1024*1024)throw new Error('Image must be under 10 MB');
      const form=new FormData();form.set('image',file);await api('/api/admin/template',{method:'POST',body:form});
      setImageVersion(v=>v+1);await refresh();notify('A4 background template uploaded');
    }catch(e){showError(e);}finally{setBusy(false);}
  };
  const uploadLogo=async(file?:File)=>{
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>4*1024*1024){setError('Logo must be PNG/JPG under 4MB');return;}
    const reader=new FileReader();reader.onload=()=>{setLogo(String(reader.result));notify('New logo attached to preview')};reader.readAsDataURL(file);
  };
  const savePositions=async()=>{
    setBusy(true);try{await api('/api/admin/template-config',json(config));await refresh();notify('Field positions saved for all editors');}
    catch(e){showError(e);}finally{setBusy(false);}
  };
  const createUser=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);
    try{await api('/api/admin/users',json({username:newName,password:newPass,quota:newQuota,expiresAt:newExpiry||null}));
      setNewName('');setNewPass('');setNewQuota(10);setNewExpiry('');await refreshUsers();await refresh();notify('Editor account created');
    }catch(e){showError(e);}finally{setBusy(false);}
  };
  const patchUser=async(id:number,patch:Record<string,unknown>)=>{
    setBusy(true);
    try{await api(`/api/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
      await refreshUsers();await refresh();notify('Editor access updated');
    }catch(e){showError(e);}finally{setBusy(false);}
  };
  const downloadPdf=async()=>{
    if(!hasTemplate){setError('Ask admin to upload a JPG/PNG template first');return;}
    if(remaining<=0){setError('You have reached your PDF quota');return;}
    setBusy(true);setError('');
    try{
      const res=await api('/api/export',json({...fields,logo}));
      const blob=await res.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='CCPIA-Canadian-Trademark-Doc.pdf';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),5000);
      await refresh();notify('Sample PDF generated and downloaded');
    }catch(e){showError(e);}finally{setBusy(false);}
  };
  const clickPage=(e:React.MouseEvent<HTMLDivElement>)=>{
    if(!(isAdmin && tab==='template'))return;
    const bounds=pageRef.current?.getBoundingClientRect();if(!bounds)return;
    const x=(e.clientX-bounds.left)/bounds.width*100;
    const y=(e.clientY-bounds.top)/bounds.height*100;
    setConfig(c=>({...c,[selected]:{...c[selected],x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y))}}));
  };
  const updateSlot=(key:ConfigKey,attr:'x'|'y'|'width'|'height'|'fontSize',value:number)=>{
    setConfig(c=>({...c,[key]:{...c[key],[attr]:Math.max(0,Math.min(attr==='fontSize'?32:100,value))}}));
  };
  const cards=useMemo(()=>[
    {label:'Editor accounts',value:me?.totals?.users ?? 0,sub:'Accounts created'},
    {label:'Active editors',value:me?.totals?.active ?? 0,sub:'Currently allowed'},
    {label:'PDF exports',value:me?.totals?.exports ?? 0,sub:'Recorded downloads'},
  ],[me?.totals]);

  if(loading)return <div className="fullscreen"><div className="spinner"/>Loading Shinzo Panel...</div>;
  if(!me)return <main className="login-bg"><section className="login-card">
    <div className="logo-square">S<span>.</span></div>
    <p className="eyebrow">PRIVATE WORKSPACE</p><h1>Welcome to<br/><span>Shinzo Panel</span></h1>
    <p className="muted">Admin & Editor access for watermarked document previews.</p>
    <form onSubmit={onLogin} className="login-form">
      <label>Username<input autoComplete="username" value={loginName} onChange={e=>setLoginName(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} required /></label>
      <button className="primary full" disabled={busy} type="submit">{busy?'Signing in...':'Sign in to workspace'} <span>→</span></button>
    </form>
    {error&&<div className="alert danger">{error}</div>}
    <div className="login-bottom">Admin username: <b>shinzo</b> · Password is set in <code>.env.local</code></div>
  </section></main>;

  return <div className="dashboard">
    <aside className="sidebar">
      <div className="brandline"><div className="brand-mark">S<span>.</span></div><div><div className="brand-name">SHINZO</div><div className="brand-desc">DOCUMENT STUDIO</div></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav">
        <button className={tab==='studio'?'active':''} onClick={()=>setTab('studio')}><span>▦</span> Certificate editor</button>
        {isAdmin&&<button className={tab==='template'?'active':''} onClick={()=>setTab('template')}><span>◈</span> Template manager</button>}
        {isAdmin&&<button className={tab==='access'?'active':''} onClick={()=>setTab('access')}><span>♙</span> Access management</button>}
      </nav>
      <div className="sidebar-bottom"><div className="role-card"><div className="avatar">{me.user.username.slice(0,1).toUpperCase()}</div><div><b>{me.user.username}</b><div className="muted small">{isAdmin?'Administrator':'Editor account'}</div></div></div>
        <button className="signout" onClick={logout} disabled={busy}>↳ &nbsp; Log out</button></div>
    </aside>
    <main className="main">
      <div className="topbar"><div className="breadcrumb">SHINZO <span>/</span> {tab==='studio'?'Certificate editor':tab==='access'?'Access management':'Template manager'}</div><div className="top-actions"><span className="role-pill">{isAdmin?'● Admin mode':'● Editor mode'}</span><span className="accountname">{me.user.username}</span></div></div>
      <div className="content">
        {error&&<div className="alert danger"><b>Notice:</b> {error}<button onClick={()=>setError('')}>×</button></div>}
        {notice&&<div className="alert ok">✓ {notice}<button onClick={()=>setNotice('')}>×</button></div>}

        {tab==='access' && isAdmin ? <>
          <div className="heading"><div><p className="eyebrow">SHINZO / ADMINISTRATION</p><h1>Access management</h1><p className="muted">Invite editors, set their PDF allowance, and revoke access at any time.</p></div></div>
          <div className="stats">{cards.map(c=><div className="stat" key={c.label}><span className="muted">{c.label}</span><strong>{c.value}</strong><span className="small muted">{c.sub}</span></div>)}</div>
          <div className="panel"><div className="panel-title"><h2>Create editor account</h2><span className="mini-tag">ADMIN ONLY</span></div>
            <form className="create-grid" onSubmit={createUser}>
              <label>Editor username<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="editor01" minLength={3} required /></label>
              <label>Initial password<input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="At least 10 characters" minLength={10} required /></label>
              <label>PDF quota<input type="number" min={0} max={100000} value={newQuota} onChange={e=>setNewQuota(Number(e.target.value))}/></label>
              <label>Expiry (optional)<input type="date" value={newExpiry} onChange={e=>setNewExpiry(e.target.value)} /></label>
              <button className="primary" type="submit" disabled={busy}>+ Create editor</button>
            </form>
          </div>
          <div className="panel"><div className="panel-title"><h2>Editor accounts</h2><span className="muted small">{users.length} accounts</span></div>
            {users.length===0?<div className="empty-state">No editors yet. Create one above to grant access.</div>:<div className="user-grid">
              {users.map(u=><div className="user-card" key={u.id}>
                <div className="user-card-top"><div className="avatar">{u.username.charAt(0).toUpperCase()}</div><div><b>{u.username}</b><div className="muted small">{u.used} / {u.quota} PDFs generated · {u.expiresAt || 'No expiry'}</div></div><span className={u.active?'status active':'status disabled'}>{u.active?'Active':'Disabled'}</span></div>
                <div className="user-actions"><button disabled={busy} onClick={()=>patchUser(u.id,{active:!u.active})}>{u.active?'Disable':'Enable'}</button>
                  <button disabled={busy} onClick={()=>{const s=prompt('New total PDF quota',String(u.quota));if(s!==null)patchUser(u.id,{quota:Number(s)})}}>Edit quota</button>
                  <button disabled={busy} onClick={()=>{const s=prompt('Expiry (YYYY-MM-DD), blank for none',u.expiresAt||'');if(s!==null)patchUser(u.id,{expiresAt:s||null})}}>Expiry</button>
                  <button disabled={busy} onClick={()=>{const s=prompt('Set a new password (10+ characters)');if(s)patchUser(u.id,{password:s})}}>Reset password</button>
                  <button disabled={busy} onClick={()=>patchUser(u.id,{resetUsed:true})}>Reset usage</button></div>
              </div>)}
            </div>}
          </div>
        </> : <>
          <div className="heading"><div><p className="eyebrow">SHINZO / {tab==='template'?'TEMPLATE SETTINGS':'CREATIVE STUDIO'}</p>
            <h1>{tab==='template'?'Template manager':'Certificate editor'}</h1>
            <p className="muted">{tab==='template'?'Upload an A4 JPG/PNG and position each editable element.':'Edit allowed fields, see the A4 preview, and export a clearly marked sample PDF.'}</p></div>
            <div className="head-right"><span className="outline-tag">A4 · 210 × 297 mm</span>{tab==='studio'&&<span className="outline-tag">{isAdmin?'Unlimited admin exports':`${remaining} exports remaining`}</span>}</div>
          </div>
          <div className="studio-layout"><div className="controls">
            {tab==='studio'?<>
              <div className="panel"><div className="panel-title"><h2>Editable fields</h2><span className="mini-tag">04 ELEMENTS</span></div>
                <div className="inputs">
                  <label>01 &nbsp; Registration number<input value={fields.registration} onChange={e=>setFields(f=>({...f,registration:e.target.value}))} maxLength={70}/></label>
                  <label>02 &nbsp; File number<input value={fields.file} onChange={e=>setFields(f=>({...f,file:e.target.value}))} maxLength={70}/></label>
                  
<label>
  03 &nbsp; Registration date
  <input
    value={fields.date}
    onChange={e => setFields(f => ({
      ...f,
      date: e.target.value
    }))}
    onBlur={e => setFields(f => ({
      ...f,
      date: formatBilingualDate(e.target.value)
    }))}
    maxLength={70}
    placeholder="22 May 2020"
  />
</label>
                  <label>04 &nbsp; Logo upload<input ref={logoInputRef} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={e=>uploadLogo(e.target.files?.[0])}/></label>
                  {logo&&<button className="text-button" onClick={()=>{setLogo(null);if(logoInputRef.current)logoInputRef.current.value=''}}>Remove uploaded logo</button>}
                </div>
              </div>
              <div className="panel"><div className="panel-title"><h2>PDF settings</h2></div>
                <label>Project label (not added to original fields)<input value={fields.markLabel} maxLength={70} onChange={e=>setFields(f=>({...f,markLabel:e.target.value}))}/></label>
                <div className="info-note"><b>Sample-only output</b><br/>The source image remains intact. A visible watermark and disclaimer are permanently added to the preview and PDF.</div>
                <button className="primary full" disabled={busy||!hasTemplate||remaining===0} onClick={downloadPdf}>{busy?'Generating PDF...':'↓  Save sample PDF'}</button>
              </div>
            </>:<>
              <div className="panel"><div className="panel-title"><h2>Background JPG/PNG</h2><span className="mini-tag">ADMIN ONLY</span></div>
                <label>Replace A4 background (optional)<input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={e=>uploadTemplate(e.target.files?.[0])}/></label>
                <p className="muted small">Use a high-resolution portrait A4 image, ideally 2480 × 3508 px. Max file size 10 MB.</p>
                <div className="info-note">The reference JPG you sent is already installed as the default A4 template. Only Admin can replace it. New uploads will keep the field positions unless you change them.</div>
              </div>
              <div className="panel"><div className="panel-title"><h2>Field positioning</h2><span className="mini-tag">CLICK TO PLACE</span></div>
                <label>Select field<select value={selected} onChange={e=>setSelected(e.target.value as ConfigKey)}>
                  {(Object.keys(slotNames) as ConfigKey[]).map(k=><option value={k} key={k}>{slotNames[k]}</option>)}
                </select></label>
                <p className="muted small">Click anywhere on the A4 preview to move the selected field. Adjust the dimensions below.</p>
                <div className="position-grid">{(['x','y','width','height','fontSize'] as const).map(prop=><label key={prop}>{prop==='fontSize'?'Font px':prop.toUpperCase()+(prop==='x'||prop==='y'?' (%)':' (%)')}
                  <input type="number" min={0} max={prop==='fontSize'?32:100} step={prop==='fontSize'?1:0.2} value={Math.round(config[selected][prop]*10)/10} onChange={e=>updateSlot(selected,prop,Number(e.target.value))}/>
                </label>)}</div>
                <button className="primary full" onClick={savePositions} disabled={busy}>{busy?'Saving...':'Save layout positions'}</button>
              </div>
            </>}
          </div>
          <div className="preview-col"><div className="preview-title"><div><b>Live A4 preview</b><span className="muted small"> {hasTemplate?'Background ready':'Template not uploaded'}</span></div><span className="live-dot">● LIVE PREVIEW</span></div>
            <div className="preview-stage"><div className={'paper'+(tab==='template'?' place-mode':'')} ref={pageRef} onClick={clickPage}>
              {hasTemplate?<img className="paper-bg" alt="Uploaded A4 sample template" src={`/api/template?v=${imageVersion}`}/>:<div className="paper-placeholder"><div className="placeholder-icon">▧</div><b>A4 TEMPLATE PREVIEW</b><span>Upload your JPG or PNG from Template manager</span><span>210 × 297 mm</span></div>}
              {(['registration','file','date'] as Array<'registration'|'file'|'date'>).map(key=><div key={key} className={'overlay-field'+(tab==='template'&&selected===key?' highlighted':'')} style={{left:`${config[key].x}%`,top:`${config[key].y}%`,width:`${config[key].width}%`,height:`${config[key].height}%`,fontSize:`${(config[key].fontSize / 595.28 * 100).toFixed(4)}cqw`}}>{fields[key]}</div>)}
              <div className={'overlay-logo'+(!logo&&tab!=='template'?' logo-empty':'')+(tab==='template'&&selected==='logo'?' highlighted':'')} style={{left:`${config.logo.x}%`,top:`${config.logo.y}%`,width:`${config.logo.width}%`,height:`${config.logo.height}%`}}>{logo?<img alt="User logo" src={logo}/>:tab==='template'?<span>LOGO POSITION</span>:null}</div>
            </div></div>
            <div className="preview-caption">{tab==='template'?'Admin positioning mode: click the page to move the selected item.':'Preview reflects the sample PDF fields. Position settings are controlled by Admin.'}</div>
          </div></div>
        </>}
      </div>
    </main>
  </div>;
}
