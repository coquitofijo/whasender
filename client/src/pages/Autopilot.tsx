import { useEffect, useState } from 'react';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { AutopilotConfig, AutopilotAssignment, Session, ContactList } from '../types';
import { Play, Square, Plus, Trash2, Bot, Clock, Zap, MessageSquare } from 'lucide-react';

interface LogEntry {
  time: string;
  message: string;
  type?: string;
}

const DEFAULT_TEMPLATES = [
  'Hola {nombre}, Pasamos a recordarte que cocos te espera 🌴 La mejor plataforma se renovó para ustedes 🔥 Tenés B0N0 30% disponible ⏱️ Mandá la palabra "2026" y activalo en segundos.',
  'Hola {nombre}, Hace rato no te vemos por cocoss 👀 Arrancamos el año renovados y con beneficios para vos 🌟 Tenés B0N0 30% listo para jugar 🎁 Mandá la palabra "2026" y te lo activamos.',
  'Hola {nombre}, En COCOS siempre hay lugar para volver 🌴 La plataforma se renovó y trae mejoras para vos 🎮 Tenés B0N0 30% esperándote 💬 Mandá la palabra "2026" y volvés a jugar.',
  'Hola {nombre}, COCOS se renovó y queremos que seas parte 🙌 La mejor plataforma vuelve a premiarte 🎁 Tenés B0N0 30% listo para usar 🚀 Mandá la palabra "2026" y arrancá ahora.',
  'Hola {nombre}, Pasamos por acá para invitarte a volver a cocos! 🔥 Este año venimos recargados y con beneficios exclusivos 💎 Tenés B0N0 30% para empezar 📲 Mandá la palabra "2026" y activalo fácil.',
  'Hola {nombre}, 👋 Te extrañamos en COCOS 🌴 Volvé a jugar en la mejor plataforma, este año nos renovamos para ustedes 🔥 Tenés B0N0 30% esperándote. Mandá la palabra "2026" y activalo ahora.',
  'Hola {nombre}, COCOS sigue creciendo y vos sos parte 💎 Este año venimos renovados y con beneficios 🎁 Tenés B0N0 30% listo 🚀 Responde "2026" y empezá a jugar.',
];

