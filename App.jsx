import { useState, useEffect, useRef, useCallback } from "react";
import { auth, db, googleProvider, isFirebaseConfigured } from "./firebase.js";
import { onAuthStateChanged, signInWithRedirect, signInWithPopup, getRedirectResult, signOut, browserLocalPersistence, setPersistence } from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const LOCAL_KEY = (uid) => `stark_tracker_v3_${uid || "guest"}`;

const QUOTES = [
  "Small steps every day. Big results every year.",
  "Discipline is the bridge between goals and accomplishment.",
  "You don't rise to the level of your goals, you fall to your habits.",
  "The secret of getting ahead is getting started.",
  "Consistency beats intensity. Every. Single. Time.",
  "One day or day one. You decide.",
  "Build the life you want, one habit at a time.",
  "Success is the sum of small efforts repeated daily.",
  "Don't count the days. Make the days count.",
  "Your future self is watching you right now.",
];

const CATEGORIES = ["Skill","Fitness","Health","Work","Reading","Personal","Other"];
const PRIORITIES  = ["High","Medium","Low"];

// Light theme colors (rich, not neon)
const LIGHT_COLORS = ["#16a34a","#2563eb","#dc2626","#d97706","#7c3aed","#0891b2","#db2777","#ea580c"];
// Dark theme colors (vibrant)
const DARK_COLORS  = ["#7effa0","#5b8fff","#ff7eb3","#ffd166","#c4b5fd","#67e8f9","#fb923c","#ff6b6b"];

const P_LIGHT = {
  color:  { High:"#dc2626", Medium:"#d97706", Low:"#2563eb" },
  bg:     { High:"#fef2f2", Medium:"#fffbeb", Low:"#eff6ff" },
  border: { High:"#fecaca", Medium:"#fde68a", Low:"#bfdbfe" },
};
const P_DARK = {
  color:  { High:"#ff6b6b", Medium:"#ffd166", Low:"#6bceff" },
  bg:     { High:"rgba(255,107,107,0.12)", Medium:"rgba(255,209,102,0.12)", Low:"rgba(107,206,255,0.12)" },
  border: { High:"rgba(255,107,107,0.3)",  Medium:"rgba(255,209,102,0.3)",  Low:"rgba(107,206,255,0.3)" },
};

const TODAY = () => new Date().toISOString().slice(0,10);
const fmtDate = (str) => {
  const [y,m,d] = str.split("-");
  return new Date(y,m-1,d).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
};
const daysInMonth = (y,m) => new Date(y,m,0).getDate();
const weekNum     = (s)   => { const d=new Date(s),j=new Date(d.getFullYear(),0,1); return Math.ceil(((d-j)/86400000+j.getDay()+1)/7); };
const weekKey     = (s)   => `${s.slice(0,4)}-W${String(weekNum(s)).padStart(2,"0")}`;

// ─────────────────────────────────────────────────────────────────────────────
//  DEFAULT TASKS (Ashish's current goals)
// ─────────────────────────────────────────────────────────────────────────────
const mkDefaultTasks = () => [
  { id:1, name:"Communication Masterclass", category:"Skill",    priority:"High",   color:"#16a34a", timeEst:"1 hr",    createdAt:TODAY(), archived:false },
  { id:2, name:"Aptitude & Maths",          category:"Reading",  priority:"Medium", color:"#2563eb", timeEst:"45 mins", createdAt:TODAY(), archived:false },
  { id:3, name:"Excel",                     category:"Skill",    priority:"Medium", color:"#dc2626", timeEst:"30 mins", createdAt:TODAY(), archived:false },
  { id:4, name:"AI Content Writing",        category:"Work",     priority:"High",   color:"#d97706", timeEst:"1 hr",    createdAt:TODAY(), archived:false },
  { id:5, name:"GYM",                       category:"Fitness",  priority:"High",   color:"#ea580c", timeEst:"1.5 hrs", createdAt:TODAY(), archived:false },
  { id:6, name:"Book Reading",              category:"Reading",  priority:"Medium", color:"#7c3aed", timeEst:"30 mins", createdAt:TODAY(), archived:false },
  { id:7, name:"Camera Confidence",         category:"Personal", priority:"Medium", color:"#0891b2", timeEst:"20 mins", createdAt:TODAY(), archived:false },
  { id:8, name:"Morning Run / Walk 1hr",    category:"Fitness",  priority:"High",   color:"#db2777", timeEst:"1 hr",    createdAt:TODAY(), archived:false },
];

const initState = () => ({ tasks:mkDefaultTasks(), logs:{}, notes:{}, weekGoals:{}, nextId:9 });
const loadLocal  = (uid) => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY(uid)))||null; } catch { return null; } };
const saveLocal  = (uid, s) => localStorage.setItem(LOCAL_KEY(uid), JSON.stringify(s));

// ─────────────────────────────────────────────────────────────────────────────
//  STREAKS
// ─────────────────────────────────────────────────────────────────────────────
const calcStreak = (tid, logs) => {
  let n=0; const today=TODAY();
  if ((logs[today]||{})[tid]==="done") n++;
  const d=new Date(); d.setDate(d.getDate()-1);
  while(true){ const k=d.toISOString().slice(0,10); if((logs[k]||{})[tid]==="done"){n++;d.setDate(d.getDate()-1);}else break; }
  return n;
};
const calcLongest = (tid, logs) => {
  const dates=Object.keys(logs).sort(); let max=0,cur=0,prev=null;
  for(const d of dates){ if((logs[d]||{})[tid]==="done"){if(prev){const df=(new Date(d)-new Date(prev))/86400000;cur=df===1?cur+1:1;}else cur=1;max=Math.max(max,cur);prev=d;}else{cur=0;prev=null;} }
  return max;
};

