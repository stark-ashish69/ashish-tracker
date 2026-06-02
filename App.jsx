import { useState, useEffect, useCallback } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────
const TODAY = () => new Date().toISOString().slice(0, 10);
const KEY = "ashish_tasktracker_v2";

const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

const emptyState = () => ({
  tasks: [],          // { id, name, category, color, createdAt, archived }
  logs: {},           // { "YYYY-MM-DD": { taskId: "done"|"skip"|"" } }
  nextId: 1,
});

const CATS = ["Skill", "Health", "Work", "Personal", "Reading", "Fitness", "Other"];
const COLORS = ["#6EE7B7","#93C5FD","#FCA5A5","#FDE68A","#C4B5FD","#FB923C","#F9A8D4","#67E8F9"];

const weeks = (date) => {
  const d = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
};

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

const fmt = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
};

// ── main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState(() => load() || emptyState());
  const [view, setView] = useState("day");       // day | week | month | tasks
  const [selectedDate, setSelectedDate] = useState(TODAY());
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState(null); // task obj being edited
  const [newTask, setNewTask] = useState({ name: "", category: "Skill", color: COLORS[0] });
  const [toast, setToast] = useState("");

  useEffect(() => { save(state); }, [state]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // active tasks (not archived)
  const activeTasks = state.tasks.filter(t => !t.archived);

  // ── task CRUD ──
  const addTask = () => {
    if (!newTask.name.trim()) return;
    setState(s => ({
      ...s,
      tasks: [...s.tasks, { id: s.nextId, ...newTask, name: newTask.name.trim(), createdAt: TODAY(), archived: false }],
      nextId: s.nextId + 1,
    }));
    setNewTask({ name: "", category: "Skill", color: COLORS[0] });
    setShowAdd(false);
    showToast("Task added ✓");
  };

  const saveEdit = () => {
    setState(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === editTask.id ? { ...editTask } : t),
    }));
    setEditTask(null);
    showToast("Task updated ✓");
  };

  const archiveTask = (id) => {
    setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archived: true } : t) }));
    showToast("Task archived");
  };

  const deleteTask = (id) => {
    setState(s => ({
      ...s,
      tasks: s.tasks.filter(t => t.id !== id),
      logs: Object.fromEntries(Object.entries(s.logs).map(([d, v]) => {
        const copy = { ...v }; delete copy[id]; return [d, copy];
      }))
    }));
    showToast("Task deleted");
  };

  // ── log toggle ──
  const toggleLog = (taskId, date, status) => {
    setState(s => {
      const dayLog = { ...(s.logs[date] || {}) };
      dayLog[taskId] = dayLog[taskId] === status ? "" : status;
      return { ...s, logs: { ...s.logs, [date]: dayLog } };
    });
  };

  const getStatus = (taskId, date) => (state.logs[date] || {})[taskId] || "";

  // ── stats helpers ──
  const taskCompletionForRange = (taskId, dates) => {
    const relevant = dates.filter(d => {
      const task = state.tasks.find(t => t.id === taskId);
      return task && d >= task.createdAt;
    });
    if (!relevant.length) return null;
    const done = relevant.filter(d => getStatus(taskId, d) === "done").length;
    return { done, total: relevant.length, pct: Math.round((done / relevant.length) * 100) };
  };

  const weekDates = (refDate) => {
    const d = new Date(refDate);
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(mon); x.setDate(mon.getDate() + i);
      return x.toISOString().slice(0, 10);
    });
  };

  const monthDates = (refDate) => {
    const [y, m] = refDate.split("-").map(Number);
    const days = daysInMonth(y, m - 1);
    return Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* grain overlay */}
      <div style={S.grain} />

      {/* HEADER */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logo}>⬡</span>
          <div>
            <div style={S.appName}>STARK TRACKER</div>
            <div style={S.appSub}>Daily · Weekly · Monthly Tracker</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={S.datePick} />
          <button style={S.addBtn} onClick={() => setShowAdd(true)}>＋ Add Task</button>
        </div>
      </header>

      {/* NAV */}
      <nav style={S.nav}>
        {[["day","📅 Day"],["week","📊 Week"],["month","🗓 Month"],["tasks","⚙️ Manage"]].map(([v,label]) => (
          <button key={v} style={{ ...S.navBtn, ...(view===v ? S.navActive : {}) }} onClick={() => setView(v)}>{label}</button>
        ))}
      </nav>

      {/* VIEWS */}
      <main style={S.main}>
        {view === "day"   && <DayView   activeTasks={activeTasks} selectedDate={selectedDate} getStatus={getStatus} toggleLog={toggleLog} fmt={fmt} />}
        {view === "week"  && <WeekView  activeTasks={activeTasks} weekDates={weekDates} selectedDate={selectedDate} getStatus={getStatus} toggleLog={toggleLog} taskCompletionForRange={taskCompletionForRange} />}
        {view === "month" && <MonthView activeTasks={activeTasks} monthDates={monthDates} selectedDate={selectedDate} getStatus={getStatus} taskCompletionForRange={taskCompletionForRange} />}
        {view === "tasks" && <TasksView activeTasks={activeTasks} archivedTasks={state.tasks.filter(t=>t.archived)} onEdit={setEditTask} onArchive={archiveTask} onDelete={deleteTask} />}
      </main>

      {/* ADD MODAL */}
      {showAdd && (
        <Modal title="Add New Task" onClose={() => setShowAdd(false)}>
          <label style={S.label}>Task Name</label>
          <input style={S.input} placeholder="e.g. Learn React, Morning Run…" value={newTask.name}
            onChange={e => setNewTask(n => ({...n, name: e.target.value}))}
            onKeyDown={e => e.key === "Enter" && addTask()} autoFocus />
          <label style={S.label}>Category</label>
          <select style={S.input} value={newTask.category} onChange={e => setNewTask(n => ({...n, category: e.target.value}))}>
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          <label style={S.label}>Color Tag</label>
          <div style={S.colorRow}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setNewTask(n => ({...n, color: c}))}
                style={{ ...S.colorDot, background: c, outline: newTask.color===c ? "3px solid #fff" : "none" }} />
            ))}
          </div>
          <button style={S.modalBtn} onClick={addTask}>Add Task →</button>
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editTask && (
        <Modal title="Edit Task" onClose={() => setEditTask(null)}>
          <label style={S.label}>Task Name</label>
          <input style={S.input} value={editTask.name}
            onChange={e => setEditTask(t => ({...t, name: e.target.value}))} autoFocus />
          <label style={S.label}>Category</label>
          <select style={S.input} value={editTask.category} onChange={e => setEditTask(t => ({...t, category: e.target.value}))}>
            {CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          <label style={S.label}>Color Tag</label>
          <div style={S.colorRow}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setEditTask(t => ({...t, color: c}))}
                style={{ ...S.colorDot, background: c, outline: editTask.color===c ? "3px solid #fff" : "none" }} />
            ))}
          </div>
          <button style={S.modalBtn} onClick={saveEdit}>Save Changes →</button>
        </Modal>
      )}

      {/* TOAST */}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── DAY VIEW ─────────────────────────────────────────────────────────────────
