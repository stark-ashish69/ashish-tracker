import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const STORAGE_KEY = "stark_tracker_v2";

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

const CATEGORIES = ["Skill", "Fitness", "Health", "Work", "Reading", "Personal", "Other"];
const PRIORITIES = ["High", "Medium", "Low"];
const COLORS = [
  "#7effa0", "#5b8fff", "#ff7eb3", "#ffd166",
  "#ff6b6b", "#67e8f9", "#c4b5fd", "#fb923c",
];
const PRIORITY_COLOR = { High: "#ff6b6b", Medium: "#ffd166", Low: "#6bceff" };
const PRIORITY_BG    = { High: "rgba(255,107,107,0.1)", Medium: "rgba(255,209,102,0.1)", Low: "rgba(107,206,255,0.1)" };

const TODAY = () => new Date().toISOString().slice(0, 10);

const formatDate = (str) => {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
};

const shortDate = (str) => {
  const [y, m, d] = str.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short",
  });
};

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// ─────────────────────────────────────────────
//  STORAGE
// ─────────────────────────────────────────────
const loadState = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
  catch { return null; }
};

const saveState = (s) => localStorage.setItem(STORAGE_KEY, JSON.stringify(s));

const initState = () => ({
  tasks: [],
  logs: {},       // { "YYYY-MM-DD": { taskId: "done"|"skip"|"" } }
  notes: {},      // { "YYYY-MM-DD": string }
  weekGoals: {},  // { "YYYY-WW": number }
  nextId: 1,
});

