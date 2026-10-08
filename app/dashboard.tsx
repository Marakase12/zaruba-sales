"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Crown, Trophy, Target, Wallet, Plus, ArrowUpRight, LogIn, LogOut, X, Camera, Check, LockKeyhole, RefreshCw, Trash2, Pencil, Flag } from "lucide-react";
import { GOAL, SLOTS, money, photoUrl, rankPayments, type Payment } from "../lib/payments";

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const result = await response.json() as { error?: string; payments: Payment[]; canEdit: boolean };
  if (!response.ok) throw new Error(result.error ?? "Не удалось выполнить запрос.");
  return result;
}
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog=ref.current!; dialog.showModal(); const old=document.body.style.overflow; document.body.style.overflow="hidden"; return () => { document.body.style.overflow=old; dialog.close(); }; }, []);
  return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();close();}} aria-labelledby="modal-title">
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label="Закрыть"><X size={22}/></button></div>{children}
  </dialog>;
}
export default function Dashboard() {
  const [payments,setPayments]=useState<Payment[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [toast,setToast]=useState("");
  const [login,setLogin]=useState(false);
  const [selected,setSelected]=useState<{slot:number;payment?:Payment}|null>(null);
  const refresh=useCallback(async()=>{
    try { const data=await api("/api/payments"); setPayments(data.payments);setCanEdit(data.canEdit);setError("");return true; }
    catch(e){setError((e as Error).message);return false;}finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh(); const timer=setInterval(()=>{if(!document.hidden)void refresh();},10000); const focus=()=>void refresh();window.addEventListener("focus",focus);return()=>{clearInterval(timer);window.removeEventListener("focus",focus);};},[refresh]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),4500);return()=>clearTimeout(timer);},[toast]);
  const ranking=rankPayments(payments);
  const total=payments.reduce((sum,p)=>sum+p.amountKopecks,0);
  const percent=Math.round(total/(GOAL*100)*100);
  const nextSlot=Array.from({length:SLOTS},(_,i)=>i+1).find(slot=>!payments.some(p=>p.slot===slot));
  async function logout(){try{await api("/api/auth",{method:"DELETE"});setCanEdit(false);setSelected(null);setToast("Вы вышли из режима управления");}catch(e){setToast((e as Error).message);}}
  return <main className="site-shell">
    <header className="topbar"><a className="wordmark" href="#top" aria-label="Заруба — начало"><Crown size={23}/><span className="brand-name">ЗАРУБА<small>ВТОРОЙ ЦИКЛ</small></span></a><div className="topbar-right"><span className="cycle-label">ОДНА КОМАНДА. ОДНА ЦЕЛЬ.</span>{canEdit?<button className="quiet-button" onClick={logout}><LogOut size={15}/> ВЫЙТИ</button>:<button className="quiet-button" onClick={()=>setLogin(true)}><LogIn size={15}/> ВОЙТИ</button>}</div></header>
    <div className="world" id="top">
      <section className="hero" aria-label="Заруба второго цикла">
        <div className="hero-brand"><div className="eyebrow"><span/> ВРЕМЯ БОЛЬШИХ РЕЗУЛЬТАТОВ</div><h1><img src="/assets/logo.png" alt="Заруба второго цикла"/></h1><p>Каждая оплата — шаг к большой цели.</p></div>
        <div className="stats-panel"><div className="stat"><Target className="pink" size={30}/><span>ПЛАН</span><strong>{money(GOAL*100)}</strong></div><div className="stat"><Wallet className="mint" size={30}/><span>В КАССЕ</span><strong className="mint">{loading?"…":money(total)}</strong></div><div className="stat progress-stat"><div className="progress-ring" style={{"--progress":`${Math.min(percent,100)}%`} as CSSProperties}><b>{loading?"…":`${percent}%`}</b></div><span>ВЫПОЛНЕНИЕ</span></div></div>
        <img className="hero-person" src="/assets/hero.png" alt="Денежная энергия"/>
      </section>
      <section className="goal-strip"><div><span>20 ОПЛАТ</span><b>=</b><strong>3 200 000 ₽</strong></div><p>ВМЕСТЕ К БОЛЬШИМ<br/>РЕЗУЛЬТАТАМ! <Crown size={28}/></p></section>
      <section className="race-section" aria-labelledby="race-title">
        <div className="section-heading"><div><p className="eyebrow">КАЖДАЯ ПОБЕДА НА СЧЕТУ</p><h2 id="race-title">Путь к цели</h2></div><div className="race-actions"><span className="counter"><b>{payments.length.toString().padStart(2,"0")}</b> / 20 оплат</span>{canEdit&&<button className="primary-button" disabled={!nextSlot||loading||!!error} onClick={()=>nextSlot&&setSelected({slot:nextSlot})}><Plus size={17}/> Добавить оплату</button>}</div></div>
        {error&&<div className="error-banner" role="alert">{error}<button onClick={()=>void refresh()}><RefreshCw size={16}/>Повторить</button></div>}
        {canEdit&&<p className="admin-hint"><LockKeyhole size={14}/> Режим ADMIN · нажмите на монетку, чтобы добавить оплату, или на фотографию, чтобы изменить её.</p>}
        <div className="race-board">
          <div className="fireflies" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{"--x":`${(i*37+13)%97}%`,"--y":`${(i*23+7)%93}%`,"--delay":`${-(i%8)}s`,"--duration":`${5+i%5}s`} as CSSProperties}/>)}</div>
          <div className="start-marker"><img src="/assets/start.png" alt="Старт"/></div>
          <svg className="stone-road" viewBox="0 0 1000 780" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8d6650"/><stop offset=".6" stopColor="#51483b"/><stop offset="1" stopColor="#282b28"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="4" floodColor="#000" floodOpacity=".7"/></filter></defs><path d="M95 130 H865 Q965 130 965 228 Q965 325 865 325 H135 Q35 325 35 422 Q35 520 135 520 H865 Q965 520 965 618 Q965 715 865 715 H95" fill="none" stroke="url(#stone)" strokeWidth="92" strokeLinecap="round" filter="url(#shadow)"/><path d="M100 130 H870 Q965 130 965 228 Q965 325 870 325 H130 Q35 325 35 422 Q35 520 130 520 H870 Q965 520 965 618 Q965 715 870 715 H100" fill="none" stroke="#e0b694" strokeWidth="1.5" strokeDasharray="7 60" opacity=".45"/></svg>
          <div className="track">{Array.from({length:SLOTS},(_,index)=>{const slot=index+1,p=payments.find(x=>x.slot===slot),row=Math.floor(index/5),col=row%2?5-index%5:index%5+1;return <button key={slot} className={`payment-slot ${p?"filled":"empty"} ${slot===nextSlot?"next":""}`} style={{"--col":col,"--row":row+1} as CSSProperties} disabled={!p&&(!canEdit||!!error||loading)} onClick={()=>setSelected({slot,payment:p})} aria-label={p?`Оплата ${slot}: ${p.firstName} ${p.lastName}, ${money(p.amountKopecks)}`:`Добавить оплату ${slot}`}>
            <span className="slot-visual">{p?<img className="portrait" src={photoUrl(p.photoKey)} alt={`${p.firstName} ${p.lastName}`}/>:<img className="coin" src="/assets/coin.png" alt=""/>}{canEdit&&<span className="slot-edit">{p?<Pencil size={14}/>:<Plus size={18}/>}</span>}</span>
            {p?<><span className="manager-name">{p.firstName}<small>{p.lastName}</small></span><span className="payment-amount">{money(p.amountKopecks)}</span></>:<span className="slot-number">{slot.toString().padStart(2,"0")}</span>}
          </button>;})}</div>
          <span className="direction direction-one">→</span><span className="direction direction-two">←</span><span className="direction direction-three">→</span><span className="direction direction-four">←</span>
        </div>
        <div className="race-bottom"><span><Flag size={17}/>{payments.length===20?"Дорожка пройдена. Все 20 оплат собраны!":"20 шагов. Одна команда. Одна цель."}</span><span className="sync-status"><i className={error?"offline":""}/>{loading?"Загружаем результаты…":error?"Нет связи с сервером":"Обновляется каждые 10 секунд"}</span></div>
      </section>
      <section className="results-section"><div className="leaderboard"><div className="section-heading"><div className="ranking-title"><Trophy size={30}/><div><p className="eyebrow">АКУЛЫ ПРОДАЖ</p><h2>Рейтинг по сумме в кассе</h2></div></div><span className="live-badge">LIVE</span></div>
        <div className="table-scroll"><table><thead><tr><th scope="col">МЕСТО</th><th scope="col">МЕНЕДЖЕР</th><th scope="col">СУММА</th><th scope="col">ОПЛАТЫ</th></tr></thead><tbody>{ranking.map((r,i)=><tr key={r.key}><td><span className={`rank rank-${i+1}`}>{i<3?<Crown size={14}/>:null}{i+1}</span></td><td><div className="manager-cell"><img src={photoUrl(r.photoKey)} alt=""/><span>{r.firstName}<small>{r.lastName}</small></span></div></td><td className="table-amount">{money(r.amountKopecks)}</td><td>{r.count}</td></tr>)}</tbody></table></div>
        {!ranking.length&&<div className="empty-ranking"><Trophy size={42}/><h3>{loading?"Загружаем рейтинг…":"Первая победа может быть вашей"}</h3><p>{error?"Рейтинг появится после восстановления соединения.":"После первой оплаты здесь появятся лидеры команды."}</p>{canEdit&&!error&&<button className="text-button" onClick={()=>setSelected({slot:1})}>Добавить первую оплату <ArrowUpRight size={16}/></button>}</div>}
        <div className="ranking-footer"><span>{ranking.length} менеджеров в гонке</span><span>Общая касса <strong>{money(total)}</strong></span></div>
      </div><aside className="treasure-panel"><span className="eyebrow">БОЛЬШАЯ ЦЕЛЬ</span><img src="/assets/treasure.png" alt="Сундук с целью 3 200 000 рублей"/><p>ЗАБИРАЕМ<br/><em>СВОЁ.</em></p></aside></section>
      <footer className="footer"><span>ЗАРУБА ВТОРОГО ЦИКЛА</span><span>КАЖДАЯ ОПЛАТА ПРИБЛИЖАЕТ ПОБЕДУ</span><a href="#top">Наверх ↑</a></footer>
    </div>
    {toast&&<div className="toast" role="status"><Check size={18}/>{toast}</div>}
    {login&&<Login close={()=>setLogin(false)} done={async()=>{setLogin(false);await refresh();setToast("Вы вошли как ADMIN. Выберите любую монетку.");}}/>}
    {selected&&(canEdit?<PaymentEditor selected={selected} payments={payments} close={()=>setSelected(null)} done={async(message)=>{setSelected(null);await refresh();setToast(message);}}/>:selected.payment&&<Modal title={`Оплата № ${selected.slot}`} close={()=>setSelected(null)}><div className="payment-detail"><img src={photoUrl(selected.payment.photoKey)} alt=""/><h3>{selected.payment.firstName} {selected.payment.lastName}</h3><strong>{money(selected.payment.amountKopecks)}</strong><p>Вклад в общую победу команды</p></div></Modal>)}
  </main>;
}
function Login({close,done}:{close:()=>void;done:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget);try{await api("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:form.get("username"),password:form.get("password")})});await done();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title="Вход администратора" close={()=>!busy&&close()}><p className="form-intro">Войдите, чтобы добавлять оплаты и обновлять результаты команды.</p><form onSubmit={submit} className="form"><label>Логин<input name="username" autoComplete="username" required autoFocus placeholder="Логин администратора"/></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required placeholder="Пароль"/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button submit-button" disabled={busy}>{busy?"Входим…":"ВОЙТИ"}<LogIn size={17}/></button></form></Modal>;
}
function PaymentEditor({selected,payments,close,done}:{selected:{slot:number;payment?:Payment};payments:Payment[];close:()=>void;done:(message:string)=>Promise<void>}) {
  const current=selected.payment;
  const [first,setFirst]=useState(current?.firstName??""),[last,setLast]=useState(current?.lastName??""),[preview,setPreview]=useState(current?photoUrl(current.photoKey):"");
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmDelete,setConfirmDelete]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const managers=rankPayments(payments);
  useEffect(()=>()=>{if(preview.startsWith("blob:"))URL.revokeObjectURL(preview);},[preview]);
  function chooseManager(value:string){const m=managers.find(x=>x.key===value);setFile(null);if(fileRef.current)fileRef.current.value="";setFirst(m?.firstName??"");setLast(m?.lastName??"");setPreview(m?photoUrl(m.photoKey):"");}
  function chooseFile(photo:File|undefined){if(!photo)return;if(photo.size>5_000_000){setError("Максимальный размер фотографии — 5 МБ.");return;}if(!["image/png","image/jpeg","image/webp"].includes(photo.type)){setError("Выберите JPG, PNG или WebP.");return;}setFile(photo);setPreview(URL.createObjectURL(photo));setError("");}
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const form=new FormData(e.currentTarget);form.set("slot",String(selected.slot));form.set("version",String(current?.version??0));if(file)form.set("photo",file);try{await api("/api/payments",{method:"POST",body:form});await done(current?"Оплата обновлена":"Оплата добавлена. Ещё один шаг к цели!");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function remove(){setBusy(true);setError("");try{await api("/api/payments",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({slot:current!.slot,version:current!.version})});await done("Оплата удалена. Монетка снова свободна.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title={current?`Оплата № ${selected.slot}`:`Новая оплата № ${selected.slot}`} close={()=>!busy&&close()}><p className="form-intro">Одна монетка — одна оплата. Результаты менеджера суммируются в рейтинге.</p><form className="form" onSubmit={submit}>
    {!!managers.length&&<label>Менеджер<select defaultValue={current?.managerKey??""} onChange={e=>chooseManager(e.target.value)}><option value="">Новый менеджер</option>{managers.map(m=><option key={m.key} value={m.key}>{m.firstName} {m.lastName}</option>)}</select></label>}
    <div className="photo-upload"><button type="button" className={`photo-picker ${preview?"has-photo":""}`} onClick={()=>fileRef.current?.click()} aria-label="Загрузить фотографию">{preview?<img src={preview} alt="Предпросмотр фотографии"/>:<Camera size={30}/>}<span><Plus size={14}/></span></button><div><b>{preview?"Изменить фотографию":"Фотография менеджера"}</b><p>JPG, PNG или WebP · до 5 МБ<br/>Лицо лучше расположить по центру</p><button type="button" className="text-button" onClick={()=>fileRef.current?.click()}>Выбрать файл</button></div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>chooseFile(e.target.files?.[0])} hidden/></div>
    <div className="form-row"><label>Имя<input name="firstName" value={first} onChange={e=>setFirst(e.target.value)} required maxLength={60} placeholder="Имя" autoComplete="off"/></label><label>Фамилия<input name="lastName" value={last} onChange={e=>setLast(e.target.value)} required maxLength={60} placeholder="Фамилия" autoComplete="off"/></label></div>
    <label>Сумма оплаты, ₽<input name="amount" inputMode="decimal" defaultValue={current?String(current.amountKopecks/100):""} required placeholder="Например, 150 000" autoComplete="off"/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="primary-button submit-button" disabled={busy}>{busy?"Сохраняем…":current?"Сохранить изменения":"Добавить оплату"}<Check size={18}/></button>
    {current&&(confirmDelete?<div className="delete-confirm"><p>Удалить эту оплату? Сумма будет исключена из кассы и рейтинга.</p><button type="button" className="danger-button" disabled={busy} onClick={remove}>Да, удалить</button><button type="button" className="quiet-button" disabled={busy} onClick={()=>setConfirmDelete(false)}>Отмена</button></div>:<button type="button" className="text-button delete-button" disabled={busy} onClick={()=>setConfirmDelete(true)}><Trash2 size={15}/> Удалить оплату</button>)}
  </form></Modal>;
}