export default function Autopilot() {
  const [config, setConfig] = useState<AutopilotConfig | null>(null);
  const [assignments, setAssignments] = useState<AutopilotAssignment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [newSessionId, setNewSessionId] = useState('');
  const [newListId, setNewListId] = useState('');
  const [saving, setSaving] = useState(false);
  const [countdown, setCountdown] = useState('');
  const socket = useSocket();

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!socket) return;

    const onStatus = (data: { status: string }) => {
      setConfig(prev => prev ? { ...prev, status: data.status as AutopilotConfig['status'] } : prev);
    };
    const onCycleStart = (data: { phones: number; messagesPerCycle: number }) => {
      addLog(`Ciclo iniciado: ${data.phones} telefonos, ${data.messagesPerCycle} msgs c/u`, 'info');
    };
    const onCycleEnd = (data: { nextCycleAt: string }) => {
      setConfig(prev => prev ? { ...prev, next_cycle_at: data.nextCycleAt, last_cycle_at: new Date().toISOString() } : prev);
      addLog(`Ciclo completado. Proximo: ${new Date(data.nextCycleAt).toLocaleTimeString()}`, 'success');
    };
    const onMessageSent = (data: any) => {
      const icon = data.status === 'sent' ? 'OK' : 'FAIL';
      addLog(
        `[${icon}] ${data.sessionName} -> ${data.contactName || data.contactPhone} (msg #${data.msgNumber})`,
        data.status === 'sent' ? 'success' : 'error'
      );
    };
    const onLog = (data: { message: string; type?: string }) => addLog(data.message, data.type);
    const onAssignmentRemoved = (data: { sessionId: string; reason: string }) => {
      setAssignments(prev => prev.filter(a => a.session_id !== data.sessionId));
      const reasonText = data.reason === 'banned' ? 'baneado' : 'deslogueado';
      addLog(`Sesion removida del autopilot (${reasonText})`, 'warning');
    };

    socket.on('autopilot:status', onStatus);
    socket.on('autopilot:cycle_start', onCycleStart);
    socket.on('autopilot:cycle_end', onCycleEnd);
    socket.on('autopilot:message_sent', onMessageSent);
    socket.on('autopilot:log', onLog);
    socket.on('autopilot:assignment_removed', onAssignmentRemoved);
    return () => {
      socket.off('autopilot:status', onStatus);
      socket.off('autopilot:cycle_start', onCycleStart);
      socket.off('autopilot:cycle_end', onCycleEnd);
      socket.off('autopilot:message_sent', onMessageSent);
      socket.off('autopilot:log', onLog);
      socket.off('autopilot:assignment_removed', onAssignmentRemoved);
    };
  }, [socket]);

  useEffect(() => {
    if (!config?.next_cycle_at || config.status !== 'running') { setCountdown(''); return; }
    const update = () => {
      const diff = new Date(config.next_cycle_at!).getTime() - Date.now();
      if (diff <= 0) { setCountdown('Iniciando ciclo...'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [config?.next_cycle_at, config?.status]);

  const loadData = async () => {
    try {
      const [autopilotRes, sessRes, listRes, logsRes] = await Promise.all([
        api.get('/autopilot/config'),
        api.get('/sessions'),
        api.get('/contact-lists'),
        api.get('/autopilot/logs?limit=100'),
      ]);
      const cfg = autopilotRes.data.config;
      if (!cfg.message_templates || cfg.message_templates.length === 0) {
        cfg.message_templates = DEFAULT_TEMPLATES;
      }
      setConfig(cfg);
      setAssignments(autopilotRes.data.assignments);
      setSessions(sessRes.data);
      setLists(listRes.data);

      // Load persisted logs (already sorted DESC from API)
      const persistedLogs: LogEntry[] = logsRes.data.map((log: any) => ({
        time: new Date(log.created_at).toLocaleTimeString(),
        message: log.message,
        type: log.type,
      }));
      setLogs(persistedLogs);
    } catch (err) {
      console.error(err);
    }
  };

  const addLog = (message: string, type?: string) => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), message, type }, ...prev.slice(0, 99)]);
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { data } = await api.put('/autopilot/config', {
        message_templates: config.message_templates,
        messages_per_cycle: config.messages_per_cycle,
        cycle_interval_hours: config.cycle_interval_hours,
        delay_between_ms: config.delay_between_ms,
      });
      if (data.message_templates?.length > 0) setConfig(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateTemplate = (idx: number, value: string) => {
    if (!config) return;
    const updated = [...config.message_templates];
    updated[idx] = value;
    setConfig({ ...config, message_templates: updated });
  };

  const addTemplate = () => {
    if (!config) return;
    setConfig({ ...config, message_templates: [...config.message_templates, ''] });
  };

  const removeTemplate = (idx: number) => {
    if (!config || config.message_templates.length <= 1) return;
    setConfig({ ...config, message_templates: config.message_templates.filter((_, i) => i !== idx) });
  };

  const addAssignment = async () => {
    if (!newSessionId || !newListId) return;
    try {
      const { data } = await api.post('/autopilot/assignments', { session_id: newSessionId, list_id: newListId });
      setAssignments(data);
      setNewSessionId('');
      setNewListId('');
    } catch (err) { console.error(err); }
  };

  const removeAssignment = async (sessionId: string) => {
    try {
      const { data } = await api.delete(`/autopilot/assignments/${sessionId}`);
      setAssignments(data);
    } catch (err) { console.error(err); }
  };

  const startAutopilot = async () => {
    await saveConfig();
    await api.post('/autopilot/start');
    addLog('Autopilot iniciado', 'success');
  };

  const stopAutopilot = async () => {
    await api.post('/autopilot/stop');
    addLog('Autopilot detenido', 'warning');
  };

  const isRunning = config?.status === 'running';
  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const assignedSessionIds = new Set(assignments.map(a => a.session_id));
  const availableSessions = connectedSessions.filter(s => !assignedSessionIds.has(s.id));

  if (!config) return <div className="text-slate-400">Cargando...</div>;

  const templates = config.message_templates;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bot size={28} className="text-emerald-400" />
          <div>
            <h2 className="text-2xl font-bold text-white">Autopilot</h2>
            <p className="text-sm text-slate-400">Envio automatico round-robin entre telefonos</p>
          </div>
        </div>
        {isRunning ? (
          <button onClick={stopAutopilot} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Square size={16} /> Detener
          </button>
        ) : (
          <button
            onClick={startAutopilot}
            disabled={assignments.length === 0 || templates.length === 0 || templates.every(t => !t.trim())}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Play size={16} /> Iniciar Autopilot
          </button>
        )}
      </div>

      {isRunning && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-300 font-medium">Autopilot activo</span>
            <span className="text-emerald-400/60 text-sm">
              {assignments.length} tel · {config.messages_per_cycle} msgs/ciclo · {templates.length} templates · cada {config.cycle_interval_hours}h
            </span>
          </div>
          {countdown && (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <Clock size={14} /> Proximo ciclo: {countdown}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Config */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap size={18} className="text-yellow-400" /> Configuracion
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Msgs por ciclo</label>
                <input type="number" value={config.messages_per_cycle}
                  onChange={e => setConfig({ ...config, messages_per_cycle: parseInt(e.target.value) || 20 })}
                  disabled={isRunning} min={1}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Intervalo (hs)</label>
                <input type="number" value={config.cycle_interval_hours}
                  onChange={e => setConfig({ ...config, cycle_interval_hours: parseFloat(e.target.value) || 4 })}
                  disabled={isRunning} min={0.1} step={0.5}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Delay (seg)</label>
                <input type="number" value={config.delay_between_ms / 1000}
                  onChange={e => setConfig({ ...config, delay_between_ms: (parseFloat(e.target.value) || 3) * 1000 })}
                  disabled={isRunning} min={1} step={0.5}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50" />
              </div>
            </div>

            {!isRunning && (
              <button onClick={saveConfig} disabled={saving}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? 'Guardando...' : 'Guardar configuracion'}
              </button>
            )}

            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-500">
              <p><strong className="text-slate-400">Total por ciclo:</strong> {assignments.length * config.messages_per_cycle} msgs en ~{Math.round(assignments.length * config.messages_per_cycle * config.delay_between_ms / 60000)} min</p>
              <p><strong className="text-slate-400">Total por dia:</strong> ~{Math.round(assignments.length * config.messages_per_cycle * (24 / config.cycle_interval_hours))} msgs ({Math.round(config.messages_per_cycle * (24 / config.cycle_interval_hours))} por tel)</p>
              <p className="mt-1"><strong className="text-slate-400">Rotacion:</strong> Tel 1 usa T1, Tel 2 usa T2, etc.</p>
            </div>
          </div>
        </div>

        {/* Assignments */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-lg font-bold text-white mb-4">Asignaciones Telefono → Lista</h3>

          {!isRunning && availableSessions.length > 0 && (
            <div className="flex gap-2 mb-4">
              <select value={newSessionId} onChange={e => setNewSessionId(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                <option value="">Sesion...</option>
                {availableSessions.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.phone ? `+${s.phone}` : '-'})</option>
                ))}
              </select>
              <select value={newListId} onChange={e => setNewListId(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                <option value="">Lista...</option>
                {lists.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.total_count})</option>
                ))}
              </select>
              <button onClick={addAssignment} disabled={!newSessionId || !newListId}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg">
                <Plus size={16} />
              </button>
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-auto">
            {assignments.map((a, idx) => (
              <div key={a.session_id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-sm text-white font-medium">{a.session_name}</p>
                    <p className="text-xs text-slate-400">→ {a.list_name}</p>
                  </div>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                    T{(idx % templates.length) + 1}
                  </span>
                </div>
                {!isRunning && (
                  <button onClick={() => removeAssignment(a.session_id)} className="text-red-400/60 hover:text-red-400 p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {assignments.length === 0 && (
              <p className="text-slate-500 text-center py-6 text-sm">Sin asignaciones.</p>
            )}
          </div>

          {!isRunning && connectedSessions.length === 0 && (
            <p className="text-yellow-400/60 text-xs mt-3">No hay sesiones conectadas.</p>
          )}
        </div>
      </div>

      {/* Templates */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-400" /> Templates ({templates.length})
          </h3>
          {!isRunning && (
            <button onClick={addTemplate} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs">
              <Plus size={14} /> Agregar
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Cada telefono usa un template diferente automaticamente. Variables: {'{nombre}'}, {'{telefono}'}, campos custom del CSV.
        </p>
        <div className="space-y-3">
          {templates.map((t, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-xs text-slate-500 mt-2 w-8 shrink-0">T{idx + 1}</span>
              <textarea
                value={t} onChange={e => updateTemplate(idx, e.target.value)}
                disabled={isRunning} rows={2}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none disabled:opacity-50"
              />
              {!isRunning && templates.length > 1 && (
                <button onClick={() => removeTemplate(idx)} className="text-red-400/60 hover:text-red-400 p-1 self-start mt-1">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-lg font-bold text-white mb-3">Log en tiempo real</h3>
        <div className="bg-slate-950 rounded-lg p-4 h-64 overflow-auto font-mono text-xs space-y-1">
          {logs.length === 0 && <p className="text-slate-600">Esperando actividad...</p>}
          {logs.map((log, i) => (
            <div key={i} className={`${
              log.type === 'success' ? 'text-emerald-400' :
              log.type === 'error' ? 'text-red-400' :
              log.type === 'warning' ? 'text-yellow-400' :
              'text-slate-400'
            }`}>
              <span className="text-slate-600">[{log.time}]</span> {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