function DayView({ activeTasks, selectedDate, getStatus, toggleLog, fmt }) {
  const done = activeTasks.filter(t => getStatus(t.id, selectedDate) === "done").length;
  const total = activeTasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;

  return (
    <div>
      <div style={S.viewTitle}>
        <span>{fmt(selectedDate)}</span>
        <span style={S.viewSub}>{done}/{total} completed · {pct}%</span>
      </div>
      <div style={S.progressBar}><div style={{ ...S.progressFill, width: `${pct}%` }} /></div>

      {activeTasks.length === 0 && <Empty />}

      <div style={S.taskGrid}>
        {activeTasks.map(task => {
          const status = getStatus(task.id, selectedDate);
          return (
            <div key={task.id} style={{ ...S.taskCard, borderLeft: `4px solid ${task.color}` }}>
              <div style={S.taskCardTop}>
                <span style={{ ...S.dot, background: task.color }} />
                <div>
                  <div style={S.taskName}>{task.name}</div>
                  <div style={S.taskCat}>{task.category}</div>
                </div>
              </div>
              <div style={S.btnRow}>
                <button style={{ ...S.statusBtn, ...(status==="done" ? S.btnDone : {}) }}
                  onClick={() => toggleLog(task.id, selectedDate, "done")}>
                  {status==="done" ? "✓ Done" : "Mark Done"}
                </button>
                <button style={{ ...S.statusBtn, ...(status==="skip" ? S.btnSkip : {}) }}
                  onClick={() => toggleLog(task.id, selectedDate, "skip")}>
                  {status==="skip" ? "⊘ Skipped" : "Skip"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
function WeekView({ activeTasks, weekDates, selectedDate, getStatus, toggleLog, taskCompletionForRange }) {
  const dates = weekDates(selectedDate);
  const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  return (
    <div>
      <div style={S.viewTitle}>
        <span>Weekly Report</span>
        <span style={S.viewSub}>{dates[0]} → {dates[6]}</span>
      </div>

      {activeTasks.length === 0 && <Empty />}

      {/* heat grid */}
      <div style={{ overflowX: "auto" }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Task</th>
              {dates.map((d,i) => (
                <th key={d} style={{ ...S.th, color: d===TODAY() ? "#6EE7B7" : "#888" }}>
                  {dayNames[i]}<br/><span style={{fontSize:10}}>{d.slice(8)}</span>
                </th>
              ))}
              <th style={S.th}>Week %</th>
            </tr>
          </thead>
          <tbody>
            {activeTasks.map(task => {
              const stats = taskCompletionForRange(task.id, dates);
              return (
                <tr key={task.id}>
                  <td style={S.td}>
                    <span style={{ ...S.dot, background: task.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{task.name}</span>
                    <div style={{ fontSize: 11, color: "#888" }}>{task.category}</div>
                  </td>
                  {dates.map(d => {
                    const s = getStatus(task.id, d);
                    return (
                      <td key={d} style={S.td} onClick={() => toggleLog(task.id, d, s==="done"?"":"done")}>
                        <div style={{ ...S.cell, background: s==="done" ? task.color : s==="skip" ? "#333" : "#1a1a1a",
                          border: d===TODAY() ? `1px solid ${task.color}` : "1px solid #2a2a2a" }}>
                          {s==="done" ? "✓" : s==="skip" ? "–" : ""}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ ...S.td, textAlign: "center" }}>
                    {stats ? (
                      <span style={{ color: stats.pct>=70?"#6EE7B7":stats.pct>=40?"#FDE68A":"#FCA5A5", fontWeight:700 }}>
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

      {/* weekly summary cards */}
      <div style={S.summaryGrid}>
        {activeTasks.map(task => {
          const stats = taskCompletionForRange(task.id, dates);
          if (!stats) return null;
          return (
            <div key={task.id} style={{ ...S.summaryCard, borderTop: `3px solid ${task.color}` }}>
              <div style={{ color: task.color, fontWeight: 700, fontSize: 13 }}>{task.name}</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{stats.pct}%</div>
              <div style={{ fontSize: 11, color: "#888" }}>{stats.done} of {stats.total} days</div>
              <div style={S.miniBar}><div style={{ ...S.miniFill, width:`${stats.pct}%`, background: task.color }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MONTH VIEW ────────────────────────────────────────────────────────────────
function MonthView({ activeTasks, monthDates, selectedDate, getStatus, taskCompletionForRange }) {
  const dates = monthDates(selectedDate);
  const [y, m] = selectedDate.split("-");
  const monthName = new Date(y, m-1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  const overall = activeTasks.map(task => {
    const stats = taskCompletionForRange(task.id, dates);
    return { task, stats };
  }).filter(x => x.stats);

  const avgPct = overall.length ? Math.round(overall.reduce((a,x) => a + x.stats.pct, 0) / overall.length) : 0;

  return (
    <div>
      <div style={S.viewTitle}>
        <span>Monthly Progress — {monthName}</span>
        <span style={S.viewSub}>Overall avg: {avgPct}%</span>
      </div>

      {activeTasks.length === 0 && <Empty />}

      {/* big progress rings row */}
      <div style={S.ringRow}>
        {overall.map(({ task, stats }) => (
          <div key={task.id} style={S.ringCard}>
            <Ring pct={stats.pct} color={task.color} />
            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 8, color: "#ddd" }}>{task.name}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{task.done} days done</div>
          </div>
        ))}
      </div>

      {/* monthly heatmap per task */}
      {overall.map(({ task, stats }) => (
        <div key={task.id} style={{ ...S.heatSection, borderLeft: `3px solid ${task.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontWeight: 700, color: task.color }}>{task.name}</span>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>{task.category}</span>
            </div>
            <span style={{ fontWeight: 800, color: stats.pct>=70?"#6EE7B7":stats.pct>=40?"#FDE68A":"#FCA5A5" }}>{stats.pct}%</span>
          </div>
          <div style={S.heatGrid}>
            {dates.map(d => {
              const s = getStatus(task.id, d);
              return (
                <div key={d} title={d} style={{
                  ...S.heatCell,
                  background: s==="done" ? task.color : s==="skip" ? "#2a2a2a" : "#111",
                  opacity: s==="done" ? 1 : 0.5,
                }}>
                  <span style={{ fontSize: 9, color: s==="done"?"#000":"#555" }}>{d.slice(8)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>{stats.done}/{stats.total} days · {stats.pct}% completion</div>
        </div>
      ))}
    </div>
  );
}

// ── TASKS MANAGE ──────────────────────────────────────────────────────────────
function TasksView({ activeTasks, archivedTasks, onEdit, onArchive, onDelete }) {
  return (
    <div>
      <div style={S.viewTitle}><span>Manage Tasks</span><span style={S.viewSub}>{activeTasks.length} active</span></div>

      {activeTasks.length === 0 && <Empty />}

      <div style={S.manageList}>
        {activeTasks.map(task => (
          <div key={task.id} style={{ ...S.manageCard, borderLeft: `4px solid ${task.color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...S.dot, background: task.color, width: 12, height: 12 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{task.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{task.category} · since {task.createdAt}</div>
              </div>
            </div>
            <div style={S.manageActions}>
              <button style={S.editBtn} onClick={() => onEdit({...task})}>✏️ Edit</button>
              <button style={S.archiveBtn} onClick={() => onArchive(task.id)}>📦 Archive</button>
              <button style={S.deleteBtn} onClick={() => { if(confirm("Delete permanently?")) onDelete(task.id); }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {archivedTasks.length > 0 && (
        <>
          <div style={{ ...S.viewTitle, marginTop: 32, fontSize: 14, color: "#555" }}>
            Archived Tasks ({archivedTasks.length})
          </div>
          <div style={S.manageList}>
            {archivedTasks.map(task => (
              <div key={task.id} style={{ ...S.manageCard, opacity: 0.5, borderLeft: `4px solid #444` }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{task.name} <span style={{ fontSize: 11, color: "#666" }}>— {task.category}</span></div>
                <button style={S.deleteBtn} onClick={() => { if(confirm("Delete permanently?")) onDelete(task.id); }}>🗑</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── RING SVG ──────────────────────────────────────────────────────────────────
function Ring({ pct, color }) {
  const r = 30, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={80} height={80} viewBox="0 0 80 80">
      <circle cx={40} cy={40} r={r} fill="none" stroke="#222" strokeWidth={8} />
      <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 40 40)" />
      <text x={40} y={45} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800}>{pct}%</text>
    </svg>
  );
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{title}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty() {
  return <div style={S.empty}>No tasks yet. Click <b>＋ Add Task</b> to get started!</div>;
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight:"100vh", background:"#0a0a0a", color:"#e8e8e8", fontFamily:"'DM Mono', 'Courier New', monospace", position:"relative", overflow:"hidden" },
  grain: { position:"fixed", inset:0, backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`, pointerEvents:"none", zIndex:0 },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 28px", borderBottom:"1px solid #1e1e1e", background:"#0d0d0d", position:"relative", zIndex:1 },
  headerLeft: { display:"flex", alignItems:"center", gap:12 },
  logo: { fontSize:28, color:"#6EE7B7" },
  appName: { fontSize:20, fontWeight:900, letterSpacing:4, color:"#f0f0f0" },
  appSub: { fontSize:10, color:"#555", letterSpacing:2 },
  headerRight: { display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" },
  datePick: { background:"#111", border:"1px solid #2a2a2a", color:"#ccc", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit" },
  addBtn: { background:"#6EE7B7", color:"#0a0a0a", border:"none", padding:"9px 18px", borderRadius:6, fontWeight:800, fontSize:13, cursor:"pointer", letterSpacing:1 },
  nav: { display:"flex", gap:0, borderBottom:"1px solid #1a1a1a", background:"#0d0d0d", position:"relative", zIndex:1 },
  navBtn: { flex:1, padding:"13px 0", background:"transparent", border:"none", color:"#555", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:1, borderBottom:"2px solid transparent", transition:"all .2s" },
  navActive: { color:"#6EE7B7", borderBottom:"2px solid #6EE7B7" },
  main: { padding:"24px 20px", maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1 },
  viewTitle: { display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16, paddingBottom:10, borderBottom:"1px solid #1a1a1a" },
  viewSub: { fontSize:12, color:"#555" },
  progressBar: { height:4, background:"#1a1a1a", borderRadius:2, marginBottom:24, overflow:"hidden" },
  progressFill: { height:"100%", background:"linear-gradient(90deg,#6EE7B7,#93C5FD)", borderRadius:2, transition:"width .5s ease" },
  taskGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14, marginTop:16 },
  taskCard: { background:"#111", borderRadius:10, padding:"16px 14px", border:"1px solid #1e1e1e" },
  taskCardTop: { display:"flex", alignItems:"flex-start", gap:10, marginBottom:14 },
  dot: { width:10, height:10, borderRadius:"50%", flexShrink:0, marginTop:4 },
  taskName: { fontWeight:700, fontSize:14, lineHeight:1.3 },
  taskCat: { fontSize:11, color:"#666", marginTop:2 },
  btnRow: { display:"flex", gap:8 },
  statusBtn: { flex:1, padding:"7px 0", border:"1px solid #2a2a2a", background:"transparent", color:"#777", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s", letterSpacing:.5 },
  btnDone: { background:"#6EE7B7", color:"#0a0a0a", border:"1px solid #6EE7B7" },
  btnSkip: { background:"#2a2a2a", color:"#aaa", border:"1px solid #333" },
  // table
  table: { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th: { padding:"10px 8px", color:"#888", fontWeight:700, textAlign:"center", borderBottom:"1px solid #1e1e1e", whiteSpace:"nowrap", letterSpacing:.5 },
  td: { padding:"8px", borderBottom:"1px solid #111", textAlign:"center", cursor:"pointer" },
  cell: { width:28, height:28, borderRadius:5, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto", fontSize:13, fontWeight:700, cursor:"pointer", transition:"transform .1s" },
  // summary cards
  summaryGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:12, marginTop:24 },
  summaryCard: { background:"#111", borderRadius:10, padding:"14px", border:"1px solid #1e1e1e" },
  miniBar: { height:3, background:"#1a1a1a", borderRadius:2, marginTop:8, overflow:"hidden" },
  miniFill: { height:"100%", borderRadius:2, transition:"width .5s ease" },
  // ring row
  ringRow: { display:"flex", flexWrap:"wrap", gap:16, marginBottom:24 },
  ringCard: { background:"#111", borderRadius:10, padding:"16px", border:"1px solid #1e1e1e", textAlign:"center", minWidth:100 },
  // heat
  heatSection: { background:"#0f0f0f", borderRadius:10, padding:"16px", marginBottom:14, border:"1px solid #1a1a1a" },
  heatGrid: { display:"flex", flexWrap:"wrap", gap:4 },
  heatCell: { width:28, height:28, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", transition:"opacity .2s" },
  // manage
  manageList: { display:"flex", flexDirection:"column", gap:10 },
  manageCard: { background:"#111", borderRadius:10, padding:"14px 16px", border:"1px solid #1e1e1e", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 },
  manageActions: { display:"flex", gap:8 },
  editBtn: { padding:"6px 12px", background:"#1e2a20", color:"#6EE7B7", border:"1px solid #2a3a2a", borderRadius:6, fontSize:12, cursor:"pointer", fontWeight:700 },
  archiveBtn: { padding:"6px 12px", background:"#1e1e28", color:"#93C5FD", border:"1px solid #2a2a3a", borderRadius:6, fontSize:12, cursor:"pointer", fontWeight:700 },
  deleteBtn: { padding:"6px 10px", background:"#281e1e", color:"#FCA5A5", border:"1px solid #3a2a2a", borderRadius:6, fontSize:12, cursor:"pointer" },
  // modal
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, backdropFilter:"blur(4px)" },
  modal: { background:"#111", border:"1px solid #222", borderRadius:14, padding:"24px", width:"min(90vw,400px)", boxShadow:"0 30px 80px rgba(0,0,0,.8)" },
  modalHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 },
  closeBtn: { background:"transparent", border:"none", color:"#666", fontSize:18, cursor:"pointer" },
  label: { display:"block", fontSize:11, color:"#888", fontWeight:700, letterSpacing:1, marginBottom:5, marginTop:14 },
  input: { width:"100%", background:"#0d0d0d", border:"1px solid #2a2a2a", color:"#e0e0e0", padding:"10px 12px", borderRadius:7, fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" },
  colorRow: { display:"flex", gap:10, flexWrap:"wrap", marginTop:4 },
  colorDot: { width:26, height:26, borderRadius:"50%", cursor:"pointer", transition:"transform .15s", outlineOffset:3 },
  modalBtn: { marginTop:20, width:"100%", padding:"11px", background:"#6EE7B7", color:"#0a0a0a", border:"none", borderRadius:8, fontWeight:800, fontSize:14, cursor:"pointer", letterSpacing:1 },
  // toast
  toast: { position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"#6EE7B7", color:"#0a0a0a", padding:"10px 24px", borderRadius:8, fontWeight:800, fontSize:13, zIndex:200, letterSpacing:1, boxShadow:"0 8px 30px rgba(0,0,0,.5)" },
  empty: { textAlign:"center", color:"#444", padding:"40px 0", fontSize:14 },
};