// ─────────────────────────────────────────────
//  STREAK CALCULATOR
// ─────────────────────────────────────────────
const calcStreak = (taskId, logs) => {
  let streak = 0;
  const d = new Date(); d.setHours(0,0,0,0);
  // check yesterday first (today may not be done yet)
  d.setDate(d.getDate() - 1);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if ((logs[key] || {})[taskId] === "done") { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  // also count today if done
  const todayKey = TODAY();
  if ((logs[todayKey] || {})[taskId] === "done") streak++;
  return streak;
};

const calcLongestStreak = (taskId, logs) => {
  const dates = Object.keys(logs).sort();
  let max = 0, cur = 0, prev = null;
  for (const d of dates) {
    if ((logs[d] || {})[taskId] === "done") {
      if (prev) {
        const diff = (new Date(d) - new Date(prev)) / 86400000;
        cur = diff === 1 ? cur + 1 : 1;
      } else cur = 1;
      max = Math.max(max, cur);
      prev = d;
    } else { cur = 0; prev = null; }
  }
  return max;
};

// week number helper
const weekNum = (dateStr) => {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
};

const weekKey = (dateStr) => `${dateStr.slice(0,4)}-W${String(weekNum(dateStr)).padStart(2,"0")}`;

// ─────────────────────────────────────────────
//  CONFETTI
// ─────────────────────────────────────────────
function Confetti({ active }) {
  if (!active) return null;
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2,
    size: 6 + Math.random() * 8,
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:999, overflow:"hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute", left:`${p.left}%`, top:-20,
          width:p.size, height:p.size,
          background:p.color, borderRadius: p.id%3===0 ? "50%" : 2,
          animation:`confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position:"fixed", bottom:32, left:"50%",
      transform:"translateX(-50%)",
      background:"linear-gradient(135deg,#1a1a28,#22223a)",
      border:"1px solid var(--border-bright)",
      color:"var(--text)", padding:"12px 24px",
      borderRadius:40, fontSize:13, fontWeight:600,
      zIndex:500, whiteSpace:"nowrap",
      boxShadow:"0 8px 32px rgba(0,0,0,0.6)",
      animation:"toastSlide 0.3s ease forwards",
    }}>{msg}</div>
  );
}

// ─────────────────────────────────────────────
//  MODAL
// ─────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={e => e.target===e.currentTarget && onClose()} style={{
      position:"fixed", inset:0,
      background:"rgba(7,7,9,0.85)",
      backdropFilter:"blur(12px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:400, padding:16,
    }}>
      <div className="scale-in" style={{
        background:"var(--bg2)",
        border:"1px solid var(--border-bright)",
        borderRadius:20, padding:"28px 24px",
        width:"min(92vw,440px)",
        boxShadow:"0 40px 100px rgba(0,0,0,0.8)",
        maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <span style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:17 }}>{title}</span>
          <button onClick={onClose} style={{ background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text2)", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// form helpers
const Label = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", marginBottom:6, marginTop:18, textTransform:"uppercase" }}>{children}</div>
);
const Input = ({ style, ...props }) => (
  <input style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)", padding:"11px 14px", borderRadius:10, fontSize:14, ...style }} {...props} />
);
const Select = ({ children, ...props }) => (
  <select style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)", padding:"11px 14px", borderRadius:10, fontSize:14 }} {...props}>{children}</select>
);
const PrimaryBtn = ({ children, style, ...props }) => (
  <button style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,var(--accent),var(--accent2))", color:"#07070e", border:"none", borderRadius:12, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"Syne,sans-serif", letterSpacing:0.5, marginTop:20, ...style }} {...props}>{children}</button>
);

// ─────────────────────────────────────────────
//  RING SVG
// ─────────────────────────────────────────────
function Ring({ pct, color, size=80, stroke=7 }) {
  const r = (size - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition:"stroke-dashoffset 1s ease" }}
      />
      <text x={size/2} y={size/2+5} textAnchor="middle" fill="#fff" fontSize={size*0.18} fontWeight={800} fontFamily="Syne,sans-serif">{pct}%</text>
    </svg>
  );
}

// ─────────────────────────────────────────────
//  MINI SPARKLINE
// ─────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 80, h = 28;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length-1)) * w},${h - (v/max)*h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────
//  MAIN APP
// ─────────────────────────────────────────────
// Inject styles
const styleEl = document.createElement('style');
styleEl.textContent = `
  :root {
    --bg: #070709; --bg2: #0e0e12; --bg3: #13131a;
    --border: rgba(255,255,255,0.07);
    --border-bright: rgba(255,255,255,0.14);
    --text: #f0f0f4; --text2: #8888a0; --text3: #44445a;
    --accent: #7effa0; --accent2: #5b8fff; --accent3: #ff7eb3;
    --high: #ff6b6b; --med: #ffd166; --low: #6bceff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #070709; color: #f0f0f4; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes confettiFall { 0% { transform:translateY(-10px) rotate(0deg); opacity:1; } 100% { transform:translateY(100vh) rotate(720deg); opacity:0; } }
  @keyframes streakBounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  @keyframes toastSlide { from { transform:translateX(-50%) translateY(20px); opacity:0; } to { transform:translateX(-50%) translateY(0); opacity:1; } }
  @keyframes scaleIn { from { opacity:0; transform:scale(0.92); } to { opacity:1; transform:scale(1); } }
  .fade-up { animation: fadeUp 0.4s ease forwards; }
  .scale-in { animation: scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards; }
`;
document.head.appendChild(styleEl);
export default function App() {
  const [state, setState] = useState(() => loadState() || initState());
  const [view, setView] = useState("day");
  const [selectedDate, setSelectedDate] = useState(TODAY());
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [newTask, setNewTask] = useState({ name:"", category:"Skill", priority:"Medium", color:COLORS[0], timeEst:"" });
  const [toast, setToast] = useState("");
  const [confetti, setConfetti] = useState(false);
  const [darkMode] = useState(true);
  const [reminderTime, setReminderTime] = useState(localStorage.getItem("stark_reminder")||"");
  const [showReminder, setShowReminder] = useState(false);
  const confettiTimer = useRef(null);

  useEffect(() => { saveState(state); }, [state]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const triggerConfetti = useCallback(() => {
    setConfetti(true);
    clearTimeout(confettiTimer.current);
    confettiTimer.current = setTimeout(() => setConfetti(false), 4000);
  }, []);

  const quote = QUOTES[new Date().getDate() % QUOTES.length];
  const activeTasks = state.tasks.filter(t => !t.archived);

  // ── log ──
  const getStatus = (taskId, date) => (state.logs[date] || {})[taskId] || "";

  const setStatus = (taskId, date, newStatus) => {
    setState(s => {
      const dayLog = { ...(s.logs[date] || {}) };
      dayLog[taskId] = dayLog[taskId] === newStatus ? "" : newStatus;
      const newState = { ...s, logs: { ...s.logs, [date]: dayLog } };
      // check if all done today
      const allDone = activeTasks.every(t => (newState.logs[date]||{})[t.id] === "done");
      if (allDone && activeTasks.length > 0) triggerConfetti();
      return newState;
    });
  };

  // ── notes ──
  const setNote = (date, text) => setState(s => ({ ...s, notes: { ...s.notes, [date]: text } }));

  // ── week goal ──
  const setWeekGoal = (wk, val) => setState(s => ({ ...s, weekGoals: { ...s.weekGoals, [wk]: val } }));

  // ── task CRUD ──
  const addTask = () => {
    if (!newTask.name.trim()) return;
    setState(s => ({
      ...s,
      tasks: [...s.tasks, { id:s.nextId, ...newTask, name:newTask.name.trim(), createdAt:TODAY(), archived:false }],
      nextId: s.nextId + 1,
    }));
    setNewTask({ name:"", category:"Skill", priority:"Medium", color:COLORS[0], timeEst:"" });
    setShowAdd(false);
    showToast("✅ Task added!");
  };

  const saveEdit = () => {
    setState(s => ({ ...s, tasks: s.tasks.map(t => t.id===editTask.id ? {...editTask} : t) }));
    setEditTask(null);
    showToast("✏️ Task updated!");
  };

  const archiveTask = (id) => {
    setState(s => ({ ...s, tasks: s.tasks.map(t => t.id===id ? {...t, archived:true} : t) }));
    showToast("📦 Task archived");
  };

  const unarchiveTask = (id) => {
    setState(s => ({ ...s, tasks: s.tasks.map(t => t.id===id ? {...t, archived:false} : t) }));
    showToast("♻️ Task restored");
  };

  const deleteTask = (id) => {
    if (!confirm("Permanently delete this task and all its logs?")) return;
    setState(s => ({
      ...s,
      tasks: s.tasks.filter(t => t.id!==id),
      logs: Object.fromEntries(Object.entries(s.logs).map(([d,v]) => {
        const copy = {...v}; delete copy[id]; return [d, copy];
      })),
    }));
    showToast("🗑 Task deleted");
  };

  // ── range helpers ──
  const weekDates = (ref) => {
    const d = new Date(ref);
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((day+6)%7));
    return Array.from({length:7}, (_,i) => {
      const x = new Date(mon); x.setDate(mon.getDate()+i);
      return x.toISOString().slice(0,10);
    });
  };

  const monthDates = (ref) => {
    const [y,m] = ref.split("-").map(Number);
    return Array.from({length:daysInMonth(y,m)}, (_,i) =>
      `${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`
    );
  };

  const rangeStats = (taskId, dates) => {
    const relevant = dates.filter(d => {
      const task = state.tasks.find(t => t.id===taskId);
      return task && d >= task.createdAt;
    });
    if (!relevant.length) return null;
    const done = relevant.filter(d => getStatus(taskId,d)==="done").length;
    const skip = relevant.filter(d => getStatus(taskId,d)==="skip").length;
    return { done, skip, total:relevant.length, pct:Math.round((done/relevant.length)*100) };
  };

  // ── reminder ──
  const saveReminder = () => {
    localStorage.setItem("stark_reminder", reminderTime);
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    setShowReminder(false);
    showToast(`🔔 Reminder set for ${reminderTime}`);
  };

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", position:"relative", overflow:"hidden" }}>
      {/* Background blobs */}
      <div style={{ position:"fixed", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,rgba(126,255,160,0.04) 0%,transparent 70%)", top:-200, left:-200, pointerEvents:"none" }} />
      <div style={{ position:"fixed", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(91,143,255,0.04) 0%,transparent 70%)", bottom:-100, right:-100, pointerEvents:"none" }} />

      <Confetti active={confetti} />
      <Toast msg={toast} />

      {/* ── HEADER ── */}
      <header style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"18px 28px", borderBottom:"1px solid var(--border)",
        background:"rgba(7,7,9,0.85)", backdropFilter:"blur(20px)",
        position:"sticky", top:0, zIndex:100,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{
            width:38, height:38, background:"linear-gradient(135deg,var(--accent),var(--accent2))",
            borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center",
            fontWeight:900, fontSize:18, color:"#07070e", fontFamily:"Syne,sans-serif",
          }}>S</div>
          <div>
            <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:18, letterSpacing:2 }}>STARK TRACKER</div>
            <div style={{ fontSize:10, color:"var(--text3)", letterSpacing:2 }}>DAILY · WEEKLY · MONTHLY</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
            style={{ background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text2)", padding:"8px 12px", borderRadius:10, fontSize:13, fontFamily:"DM Sans,sans-serif" }}
          />
          <button onClick={() => setShowReminder(true)} style={{ background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text2)", padding:"8px 14px", borderRadius:10, fontSize:13, cursor:"pointer" }}>🔔</button>
          <button onClick={() => setShowAdd(true)} style={{
            background:"linear-gradient(135deg,var(--accent),var(--accent2))",
            color:"#07070e", border:"none", padding:"9px 20px",
            borderRadius:10, fontWeight:800, fontSize:13, cursor:"pointer",
            fontFamily:"Syne,sans-serif", letterSpacing:0.5,
          }}>＋ Add Task</button>
        </div>
      </header>

      {/* ── QUOTE BANNER ── */}
      <div style={{
        background:"linear-gradient(90deg,rgba(126,255,160,0.06),rgba(91,143,255,0.06))",
        borderBottom:"1px solid var(--border)",
        padding:"10px 28px", fontSize:12, color:"var(--text2)",
        fontStyle:"italic", letterSpacing:0.3,
      }}>
        ✦ &nbsp;{quote}
      </div>

      {/* ── NAV ── */}
      <nav style={{
        display:"flex", borderBottom:"1px solid var(--border)",
        background:"var(--bg2)", position:"sticky", top:73, zIndex:99,
      }}>
        {[["day","📅 Day"],["week","📊 Week"],["month","🗓 Month"],["stats","📈 Stats"],["manage","⚙️ Manage"]].map(([v,label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex:1, padding:"14px 0", background:"transparent", border:"none",
            borderBottom: view===v ? "2px solid var(--accent)" : "2px solid transparent",
            color: view===v ? "var(--accent)" : "var(--text3)",
            fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:1,
            fontFamily:"Syne,sans-serif", transition:"all .2s",
          }}>{label}</button>
        ))}
      </nav>

      {/* ── MAIN ── */}
      <main style={{ padding:"28px 24px", maxWidth:1100, margin:"0 auto" }}>
        {view==="day"    && <DayView    state={state} activeTasks={activeTasks} selectedDate={selectedDate} getStatus={getStatus} setStatus={setStatus} setNote={setNote} shortDate={shortDate} formatDate={formatDate} calcStreak={calcStreak} />}
        {view==="week"   && <WeekView   state={state} activeTasks={activeTasks} selectedDate={selectedDate} weekDates={weekDates} getStatus={getStatus} setStatus={setStatus} rangeStats={rangeStats} weekKey={weekKey} setWeekGoal={setWeekGoal} />}
        {view==="month"  && <MonthView  state={state} activeTasks={activeTasks} selectedDate={selectedDate} monthDates={monthDates} getStatus={getStatus} rangeStats={rangeStats} />}
        {view==="stats"  && <StatsView  state={state} activeTasks={activeTasks} calcStreak={calcStreak} calcLongestStreak={calcLongestStreak} monthDates={monthDates} weekDates={weekDates} getStatus={getStatus} rangeStats={rangeStats} />}
        {view==="manage" && <ManageView state={state} activeTasks={activeTasks} onEdit={setEditTask} onArchive={archiveTask} onUnarchive={unarchiveTask} onDelete={deleteTask} />}
      </main>

      {/* ── ADD MODAL ── */}
      {showAdd && (
        <Modal title="Add New Task" onClose={() => setShowAdd(false)}>
          <Label>Task Name</Label>
          <Input placeholder="e.g. Morning Run, Learn React…" value={newTask.name}
            onChange={e=>setNewTask(n=>({...n,name:e.target.value}))}
            onKeyDown={e=>e.key==="Enter"&&addTask()} autoFocus />
          <Label>Category</Label>
          <Select value={newTask.category} onChange={e=>setNewTask(n=>({...n,category:e.target.value}))}>
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </Select>
          <Label>Priority</Label>
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            {PRIORITIES.map(p=>(
              <button key={p} onClick={()=>setNewTask(n=>({...n,priority:p}))} style={{
                flex:1, padding:"9px 0", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700,
                border:`1px solid ${newTask.priority===p ? PRIORITY_COLOR[p] : "var(--border)"}`,
                background: newTask.priority===p ? PRIORITY_BG[p] : "var(--bg3)",
                color: newTask.priority===p ? PRIORITY_COLOR[p] : "var(--text2)",
              }}>{p}</button>
            ))}
          </div>
          <Label>Est. Time (optional)</Label>
          <Input placeholder="e.g. 30 mins, 1 hr" value={newTask.timeEst}
            onChange={e=>setNewTask(n=>({...n,timeEst:e.target.value}))} />
          <Label>Color Tag</Label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>setNewTask(n=>({...n,color:c}))} style={{
                width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                outline: newTask.color===c ? `3px solid ${c}` : "none",
                outlineOffset:3, transition:"transform .15s",
              }} />
            ))}
          </div>
          <PrimaryBtn onClick={addTask}>Add Task →</PrimaryBtn>
        </Modal>
      )}

      {/* ── EDIT MODAL ── */}
      {editTask && (
        <Modal title="Edit Task" onClose={()=>setEditTask(null)}>
          <Label>Task Name</Label>
          <Input value={editTask.name} onChange={e=>setEditTask(t=>({...t,name:e.target.value}))} autoFocus />
          <Label>Category</Label>
          <Select value={editTask.category} onChange={e=>setEditTask(t=>({...t,category:e.target.value}))}>
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </Select>
          <Label>Priority</Label>
          <div style={{ display:"flex", gap:8, marginTop:4 }}>
            {PRIORITIES.map(p=>(
              <button key={p} onClick={()=>setEditTask(t=>({...t,priority:p}))} style={{
                flex:1, padding:"9px 0", borderRadius:10, cursor:"pointer", fontSize:12, fontWeight:700,
                border:`1px solid ${editTask.priority===p ? PRIORITY_COLOR[p] : "var(--border)"}`,
                background: editTask.priority===p ? PRIORITY_BG[p] : "var(--bg3)",
                color: editTask.priority===p ? PRIORITY_COLOR[p] : "var(--text2)",
              }}>{p}</button>
            ))}
          </div>
          <Label>Est. Time</Label>
          <Input value={editTask.timeEst||""} onChange={e=>setEditTask(t=>({...t,timeEst:e.target.value}))} placeholder="e.g. 30 mins" />
          <Label>Color Tag</Label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
            {COLORS.map(c=>(
              <div key={c} onClick={()=>setEditTask(t=>({...t,color:c}))} style={{
                width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                outline: editTask.color===c ? `3px solid ${c}` : "none",
                outlineOffset:3,
              }} />
            ))}
          </div>
          <PrimaryBtn onClick={saveEdit}>Save Changes →</PrimaryBtn>
        </Modal>
      )}

      {/* ── REMINDER MODAL ── */}
      {showReminder && (
        <Modal title="Daily Reminder 🔔" onClose={()=>setShowReminder(false)}>
          <p style={{ color:"var(--text2)", fontSize:13, lineHeight:1.6, marginBottom:4 }}>
            Set a daily reminder to log your tasks. Your browser will send a notification at this time.
          </p>
          <Label>Reminder Time</Label>
          <Input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)} />
          <PrimaryBtn onClick={saveReminder}>Set Reminder →</PrimaryBtn>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  DAY VIEW
// ─────────────────────────────────────────────
function DayView({ state, activeTasks, selectedDate, getStatus, setStatus, setNote, formatDate, calcStreak }) {
  const done = activeTasks.filter(t => getStatus(t.id, selectedDate)==="done").length;
  const total = activeTasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  const note = state.notes[selectedDate] || "";
  const isToday = selectedDate === new Date().toISOString().slice(0,10);

  // sort by priority
  const sorted = [...activeTasks].sort((a,b) => {
    const order = { High:0, Medium:1, Low:2 };
    return (order[a.priority]||1) - (order[b.priority]||1);
  });

  return (
    <div className="fade-up">
      {/* date + progress */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22 }}>
              {isToday ? "Today" : formatDate(selectedDate).split(",")[0]}
            </div>
            <div style={{ color:"var(--text2)", fontSize:13, marginTop:2 }}>{formatDate(selectedDate)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:28, color: pct===100?"var(--accent)":"var(--text)" }}>{pct}%</div>
            <div style={{ color:"var(--text2)", fontSize:12 }}>{done}/{total} done</div>
          </div>
        </div>
        {/* progress bar */}
        <div style={{ height:6, background:"var(--bg3)", borderRadius:4, overflow:"hidden" }}>
          <div style={{
            height:"100%", borderRadius:4,
            width:`${pct}%`,
            background: pct===100
              ? "linear-gradient(90deg,var(--accent),#00e5ff)"
              : "linear-gradient(90deg,var(--accent2),var(--accent))",
            transition:"width .8s cubic-bezier(.4,0,.2,1)",
            animation:"progressGrow 1s ease",
          }} />
        </div>
        {pct===100 && total>0 && (
          <div style={{ textAlign:"center", marginTop:10, color:"var(--accent)", fontWeight:700, fontSize:13, animation:"pulse 2s infinite" }}>
            🎉 All tasks done! Incredible work!
          </div>
        )}
      </div>

      {/* tasks grid */}
      {activeTasks.length === 0
        ? <EmptyState />
        : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
            {sorted.map((task, idx) => (
              <DayTaskCard key={task.id} task={task} status={getStatus(task.id,selectedDate)}
                onToggle={(s)=>setStatus(task.id,selectedDate,s)}
                streak={calcStreak(task.id, state.logs)}
                animDelay={idx*0.05}
              />
            ))}
          </div>
      }

      {/* daily note */}
      <div style={{ marginTop:32, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:20 }}>
        <div style={{ fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:13, marginBottom:10, color:"var(--text2)" }}>📝 Daily Note</div>
        <textarea
          value={note}
          onChange={e=>setNote(selectedDate, e.target.value)}
          placeholder="How was your day? Any wins, blockers, reflections…"
          style={{
            width:"100%", background:"transparent", border:"none", color:"var(--text)",
            fontSize:14, lineHeight:1.7, resize:"none", minHeight:80, outline:"none",
            fontFamily:"DM Sans,sans-serif",
          }}
        />
      </div>
    </div>
  );
}

function DayTaskCard({ task, status, onToggle, streak, animDelay }) {
  const isDone = status==="done";
  const isSkip = status==="skip";
  return (
    <div className="fade-up" style={{
      background: isDone
        ? `linear-gradient(135deg,${task.color}12,${task.color}06)`
        : "var(--bg2)",
      border:`1px solid ${isDone ? task.color+"40" : "var(--border)"}`,
      borderRadius:16, padding:18, transition:"all .2s",
      animationDelay:`${animDelay}s`,
      opacity: isSkip ? 0.5 : 1,
    }}>
      {/* top row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:task.color, flexShrink:0, boxShadow:`0 0 8px ${task.color}` }} />
          <div>
            <div style={{ fontWeight:700, fontSize:14, textDecoration:isSkip?"line-through":"none", color:isSkip?"var(--text3)":"var(--text)" }}>{task.name}</div>
            <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{task.category}{task.timeEst ? ` · ⏱ ${task.timeEst}` : ""}</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          <span style={{
            fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
            background:PRIORITY_BG[task.priority], color:PRIORITY_COLOR[task.priority],
          }}>{task.priority}</span>
          {streak > 0 && (
            <span style={{ fontSize:11, color:"#ffd166", fontWeight:700, animation:"streakBounce 2s infinite" }}>
              🔥 {streak}
            </span>
          )}
        </div>
      </div>
      {/* buttons */}
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={()=>onToggle("done")} style={{
          flex:2, padding:"8px 0", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
          border:`1px solid ${isDone ? task.color : "var(--border)"}`,
          background: isDone ? task.color : "var(--bg3)",
          color: isDone ? "#07070e" : "var(--text2)",
          transition:"all .15s",
        }}>{isDone ? "✓ Done" : "Mark Done"}</button>
        <button onClick={()=>onToggle("skip")} style={{
          flex:1, padding:"8px 0", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
          border:`1px solid ${isSkip ? "var(--text2)" : "var(--border)"}`,
          background: isSkip ? "var(--bg3)" : "transparent",
          color: isSkip ? "var(--text)" : "var(--text3)",
          transition:"all .15s",
        }}>{isSkip ? "⊘" : "Skip"}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  WEEK VIEW
// ─────────────────────────────────────────────
function WeekView({ state, activeTasks, selectedDate, weekDates, getStatus, setStatus, rangeStats, weekKey, setWeekGoal }) {
  const dates = weekDates(selectedDate);
  const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const today = new Date().toISOString().slice(0,10);
  const wk = weekKey(selectedDate);
  const goal = state.weekGoals[wk] || 70;

  const overallDone = activeTasks.reduce((acc, t) => {
    const s = rangeStats(t.id, dates);
    return s ? acc + s.done : acc;
  }, 0);
  const overallTotal = activeTasks.reduce((acc, t) => {
    const s = rangeStats(t.id, dates);
    return s ? acc + s.total : acc;
  }, 0);
  const overallPct = overallTotal ? Math.round((overallDone/overallTotal)*100) : 0;

  return (
    <div className="fade-up">
      {/* header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22 }}>Weekly Report</div>
          <div style={{ color:"var(--text2)", fontSize:13, marginTop:2 }}>{dates[0]} → {dates[6]}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:"var(--text2)", marginBottom:4 }}>
            Weekly Goal: 
            <select value={goal} onChange={e=>setWeekGoal(wk,Number(e.target.value))}
              style={{ marginLeft:6, background:"var(--bg3)", border:"1px solid var(--border)", color:"var(--text)", padding:"2px 6px", borderRadius:6, fontSize:11 }}>
              {[50,60,70,80,90,100].map(v=><option key={v}>{v}</option>)}
            </select>
            %
          </div>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:24, color: overallPct>=goal?"var(--accent)":"var(--text)" }}>{overallPct}%</div>
          <div style={{ fontSize:11, color:"var(--text2)" }}>{overallDone}/{overallTotal} completions</div>
        </div>
      </div>

      {/* goal bar */}
      <div style={{ marginBottom:24 }}>
        <div style={{ height:6, background:"var(--bg3)", borderRadius:4, overflow:"hidden", position:"relative" }}>
          <div style={{ height:"100%", width:`${overallPct}%`, background:"linear-gradient(90deg,var(--accent2),var(--accent))", borderRadius:4, transition:"width .8s ease" }} />
          <div style={{ position:"absolute", top:-2, left:`${goal}%`, width:2, height:10, background:"var(--text2)", transform:"translateX(-50%)" }} title={`Goal: ${goal}%`} />
        </div>
        <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>▲ goal marker at {goal}%</div>
      </div>

      {/* heat table */}
      {activeTasks.length === 0 ? <EmptyState /> : (
        <div style={{ overflowX:"auto", marginBottom:28 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr>
                <th style={{ padding:"10px 12px", textAlign:"left", color:"var(--text2)", fontWeight:700, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>Task</th>
                {dates.map((d,i) => (
                  <th key={d} style={{ padding:"10px 8px", textAlign:"center", color: d===today?"var(--accent)":"var(--text2)", fontWeight:700, borderBottom:"1px solid var(--border)", fontSize:11 }}>
                    {DAY_LABELS[i]}<br/><span style={{fontSize:9,opacity:.6}}>{d.slice(8)}</span>
                  </th>
                ))}
                <th style={{ padding:"10px 8px", textAlign:"center", color:"var(--text2)", fontWeight:700, borderBottom:"1px solid var(--border)" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {activeTasks.map(task => {
                const stats = rangeStats(task.id, dates);
                return (
                  <tr key={task.id} style={{ borderBottom:"1px solid var(--border)" }}>
                    <td style={{ padding:"10px 12px", whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:task.color }} />
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{task.name}</div>
                          <div style={{ fontSize:10, color:"var(--text3)" }}>{task.category}</div>
                        </div>
                      </div>
                    </td>
                    {dates.map(d => {
                      const s = getStatus(task.id,d);
                      return (
                        <td key={d} style={{ padding:"6px", textAlign:"center" }}>
                          <div onClick={()=>setStatus(task.id,d,s==="done"?"":"done")}
                            title={d===today?"Today":d}
                            style={{
                              width:32, height:32, borderRadius:8, margin:"0 auto",
                              display:"flex", alignItems:"center", justifyContent:"center",
                              cursor:"pointer",
                              background: s==="done" ? task.color : s==="skip" ? "var(--bg3)" : "var(--bg)",
                              border:`1px solid ${d===today ? task.color+"60" : "var(--border)"}`,
                              fontSize:14, fontWeight:700,
                              color: s==="done" ? "#07070e" : "var(--text3)",
                              transition:"all .15s",
                            }}>
                            {s==="done" ? "✓" : s==="skip" ? "—" : ""}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ textAlign:"center", fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:14 }}>
                      {stats ? (
                        <span style={{ color: stats.pct>=80?"var(--accent)":stats.pct>=50?"#ffd166":"#ff6b6b" }}>
                          {stats.pct}%
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* weekly summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
        {activeTasks.map(task => {
          const stats = rangeStats(task.id, dates);
          if (!stats) return null;
          return (
            <div key={task.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:16, borderTop:`2px solid ${task.color}` }}>
              <div style={{ fontWeight:700, fontSize:12, color:task.color, marginBottom:4 }}>{task.name}</div>
              <div style={{ fontFamily:"Syne,sans-serif", fontWeight:900, fontSize:26 }}>{stats.pct}%</div>
              <div style={{ fontSize:11, color:"var(--text3)" }}>{stats.done}/{stats.total} days</div>
              <div style={{ height:3, background:"var(--bg3)", borderRadius:2, marginTop:8 }}>
                <div style={{ height:"100%", width:`${stats.pct}%`, background:task.color, borderRadius:2, transition:"width .8s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MONTH VIEW
// ─────────────────────────────────────────────
function MonthView({ state, activeTasks, selectedDate, monthDates, getStatus, rangeStats }) {
  const dates = monthDates(selectedDate);
  const [y, m] = selectedDate.split("-");
  const monthName = new Date(y, m-1).toLocaleString("en-IN", { month:"long", year:"numeric" });
  const today = new Date().toISOString().slice(0,10);

  const overall = activeTasks.map(t => ({ task:t, stats:rangeStats(t.id,dates) })).filter(x=>x.stats);
  const avgPct = overall.length ? Math.round(overall.reduce((a,x)=>a+x.stats.pct,0)/overall.length) : 0;

  return (
    <div className="fade-up">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22 }}>Monthly Progress</div>
          <div style={{ color:"var(--text2)", fontSize:13, marginTop:2 }}>{monthName}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:28, color:"var(--accent)" }}>{avgPct}%</div>
          <div style={{ fontSize:12, color:"var(--text2)" }}>overall avg</div>
        </div>
      </div>

      {activeTasks.length===0 ? <EmptyState /> : (
        <>
          {/* rings */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginBottom:32 }}>
            {overall.map(({task,stats})=>(
              <div key={task.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:20, textAlign:"center", minWidth:110 }}>
                <Ring pct={stats.pct} color={task.color} size={80} />
                <div style={{ fontWeight:700, fontSize:12, marginTop:10, color:task.color }}>{task.name}</div>
                <div style={{ fontSize:11, color:"var(--text3)" }}>{stats.done} days</div>
              </div>
            ))}
          </div>

          {/* heatmaps */}
          {overall.map(({task,stats})=>(
            <div key={task.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderLeft:`3px solid ${task.color}`, borderRadius:14, padding:18, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div>
                  <span style={{ fontWeight:700, color:task.color }}>{task.name}</span>
                  <span style={{ fontSize:11, color:"var(--text3)", marginLeft:8 }}>{task.category}{task.priority?` · ${task.priority}`:""}</span>
                </div>
                <span style={{ fontFamily:"Syne,sans-serif", fontWeight:800, color: stats.pct>=70?"var(--accent)":stats.pct>=40?"#ffd166":"#ff6b6b" }}>{stats.pct}%</span>
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                {dates.map(d=>{
                  const s = getStatus(task.id,d);
                  return (
                    <div key={d} title={d} style={{
                      width:26, height:26, borderRadius:5,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      background: s==="done" ? task.color : s==="skip" ? "#1e1e2a" : "var(--bg3)",
                      border:`1px solid ${d===today?task.color+"80":"transparent"}`,
                      transition:"all .2s",
                    }}>
                      <span style={{ fontSize:8, color: s==="done"?"#07070e":"var(--text3)", fontWeight:700 }}>{d.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize:11, color:"var(--text3)", marginTop:8 }}>{stats.done}/{stats.total} days · {stats.skip} skipped</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  STATS VIEW
// ─────────────────────────────────────────────
function StatsView({ state, activeTasks, calcStreak, calcLongestStreak, monthDates, weekDates, getStatus, rangeStats }) {
  const today = new Date().toISOString().slice(0,10);
  const thisMonthDates = monthDates(today);
  const thisWeekDates = weekDates(today);

  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // best day of week
  const dayScores = Array(7).fill(0).map((_,i)=>({day:i,done:0,total:0}));
  Object.entries(state.logs).forEach(([date, log]) => {
    const dayIdx = new Date(date).getDay();
    activeTasks.forEach(t => {
      if (log[t.id]==="done") dayScores[dayIdx].done++;
      if (log[t.id]) dayScores[dayIdx].total++;
    });
  });
  const bestDay = dayScores.reduce((a,b) => (b.done>a.done?b:a), dayScores[0]);

  // sparkline data (last 7 days completion %)
  const last7 = Array.from({length:7}, (_,i) => {
    const d = new Date(today); d.setDate(d.getDate()-6+i);
    const key = d.toISOString().slice(0,10);
    const done = activeTasks.filter(t=>getStatus(t.id,key)==="done").length;
    return activeTasks.length ? Math.round((done/activeTasks.length)*100) : 0;
  });

  return (
    <div className="fade-up">
      <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22, marginBottom:24 }}>Analytics & Stats</div>

      {activeTasks.length===0 ? <EmptyState /> : (
        <>
          {/* top summary */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:14, marginBottom:28 }}>
            {[
              { label:"Tasks Active", value:activeTasks.length, icon:"⚡", color:"var(--accent2)" },
              { label:"Done Today", value:activeTasks.filter(t=>getStatus(t.id,today)==="done").length, icon:"✅", color:"var(--accent)" },
              { label:"Best Day", value:DAY_NAMES[bestDay.day], icon:"🏆", color:"#ffd166" },
              { label:"This Week Avg", value:`${Math.round(thisWeekDates.reduce((a,d)=>{const done=activeTasks.filter(t=>getStatus(t.id,d)==="done").length;return a+done;},0)/(thisWeekDates.length*Math.max(activeTasks.length,1))*100)}%`, icon:"📊", color:"#ff7eb3" },
            ].map(s=>(
              <div key={s.label} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:18 }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
                <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* 7-day trend */}
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:20, marginBottom:20 }}>
            <div style={{ fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:14, marginBottom:14 }}>7-Day Completion Trend</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:80 }}>
              {last7.map((v,i)=>{
                const d = new Date(today); d.setDate(d.getDate()-6+i);
                const label = DAY_NAMES[d.getDay()];
                return (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                    <div style={{ fontSize:10, color:"var(--accent)", fontWeight:700 }}>{v>0?`${v}%`:""}</div>
                    <div style={{
                      width:"100%", borderRadius:4,
                      height: `${Math.max(v, 4)}%`,
                      minHeight:4,
                      background: v>=80?"var(--accent)":v>=50?"var(--accent2)":"var(--bg3)",
                      transition:"height .5s ease",
                    }} />
                    <div style={{ fontSize:9, color:"var(--text3)" }}>{label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* per-task streaks */}
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:14, marginBottom:12 }}>Task Streaks & Performance</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {activeTasks.map(task=>{
              const streak = calcStreak(task.id, state.logs);
              const longest = calcLongestStreak(task.id, state.logs);
              const monthStats = rangeStats(task.id, thisMonthDates);
              const weekStats = rangeStats(task.id, thisWeekDates);
              return (
                <div key={task.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderLeft:`3px solid ${task.color}`, borderRadius:14, padding:16 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:task.color }} />
                      <div>
                        <div style={{ fontWeight:700, fontSize:14 }}>{task.name}</div>
                        <div style={{ fontSize:11, color:"var(--text3)" }}>{task.category} · {task.priority||"Medium"} priority</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                      <StatPill icon="🔥" label="Streak" value={`${streak}d`} color="#ffd166" />
                      <StatPill icon="🏆" label="Best" value={`${longest}d`} color="#fb923c" />
                      <StatPill icon="📅" label="This week" value={weekStats?`${weekStats.pct}%`:"—"} color={task.color} />
                      <StatPill icon="🗓" label="This month" value={monthStats?`${monthStats.pct}%`:"—"} color={task.color} />
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

function StatPill({ icon, label, value, color }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:10, color:"var(--text3)", marginBottom:2 }}>{icon} {label}</div>
      <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:15, color }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MANAGE VIEW
// ─────────────────────────────────────────────
function ManageView({ state, activeTasks, onEdit, onArchive, onUnarchive, onDelete }) {
  const archived = state.tasks.filter(t=>t.archived);
  return (
    <div className="fade-up">
      <div style={{ fontFamily:"Syne,sans-serif", fontWeight:800, fontSize:22, marginBottom:6 }}>Manage Tasks</div>
      <div style={{ color:"var(--text2)", fontSize:13, marginBottom:24 }}>{activeTasks.length} active · {archived.length} archived</div>

      {activeTasks.length===0 ? <EmptyState /> : (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:32 }}>
          {activeTasks.map(task=>(
            <div key={task.id} style={{
              background:"var(--bg2)", border:"1px solid var(--border)",
              borderLeft:`3px solid ${task.color}`, borderRadius:14,
              padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10,
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:task.color }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:14 }}>{task.name}</div>
                  <div style={{ fontSize:11, color:"var(--text3)", marginTop:1 }}>
                    {task.category} · <span style={{ color:PRIORITY_COLOR[task.priority]||"var(--text3)" }}>{task.priority||"Medium"}</span>
                    {task.timeEst ? ` · ⏱ ${task.timeEst}` : ""}
                    {` · since ${task.createdAt}`}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <ActionBtn color="#6bceff" bg="rgba(107,206,255,0.1)" onClick={()=>onEdit({...task})}>✏️ Edit</ActionBtn>
                <ActionBtn color="#ffd166" bg="rgba(255,209,102,0.1)" onClick={()=>onArchive(task.id)}>📦 Archive</ActionBtn>
                <ActionBtn color="#ff6b6b" bg="rgba(255,107,107,0.1)" onClick={()=>onDelete(task.id)}>🗑</ActionBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <div style={{ fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:14, color:"var(--text3)", marginBottom:12 }}>Archived Tasks</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {archived.map(task=>(
              <div key={task.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:12, padding:"12px 18px", display:"flex", justifyContent:"space-between", alignItems:"center", opacity:.5, flexWrap:"wrap", gap:8 }}>
                <span style={{ fontSize:13, fontWeight:600 }}>{task.name} <span style={{ color:"var(--text3)", fontWeight:400 }}>— {task.category}</span></span>
                <div style={{ display:"flex", gap:8 }}>
                  <ActionBtn color="var(--accent)" bg="rgba(126,255,160,0.08)" onClick={()=>onUnarchive(task.id)}>♻️ Restore</ActionBtn>
                  <ActionBtn color="#ff6b6b" bg="rgba(255,107,107,0.1)" onClick={()=>onDelete(task.id)}>🗑</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionBtn({ color, bg, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding:"7px 14px", background:bg, color, border:`1px solid ${color}30`, borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
//  EMPTY STATE
// ─────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--text3)" }}>
      <div style={{ fontSize:40, marginBottom:12 }}>⚡</div>
      <div style={{ fontFamily:"Syne,sans-serif", fontWeight:700, fontSize:16, marginBottom:6 }}>No tasks yet</div>
      <div style={{ fontSize:13 }}>Click <b style={{ color:"var(--accent)" }}>＋ Add Task</b> to get started!</div>
    </div>
  );
}