// ─────────────────────────────────────────────────────────────────────────────
//  INJECT CSS (theme-aware via data-theme attribute on <html>)
// ─────────────────────────────────────────────────────────────────────────────
const injectCSS = () => {
  if (document.getElementById("stark-css")) return;
  const el = document.createElement("style");
  el.id = "stark-css";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

    :root {
      --bg:      #f8f7f4;
      --bg2:     #ffffff;
      --bg3:     #f3f4f6;
      --border:  #e5e7eb;
      --text:    #1a1a2e;
      --text2:   #6b7280;
      --text3:   #9ca3af;
      --accent:  #1a1a2e;
      --shadow:  0 1px 4px rgba(0,0,0,0.06);
    }
    [data-theme="dark"] {
      --bg:      #07070a;
      --bg2:     #0e0e13;
      --bg3:     #13131c;
      --border:  rgba(255,255,255,0.08);
      --text:    #f0f0f5;
      --text2:   #8888a2;
      --text3:   #44445c;
      --accent:  #7effa0;
      --shadow:  0 2px 12px rgba(0,0,0,0.4);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      transition: background 0.3s ease, color 0.3s ease;
    }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    input, select, textarea { font-family: 'DM Sans', sans-serif; outline: none; }
    input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.5; }
    select option { background: var(--bg2); color: var(--text); }

    @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes scaleIn   { from{opacity:0;transform:scale(0.94)}      to{opacity:1;transform:scale(1)}      }
    @keyframes confetti  { 0%{transform:translateY(-10px) rotate(0deg);opacity:1} 100%{transform:translateY(100vh) rotate(720deg);opacity:0} }
    @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:0.55} }
    @keyframes streak    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.2)} }
    @keyframes toast     { from{transform:translateX(-50%) translateY(14px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
    @keyframes barGrow   { from{width:0%} }

    .fade-up  { animation: fadeUp  0.35s ease forwards; }
    .scale-in { animation: scaleIn 0.25s ease forwards; }
    .card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
    [data-theme="dark"] .card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important; }
    .nav-btn:hover { color: var(--text) !important; background: var(--bg3) !important; }
    .cell:hover { filter: brightness(0.92); }
    .abtn:hover { opacity: 0.78; }
  `;
  document.head.appendChild(el);
};

// ─────────────────────────────────────────────────────────────────────────────
//  SMALL SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const pieces = Array.from({length:38},(_,i)=>({id:i,left:Math.random()*100,color:[...LIGHT_COLORS,...DARK_COLORS][i%16],delay:Math.random()*1.3,dur:2+Math.random()*2,size:5+Math.random()*7}));
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999,overflow:"hidden"}}>
      {pieces.map(p=><div key={p.id} style={{position:"absolute",left:`${p.left}%`,top:-20,width:p.size,height:p.size,background:p.color,borderRadius:p.id%3===0?"50%":2,animation:`confetti ${p.dur}s ${p.delay}s ease-in forwards`}}/>)}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:document.documentElement.dataset.theme==="dark"?"#1a1a2e":"#1a1a2e",color:"#fff",padding:"11px 22px",borderRadius:40,fontSize:13,fontWeight:600,zIndex:500,whiteSpace:"nowrap",boxShadow:"0 8px 32px rgba(0,0,0,0.2)",animation:"toast .3s ease forwards"}}>{msg}</div>;
}

function Modal({ title, onClose, children }) {
  useEffect(()=>{const h=e=>e.key==="Escape"&&onClose();window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:16}}>
      <div className="scale-in" style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:20,padding:"26px 22px",width:"min(92vw,430px)",boxShadow:"0 24px 64px rgba(0,0,0,0.18)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:17,color:"var(--text)"}}>{title}</span>
          <button onClick={onClose} style={{background:"var(--bg3)",border:"none",color:"var(--text2)",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Lbl = ({c}) => <div style={{fontSize:11,fontWeight:700,letterSpacing:1.3,color:"var(--text2)",marginBottom:6,marginTop:16,textTransform:"uppercase"}}>{c}</div>;
const Inp = ({style,...p}) => <input style={{width:"100%",background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text)",padding:"10px 13px",borderRadius:10,fontSize:14,...style}} {...p}/>;
const Sel = ({children,...p}) => <select style={{width:"100%",background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text)",padding:"10px 13px",borderRadius:10,fontSize:14}} {...p}>{children}</select>;
const PBtn = ({children,style,...p}) => <button style={{width:"100%",padding:"12px",background:"var(--accent)",color:document.documentElement.dataset.theme==="dark"?"#07070a":"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"Syne,sans-serif",marginTop:18,...style}} {...p}>{children}</button>;

function Ring({ pct, color, size=80 }) {
  const st=7,r=(size-st*2)/2,c=2*Math.PI*r,off=c-(pct/100)*c;
  const dark = document.documentElement.dataset.theme==="dark";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={dark?"rgba(255,255,255,0.06)":"#f3f4f6"} strokeWidth={st}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={st} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dashoffset 1s ease"}}/>
      <text x={size/2} y={size/2+5} textAnchor="middle" fill={dark?"#f0f0f5":"#1a1a2e"} fontSize={size*.18} fontWeight={800} fontFamily="Syne,sans-serif">{pct}%</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  injectCSS();

  const [dark, setDark]         = useState(()=>localStorage.getItem("stark_theme")==="dark");
  const [state, setState]       = useState(()=>loadLocal("guest")||initState());
  const [view, setView]         = useState("day");
  const [selDate, setSelDate]   = useState(TODAY());
  const [showAdd, setShowAdd]   = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [newTask, setNewTask]   = useState({name:"",category:"Skill",priority:"Medium",color:LIGHT_COLORS[0],timeEst:""});
  const [toast, setToast]       = useState("");
  const [confetti, setConfetti] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState(localStorage.getItem("stark_reminder")||"");
  const [authUser, setAuthUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("local");
  const confTmr = useRef(null);
  const saveTmr = useRef(null);
  const unsub   = useRef(null);
  const isRemoteUpdate = useRef(false);

  // ── Theme toggle ──
  useEffect(()=>{
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("stark_theme", dark ? "dark" : "light");
  },[dark]);

  // ── Auth listener ──
  // ── Auth: set persistence then wire up state listener ──
  useEffect(()=>{
    if (!isFirebaseConfigured || !auth) return;

    // Force local persistence so session survives page reloads on all browsers
    setPersistence(auth, browserLocalPersistence).catch(()=>{});

    // Handle returning from a redirect sign-in
    getRedirectResult(auth)
      .then(result => { if (result?.user) showToast("✅ Signed in! Syncing…"); })
      .catch(()=>{});

    // Auth state listener — fires immediately if already signed in
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        setupSync(user.uid);
      } else {
        if (unsub.current) { unsub.current(); unsub.current = null; }
        setSyncStatus("local");
        setState(initState());
      }
    });
  }, []);

  // ── Firestore real-time sync ──
  const setupSync = (uid) => {
    if (unsub.current) unsub.current();
    if (!db) return;
    const ref = doc(db,"trackers",uid);
    setSyncStatus("syncing");
    unsub.current = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        isRemoteUpdate.current = true;
        setState(data);
        saveLocal(uid, data);
      } else {
        // first login — push local state
        const local = loadLocal(uid) || initState();
        setDoc(ref, local);
      }
      setSyncStatus("synced");
    }, () => setSyncStatus("offline"));
  };

  // ── Save (debounced 1.2s) — skip if this was a remote update ──
  useEffect(()=>{
    saveLocal(authUser?.uid || "guest", state);
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    if (!authUser || !db || !isFirebaseConfigured) return;
    clearTimeout(saveTmr.current);
    setSyncStatus("saving");
    saveTmr.current = setTimeout(()=>{
      const ref = doc(db,"trackers",authUser.uid);
      setDoc(ref, state)
        .then(()=>setSyncStatus("synced"))
        .catch(()=>setSyncStatus("offline"));
    }, 1200);
  },[state]);

  const showToast = useCallback((msg)=>{ setToast(msg); setTimeout(()=>setToast(""),2500); },[]);
  const triggerConfetti = useCallback(()=>{ setConfetti(true); clearTimeout(confTmr.current); confTmr.current=setTimeout(()=>setConfetti(false),4000); },[]);

  const COLORS  = dark ? DARK_COLORS  : LIGHT_COLORS;
  const PC      = dark ? P_DARK       : P_LIGHT;
  const quote   = QUOTES[new Date().getDate()%QUOTES.length];
  const activeTasks = state.tasks.filter(t=>!t.archived);

  const getStatus = (tid,date) => (state.logs[date]||{})[tid]||"";
  const setStatus = (tid,date,ns) => {
    setState(s=>{
      const dl={...(s.logs[date]||{})};
      dl[tid]=dl[tid]===ns?"":ns;
      const ns2={...s,logs:{...s.logs,[date]:dl}};
      if(activeTasks.every(t=>(ns2.logs[date]||{})[t.id]==="done")&&activeTasks.length>0) triggerConfetti();
      return ns2;
    });
  };
  const setNote    = (date,text) => setState(s=>({...s,notes:{...s.notes,[date]:text}}));
  const setWGoal   = (wk,val)   => setState(s=>({...s,weekGoals:{...s.weekGoals,[wk]:val}}));

  const addTask = () => {
    if(!newTask.name.trim()) return;
    setState(s=>({...s,tasks:[...s.tasks,{id:s.nextId,...newTask,name:newTask.name.trim(),createdAt:TODAY(),archived:false}],nextId:s.nextId+1}));
    setNewTask({name:"",category:"Skill",priority:"Medium",color:COLORS[0],timeEst:""});
    setShowAdd(false); showToast("✅ Task added!");
  };
  const saveEdit = () => {
    setState(s=>({...s,tasks:s.tasks.map(t=>t.id===editTask.id?{...editTask}:t)}));
    setEditTask(null); showToast("✏️ Updated!");
  };
  const archiveTask   = id => { setState(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,archived:true}:t)}));  showToast("📦 Archived"); };
  const unarchiveTask = id => { setState(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,archived:false}:t)})); showToast("♻️ Restored"); };
  const deleteTask    = id => {
    if(!confirm("Delete permanently?")) return;
    setState(s=>({...s,tasks:s.tasks.filter(t=>t.id!==id),logs:Object.fromEntries(Object.entries(s.logs).map(([d,v])=>{const c={...v};delete c[id];return[d,c];}))}));
    showToast("🗑 Deleted");
  };

  const weekDates = ref => { const d=new Date(ref),day=d.getDay(),mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toISOString().slice(0,10);}); };
  const monthDates = ref => { const [y,m]=ref.split("-").map(Number); return Array.from({length:daysInMonth(y,m)},(_,i)=>`${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`); };
  const rangeStats = (tid,dates) => {
    const rel=dates.filter(d=>{const t=state.tasks.find(x=>x.id===tid);return t&&d>=t.createdAt;});
    if(!rel.length) return null;
    const done=rel.filter(d=>getStatus(tid,d)==="done").length, skip=rel.filter(d=>getStatus(tid,d)==="skip").length;
    return{done,skip,total:rel.length,pct:Math.round((done/rel.length)*100)};
  };

  // sync badge
  const syncBadge = { synced:{label:"● Synced",c:"#16a34a"}, saving:{label:"● Saving…",c:"#d97706"}, syncing:{label:"● Connecting…",c:"#2563eb"}, offline:{label:"● Offline",c:"#dc2626"}, local:{label:"● Local only",c:"#9ca3af"} };
  const sb = syncBadge[syncStatus]||syncBadge.local;

  const hdr = { background:"var(--bg2)", borderBottom:`1px solid var(--border)`, boxShadow:"var(--shadow)" };

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",transition:"background .3s ease"}}>
      <Confetti active={confetti}/>
      <Toast msg={toast}/>

      {/* ── HEADER ── */}
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 22px",...hdr,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"var(--accent)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18,color:dark?"#07070a":"#fff",flexShrink:0}}>S</div>
          <div>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:16,letterSpacing:2,color:"var(--text)"}}>STARK TRACKER</div>
            <div style={{fontSize:9,color:"var(--text3)",letterSpacing:2}}>DAILY · WEEKLY · MONTHLY</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {/* sync status */}
          {authUser && <span style={{fontSize:11,color:sb.c,fontWeight:600}}>{sb.label}</span>}

          {/* theme toggle */}
          <button onClick={()=>setDark(d=>!d)} title="Toggle theme" style={{background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text2)",width:34,height:34,borderRadius:9,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {dark?"☀️":"🌙"}
          </button>

          {/* Google auth */}
          {isFirebaseConfigured && (
            authUser
              ? <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {authUser.photoURL && <img src={authUser.photoURL} referrerPolicy="no-referrer" style={{width:32,height:32,borderRadius:"50%",border:"2px solid var(--border)"}} alt={authUser.displayName||""}/>}
                  <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
                    <span style={{fontSize:12,fontWeight:700,color:"var(--text)"}}>{authUser.displayName||"User"}</span>
                    <span style={{fontSize:10,color:"var(--text3)"}}>{authUser.email}</span>
                  </div>
                  <button onClick={()=>signOut(auth).then(()=>showToast("👋 Signed out")).catch(()=>{})} style={{background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text2)",padding:"5px 10px",borderRadius:8,fontSize:11,cursor:"pointer",fontWeight:600,marginLeft:2}}>Sign out</button>
                </div>
              : <button onClick={()=>{
                    setPersistence(auth, browserLocalPersistence)
                      .then(() => signInWithRedirect(auth, googleProvider))
                      .catch(() => signInWithRedirect(auth, googleProvider));
                  }} style={{background:"#4285f4",color:"#fff",border:"none",padding:"7px 12px",borderRadius:9,fontSize:12,cursor:"pointer",fontWeight:700}}>
                    🔐 Sign in to Sync
                  </button>
          <button onClick={()=>setShowReminder(true)} style={{background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text2)",padding:"7px 10px",borderRadius:9,fontSize:15,cursor:"pointer"}}>🔔</button>
          <button onClick={()=>setShowAdd(true)} style={{background:"var(--accent)",color:dark?"#07070a":"#fff",border:"none",padding:"8px 16px",borderRadius:9,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Syne,sans-serif"}}>＋ Add Task</button>
        </div>
      </header>

      {/* ── QUOTE ── */}
      <div style={{padding:"8px 22px",...hdr,borderTop:"none",fontSize:12,color:"var(--text3)",fontStyle:"italic"}}>✦&nbsp;&nbsp;{quote}</div>

      {/* ── NAV ── */}
      <nav style={{display:"flex",...hdr,borderTop:"none",position:"sticky",top:66,zIndex:99}}>
        {[["day","📅 Day"],["week","📊 Week"],["month","🗓 Month"],["stats","📈 Stats"],["manage","⚙️ Manage"]].map(([v,label])=>(
          <button key={v} className="nav-btn" onClick={()=>setView(v)} style={{flex:1,padding:"13px 0",background:"transparent",border:"none",borderBottom:view===v?`2px solid var(--accent)`:"2px solid transparent",color:view===v?"var(--accent)":"var(--text3)",fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:.8,fontFamily:"Syne,sans-serif",transition:"all .15s"}}>{label}</button>
        ))}
      </nav>

      {/* ── MAIN ── */}
      <main style={{padding:"24px 20px",maxWidth:1100,margin:"0 auto"}}>
        {view==="day"    && <DayView    state={state} activeTasks={activeTasks} selDate={selDate} getStatus={getStatus} setStatus={setStatus} setNote={setNote} fmtDate={fmtDate} calcStreak={calcStreak} PC={PC} dark={dark}/>}
        {view==="week"   && <WeekView   state={state} activeTasks={activeTasks} selDate={selDate} weekDates={weekDates} getStatus={getStatus} setStatus={setStatus} rangeStats={rangeStats} weekKey={weekKey} setWGoal={setWGoal} PC={PC} dark={dark}/>}
        {view==="month"  && <MonthView  state={state} activeTasks={activeTasks} selDate={selDate} monthDates={monthDates} getStatus={getStatus} rangeStats={rangeStats} dark={dark}/>}
        {view==="stats"  && <StatsView  state={state} activeTasks={activeTasks} calcStreak={calcStreak} calcLongest={calcLongest} monthDates={monthDates} weekDates={weekDates} getStatus={getStatus} rangeStats={rangeStats} PC={PC} dark={dark}/>}
        {view==="manage" && <ManageView state={state} activeTasks={activeTasks} onEdit={setEditTask} onArchive={archiveTask} onUnarchive={unarchiveTask} onDelete={deleteTask} PC={PC}/>}
      </main>

      {/* ── ADD MODAL ── */}
      {showAdd && (
        <Modal title="Add New Task" onClose={()=>setShowAdd(false)}>
          <Lbl c="Task Name"/><Inp placeholder="e.g. Morning Run…" value={newTask.name} onChange={e=>setNewTask(n=>({...n,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask()} autoFocus/>
          <Lbl c="Category"/><Sel value={newTask.category} onChange={e=>setNewTask(n=>({...n,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel>
          <Lbl c="Priority"/>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {PRIORITIES.map(p=><button key={p} onClick={()=>setNewTask(n=>({...n,priority:p}))} style={{flex:1,padding:"8px 0",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:700,border:`1px solid ${newTask.priority===p?PC.color[p]:PC.border[p]}`,background:newTask.priority===p?PC.bg[p]:"var(--bg3)",color:newTask.priority===p?PC.color[p]:"var(--text2)"}}>{p}</button>)}
          </div>
          <Lbl c="Est. Time"/><Inp placeholder="e.g. 30 mins" value={newTask.timeEst} onChange={e=>setNewTask(n=>({...n,timeEst:e.target.value}))}/>
          <Lbl c="Color Tag"/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{COLORS.map(c=><div key={c} onClick={()=>setNewTask(n=>({...n,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",outline:newTask.color===c?`3px solid ${c}`:"none",outlineOffset:3}}/>)}</div>
          <PBtn onClick={addTask}>Add Task →</PBtn>
        </Modal>
      )}

      {/* ── EDIT MODAL ── */}
      {editTask && (
        <Modal title="Edit Task" onClose={()=>setEditTask(null)}>
          <Lbl c="Task Name"/><Inp value={editTask.name} onChange={e=>setEditTask(t=>({...t,name:e.target.value}))} autoFocus/>
          <Lbl c="Category"/><Sel value={editTask.category} onChange={e=>setEditTask(t=>({...t,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</Sel>
          <Lbl c="Priority"/>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {PRIORITIES.map(p=><button key={p} onClick={()=>setEditTask(t=>({...t,priority:p}))} style={{flex:1,padding:"8px 0",borderRadius:9,cursor:"pointer",fontSize:12,fontWeight:700,border:`1px solid ${editTask.priority===p?PC.color[p]:PC.border[p]}`,background:editTask.priority===p?PC.bg[p]:"var(--bg3)",color:editTask.priority===p?PC.color[p]:"var(--text2)"}}>{p}</button>)}
          </div>
          <Lbl c="Est. Time"/><Inp value={editTask.timeEst||""} onChange={e=>setEditTask(t=>({...t,timeEst:e.target.value}))} placeholder="e.g. 30 mins"/>
          <Lbl c="Color Tag"/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{COLORS.map(c=><div key={c} onClick={()=>setEditTask(t=>({...t,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",outline:editTask.color===c?`3px solid ${c}`:"none",outlineOffset:3}}/>)}</div>
          <PBtn onClick={saveEdit}>Save Changes →</PBtn>
        </Modal>
      )}

      {/* ── REMINDER MODAL ── */}
      {showReminder && (
        <Modal title="Daily Reminder 🔔" onClose={()=>setShowReminder(false)}>
          <p style={{color:"var(--text2)",fontSize:13,lineHeight:1.6}}>Get a browser notification to log your tasks every day.</p>
          <Lbl c="Time"/><Inp type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)}/>
          <PBtn onClick={()=>{localStorage.setItem("stark_reminder",reminderTime);if(Notification.permission!=="granted")Notification.requestPermission();setShowReminder(false);showToast(`🔔 Reminder set for ${reminderTime}`);}}>Set Reminder →</PBtn>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  DAY VIEW
// ─────────────────────────────────────────────────────────────────────────────
function DayView({state,activeTasks,selDate,getStatus,setStatus,setNote,fmtDate,calcStreak,PC,dark}){
  const done=activeTasks.filter(t=>getStatus(t.id,selDate)==="done").length;
  const total=activeTasks.length, pct=total?Math.round((done/total)*100):0;
  const note=state.notes[selDate]||"", isToday=selDate===TODAY();
  const sorted=[...activeTasks].sort((a,b)=>({High:0,Medium:1,Low:2}[a.priority]||1)-({High:0,Medium:1,Low:2}[b.priority]||1));

  const accentGreen = dark?"#7effa0":"#16a34a";

  return (
    <div className="fade-up">
      <div style={{marginBottom:22}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
          <div>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:26,color:"var(--text)"}}>{isToday?"Today":fmtDate(selDate).split(",")[0]}</div>
            <div style={{color:"var(--text3)",fontSize:13,marginTop:3}}>{fmtDate(selDate)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:32,color:pct===100?accentGreen:"var(--text)"}}>{pct}%</div>
            <div style={{color:"var(--text3)",fontSize:12}}>{done}/{total} done</div>
          </div>
        </div>
        <div style={{height:5,background:"var(--bg3)",borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:4,width:`${pct}%`,background:pct===100?accentGreen:"var(--accent)",transition:"width .8s cubic-bezier(.4,0,.2,1)",animation:"barGrow 1s ease"}}/>
        </div>
        {pct===100&&total>0&&<div style={{textAlign:"center",marginTop:10,color:accentGreen,fontWeight:700,fontSize:13,animation:"pulse 2s infinite"}}>🎉 All tasks done! Incredible work!</div>}
      </div>

      {activeTasks.length===0?<Empty dark={dark}/>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:13}}>
          {sorted.map((task,i)=>{
            const status=getStatus(task.id,selDate), isDone=status==="done", isSkip=status==="skip";
            return(
              <div key={task.id} className="card fade-up" style={{background:isDone?`${task.color}10`:"var(--bg2)",border:`1px solid ${isDone?task.color+"40":"var(--border)"}`,borderRadius:14,padding:17,boxShadow:"var(--shadow)",opacity:isSkip?.55:1,animationDelay:`${i*.05}s`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:task.color,flexShrink:0,boxShadow:dark?`0 0 6px ${task.color}40`:"none"}}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:"var(--text)",textDecoration:isSkip?"line-through":"none"}}>{task.name}</div>
                      <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{task.category}{task.timeEst?` · ⏱ ${task.timeEst}`:""}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:PC.bg[task.priority],color:PC.color[task.priority],border:`1px solid ${PC.border[task.priority]}`}}>{task.priority}</span>
                    {calcStreak(task.id,state.logs)>0&&<span style={{fontSize:11,color:"#f59e0b",fontWeight:700,animation:"streak 2s infinite"}}>🔥 {calcStreak(task.id,state.logs)}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStatus(task.id,selDate,"done")} style={{flex:2,padding:"8px 0",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${isDone?task.color:"var(--border)"}`,background:isDone?task.color:"var(--bg3)",color:isDone?"#fff":"var(--text2)",transition:"all .15s"}}>{isDone?"✓ Done":"Mark Done"}</button>
                  <button onClick={()=>setStatus(task.id,selDate,"skip")} style={{flex:1,padding:"8px 0",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${isSkip?"var(--text2)":"var(--border)"}`,background:isSkip?"var(--bg3)":"transparent",color:isSkip?"var(--text)":"var(--text3)",transition:"all .15s"}}>{isSkip?"⊘":"Skip"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{marginTop:26,background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:13,padding:18,boxShadow:"var(--shadow)"}}>
        <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,marginBottom:9,color:"var(--text2)"}}>📝 Daily Note</div>
        <textarea value={note} onChange={e=>setNote(selDate,e.target.value)} placeholder="How was your day? Any wins, blockers, reflections…" style={{width:"100%",background:"transparent",border:"none",color:"var(--text)",fontSize:14,lineHeight:1.7,resize:"none",minHeight:68,outline:"none",fontFamily:"DM Sans,sans-serif"}}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  WEEK VIEW
// ─────────────────────────────────────────────────────────────────────────────
function WeekView({state,activeTasks,selDate,weekDates,getStatus,setStatus,rangeStats,weekKey,setWGoal,PC,dark}){
  const dates=weekDates(selDate), DL=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], today=TODAY(), wk=weekKey(selDate), goal=state.weekGoals[wk]||70;
  const oD=activeTasks.reduce((a,t)=>{const s=rangeStats(t.id,dates);return s?a+s.done:a;},0);
  const oT=activeTasks.reduce((a,t)=>{const s=rangeStats(t.id,dates);return s?a+s.total:a;},0);
  const oPct=oT?Math.round((oD/oT)*100):0;
  const accentGreen=dark?"#7effa0":"#16a34a";

  return(
    <div className="fade-up">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18}}>
        <div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,color:"var(--text)"}}>Weekly Report</div><div style={{color:"var(--text3)",fontSize:13,marginTop:2}}>{dates[0]} → {dates[6]}</div></div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>Goal: <select value={goal} onChange={e=>setWGoal(wk,Number(e.target.value))} style={{marginLeft:4,background:"var(--bg3)",border:`1px solid var(--border)`,color:"var(--text)",padding:"2px 6px",borderRadius:6,fontSize:11}}>{[50,60,70,80,90,100].map(v=><option key={v}>{v}</option>)}</select>%</div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:28,color:oPct>=goal?accentGreen:"var(--text)"}}>{oPct}%</div>
          <div style={{fontSize:11,color:"var(--text3)"}}>{oD}/{oT} completions</div>
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{height:5,background:"var(--bg3)",borderRadius:4,overflow:"hidden",position:"relative"}}>
          <div style={{height:"100%",width:`${oPct}%`,background:"var(--accent)",borderRadius:4,transition:"width .8s ease"}}/>
          <div style={{position:"absolute",top:-2,left:`${goal}%`,width:2,height:9,background:"#f59e0b",transform:"translateX(-50%)"}}/>
        </div>
        <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>▲ goal at {goal}%</div>
      </div>
      {activeTasks.length===0?<Empty dark={dark}/>:(
        <>
          <div style={{overflowX:"auto",marginBottom:22,background:"var(--bg2)",borderRadius:13,border:`1px solid var(--border)`,boxShadow:"var(--shadow)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`1px solid var(--border)`}}>
                  <th style={{padding:"12px 14px",textAlign:"left",color:"var(--text2)",fontWeight:700,whiteSpace:"nowrap"}}>Task</th>
                  {dates.map((d,i)=><th key={d} style={{padding:"12px 8px",textAlign:"center",color:d===today?"var(--accent)":"var(--text3)",fontWeight:700,fontSize:11}}>{DL[i]}<br/><span style={{fontSize:9,opacity:.6}}>{d.slice(8)}</span></th>)}
                  <th style={{padding:"12px 8px",textAlign:"center",color:"var(--text2)",fontWeight:700}}>%</th>
                </tr>
              </thead>
              <tbody>
                {activeTasks.map(task=>{
                  const stats=rangeStats(task.id,dates);
                  return(
                    <tr key={task.id} style={{borderBottom:`1px solid var(--border)`}}>
                      <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:task.color}}/>
                          <div><div style={{fontWeight:600,fontSize:13,color:"var(--text)"}}>{task.name}</div><div style={{fontSize:10,color:"var(--text3)"}}>{task.category}</div></div>
                        </div>
                      </td>
                      {dates.map(d=>{
                        const s=getStatus(task.id,d);
                        return(
                          <td key={d} style={{padding:"6px",textAlign:"center"}}>
                            <div onClick={()=>setStatus(task.id,d,s==="done"?"":"done")} className="cell" style={{width:30,height:30,borderRadius:8,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",background:s==="done"?task.color:s==="skip"?"var(--bg3)":"var(--bg)",border:`1px solid ${d===today?"var(--accent)":s==="done"?task.color:"var(--border)"}`,fontSize:13,fontWeight:700,color:s==="done"?"#fff":"var(--text3)",transition:"all .15s"}}>
                              {s==="done"?"✓":s==="skip"?"—":""}
                            </div>
                          </td>
                        );
                      })}
                      <td style={{textAlign:"center",fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:13}}>
                        {stats?<span style={{color:stats.pct>=80?accentGreen:stats.pct>=50?"#f59e0b":PC.color.High}}>{stats.pct}%</span>:"—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12}}>
            {activeTasks.map(task=>{const stats=rangeStats(task.id,dates);if(!stats) return null;return(
              <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:12,padding:15,borderTop:`3px solid ${task.color}`,boxShadow:"var(--shadow)"}}>
                <div style={{fontWeight:700,fontSize:12,color:task.color,marginBottom:4}}>{task.name}</div>
                <div style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:24,color:"var(--text)"}}>{stats.pct}%</div>
                <div style={{fontSize:11,color:"var(--text3)"}}>{stats.done}/{stats.total} days</div>
                <div style={{height:3,background:"var(--bg3)",borderRadius:2,marginTop:8}}><div style={{height:"100%",width:`${stats.pct}%`,background:task.color,borderRadius:2,transition:"width .8s ease"}}/></div>
              </div>
            );})}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONTH VIEW
// ─────────────────────────────────────────────────────────────────────────────
function MonthView({state,activeTasks,selDate,monthDates,getStatus,rangeStats,dark}){
  const dates=monthDates(selDate), [y,m]=selDate.split("-"), today=TODAY();
  const monthName=new Date(y,m-1).toLocaleString("en-IN",{month:"long",year:"numeric"});
  const overall=activeTasks.map(t=>({task:t,stats:rangeStats(t.id,dates)})).filter(x=>x.stats);
  const avgPct=overall.length?Math.round(overall.reduce((a,x)=>a+x.stats.pct,0)/overall.length):0;
  const accentGreen=dark?"#7effa0":"#16a34a";

  return(
    <div className="fade-up">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:22}}>
        <div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,color:"var(--text)"}}>Monthly Progress</div><div style={{color:"var(--text3)",fontSize:13,marginTop:2}}>{monthName}</div></div>
        <div style={{textAlign:"right"}}><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:28,color:accentGreen}}>{avgPct}%</div><div style={{fontSize:12,color:"var(--text3)"}}>overall avg</div></div>
      </div>
      {activeTasks.length===0?<Empty dark={dark}/>:(
        <>
          <div style={{display:"flex",flexWrap:"wrap",gap:13,marginBottom:24}}>
            {overall.map(({task,stats})=>(
              <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:13,padding:16,textAlign:"center",minWidth:106,boxShadow:"var(--shadow)"}}>
                <Ring pct={stats.pct} color={task.color} size={76}/>
                <div style={{fontWeight:700,fontSize:12,marginTop:9,color:task.color}}>{task.name}</div>
                <div style={{fontSize:11,color:"var(--text3)"}}>{stats.done} days</div>
              </div>
            ))}
          </div>
          {overall.map(({task,stats})=>(
            <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderLeft:`3px solid ${task.color}`,borderRadius:13,padding:16,marginBottom:11,boxShadow:"var(--shadow)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
                <div><span style={{fontWeight:700,color:task.color}}>{task.name}</span><span style={{fontSize:11,color:"var(--text3)",marginLeft:8}}>{task.category}</span></div>
                <span style={{fontFamily:"Syne,sans-serif",fontWeight:800,color:stats.pct>=70?accentGreen:stats.pct>=40?"#f59e0b":"#ef4444"}}>{stats.pct}%</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {dates.map(d=>{const s=getStatus(task.id,d);return(
                  <div key={d} title={d} style={{width:24,height:24,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",background:s==="done"?task.color:s==="skip"?"var(--bg3)":"var(--bg)",border:`1px solid ${d===today?"var(--accent)":s==="done"?task.color:"var(--border)"}`}}>
                    <span style={{fontSize:8,color:s==="done"?"#fff":"var(--text3)",fontWeight:700}}>{d.slice(8)}</span>
                  </div>
                );})}
              </div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:7}}>{stats.done}/{stats.total} days · {stats.skip} skipped</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STATS VIEW
// ─────────────────────────────────────────────────────────────────────────────
function StatsView({state,activeTasks,calcStreak,calcLongest,monthDates,weekDates,getStatus,rangeStats,PC,dark}){
  const today=TODAY(), tMD=monthDates(today), tWD=weekDates(today);
  const DN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const ds=Array(7).fill(0).map((_,i)=>({day:i,done:0}));
  Object.entries(state.logs).forEach(([date,log])=>{const idx=new Date(date).getDay();activeTasks.forEach(t=>{if(log[t.id]==="done")ds[idx].done++;});});
  const best=ds.reduce((a,b)=>b.done>a.done?b:a,ds[0]);
  const last7=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()-6+i);const k=d.toISOString().slice(0,10);const done=activeTasks.filter(t=>getStatus(t.id,k)==="done").length;return activeTasks.length?Math.round((done/activeTasks.length)*100):0;});
  const wAvg=Math.round(tWD.reduce((a,d)=>{const done=activeTasks.filter(t=>getStatus(t.id,d)==="done").length;return a+done;},0)/(tWD.length*Math.max(activeTasks.length,1))*100);
  const accentGreen=dark?"#7effa0":"#16a34a";

  return(
    <div className="fade-up">
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,color:"var(--text)",marginBottom:20}}>Analytics & Stats</div>
      {activeTasks.length===0?<Empty dark={dark}/>:(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:12,marginBottom:22}}>
            {[{l:"Active Tasks",v:activeTasks.length,i:"⚡",c:dark?"#5b8fff":"#2563eb"},{l:"Done Today",v:activeTasks.filter(t=>getStatus(t.id,today)==="done").length,i:"✅",c:accentGreen},{l:"Best Day",v:DN[best.day],i:"🏆",c:"#f59e0b"},{l:"Week Avg",v:`${wAvg}%`,i:"📊",c:dark?"#c4b5fd":"#7c3aed"}].map(s=>(
              <div key={s.l} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:12,padding:16,boxShadow:"var(--shadow)"}}>
                <div style={{fontSize:20,marginBottom:6}}>{s.i}</div>
                <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:22,color:s.c}}>{s.v}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:13,padding:18,marginBottom:18,boxShadow:"var(--shadow)"}}>
            <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,marginBottom:14,color:"var(--text2)"}}>7-Day Completion Trend</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:88}}>
              {last7.map((v,i)=>{const d=new Date(today);d.setDate(d.getDate()-6+i);return(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:10,color:"var(--text)",fontWeight:700}}>{v>0?`${v}%`:""}</div>
                  <div style={{width:"100%",borderRadius:4,height:`${Math.max(v,4)}%`,minHeight:4,background:v>=80?accentGreen:v>=50?"var(--accent)":"var(--bg3)",transition:"height .5s ease"}}/>
                  <div style={{fontSize:9,color:"var(--text3)"}}>{DN[d.getDay()]}</div>
                </div>
              );})}
            </div>
          </div>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:"var(--text2)",marginBottom:11}}>Task Streaks & Performance</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {activeTasks.map(task=>{
              const streak=calcStreak(task.id,state.logs), longest=calcLongest(task.id,state.logs);
              const ms=rangeStats(task.id,tMD), ws=rangeStats(task.id,tWD);
              return(
                <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderLeft:`3px solid ${task.color}`,borderRadius:12,padding:15,boxShadow:"var(--shadow)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:9,height:9,borderRadius:"50%",background:task.color}}/>
                      <div><div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{task.name}</div><div style={{fontSize:11,color:"var(--text3)"}}>{task.category} · <span style={{color:PC.color[task.priority]}}>{task.priority}</span></div></div>
                    </div>
                    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                      {[{i:"🔥",l:"Streak",v:`${streak}d`,c:"#f59e0b"},{i:"🏆",l:"Best",v:`${longest}d`,c:"#ea580c"},{i:"📅",l:"Week",v:ws?`${ws.pct}%`:"—",c:task.color},{i:"🗓",l:"Month",v:ms?`${ms.pct}%`:"—",c:task.color}].map(x=>(
                        <div key={x.l} style={{textAlign:"center"}}><div style={{fontSize:10,color:"var(--text3)",marginBottom:2}}>{x.i} {x.l}</div><div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:14,color:x.c}}>{x.v}</div></div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MANAGE VIEW
// ─────────────────────────────────────────────────────────────────────────────
function ManageView({state,activeTasks,onEdit,onArchive,onUnarchive,onDelete,PC}){
  const archived=state.tasks.filter(t=>t.archived);
  return(
    <div className="fade-up">
      <div style={{fontFamily:"Syne,sans-serif",fontWeight:800,fontSize:24,color:"var(--text)",marginBottom:6}}>Manage Tasks</div>
      <div style={{color:"var(--text3)",fontSize:13,marginBottom:20}}>{activeTasks.length} active · {archived.length} archived</div>
      {activeTasks.length===0?<Empty/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:26}}>
          {activeTasks.map(task=>(
            <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderLeft:`3px solid ${task.color}`,borderRadius:12,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,boxShadow:"var(--shadow)"}}>
              <div style={{display:"flex",alignItems:"center",gap:11}}>
                <div style={{width:9,height:9,borderRadius:"50%",background:task.color}}/>
                <div><div style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>{task.name}</div><div style={{fontSize:11,color:"var(--text3)",marginTop:1}}>{task.category} · <span style={{color:PC.color[task.priority]}}>{task.priority}</span>{task.timeEst?` · ⏱ ${task.timeEst}`:""}</div></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="abtn" onClick={()=>onEdit({...task})} style={{padding:"6px 13px",background:PC.bg.Low,color:PC.color.Low,border:`1px solid ${PC.border.Low}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>✏️ Edit</button>
                <button className="abtn" onClick={()=>onArchive(task.id)} style={{padding:"6px 13px",background:PC.bg.Medium,color:PC.color.Medium,border:`1px solid ${PC.border.Medium}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>📦 Archive</button>
                <button className="abtn" onClick={()=>onDelete(task.id)} style={{padding:"6px 10px",background:PC.bg.High,color:PC.color.High,border:`1px solid ${PC.border.High}`,borderRadius:8,fontSize:12,cursor:"pointer"}}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {archived.length>0&&(
        <>
          <div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:13,color:"var(--text3)",marginBottom:10}}>Archived</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {archived.map(task=>(
              <div key={task.id} style={{background:"var(--bg2)",border:`1px solid var(--border)`,borderRadius:10,padding:"11px 15px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,opacity:.5}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{task.name} <span style={{color:"var(--text3)",fontWeight:400}}>— {task.category}</span></span>
                <div style={{display:"flex",gap:8}}>
                  <button className="abtn" onClick={()=>onUnarchive(task.id)} style={{padding:"5px 11px",background:PC.bg.Low,color:PC.color.Low,border:`1px solid ${PC.border.Low}`,borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer"}}>♻️ Restore</button>
                  <button className="abtn" onClick={()=>onDelete(task.id)} style={{padding:"5px 10px",background:PC.bg.High,color:PC.color.High,border:`1px solid ${PC.border.High}`,borderRadius:7,fontSize:12,cursor:"pointer"}}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Empty(){return(<div style={{textAlign:"center",padding:"56px 20px",color:"var(--text3)"}}><div style={{fontSize:34,marginBottom:11}}>⚡</div><div style={{fontFamily:"Syne,sans-serif",fontWeight:700,fontSize:15,color:"var(--text2)",marginBottom:5}}>No tasks yet</div><div style={{fontSize:13}}>Click <b style={{color:"var(--accent)"}}>＋ Add Task</b> to get started!</div></div>);}
