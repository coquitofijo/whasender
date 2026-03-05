import { useEffect, useState } from 'react';
import api from '../api/client';
import type { DashboardStats, DashboardActivity } from '../types';
import { Smartphone, Send, MessageSquare, Users, ShieldAlert, Bot } from 'lucide-react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

/* ── Dark Tooltip ────────────────────────────────────────── */
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-white font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

/* ── Status color helpers ────────────────────────────────── */
const statusDot: Record<string, string> = {
  connected: 'bg-emerald-400',
  connecting: 'bg-yellow-400 animate-pulse',
  qr_ready: 'bg-blue-400 animate-pulse',
  disconnected: 'bg-slate-500',
  logged_out: 'bg-red-400',
};
const statusBadge: Record<string, string> = {
  connected: 'bg-emerald-500/20 text-emerald-400',
  connecting: 'bg-yellow-500/20 text-yellow-400',
  qr_ready: 'bg-blue-500/20 text-blue-400',
  disconnected: 'bg-slate-500/20 text-slate-400',
  logged_out: 'bg-red-500/20 text-red-400',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [timeView, setTimeView] = useState<'daily' | 'hourly'>('daily');

  const fetchStats = () => {
    setLoading(true);
    setError(null);
    api.get('/dashboard/stats')
      .then(r => { setStats(r.data); setError(null); })
      .catch(() => setError('No se pudo conectar al servidor'))
      .finally(() => { setLoading(false); setRetrying(false); });
  };

  const fetchActivity = () => {
    api.get('/dashboard/activity').then(r => setActivity(r.data)).catch(() => {});
  };

  useEffect(() => {
    fetchStats();
    fetchActivity();
    const statsInterval = setInterval(() => {
      api.get('/dashboard/stats').then(r => { setStats(r.data); setError(null); }).catch(() => {});
    }, 5000);
    const activityInterval = setInterval(fetchActivity, 30000);
    return () => { clearInterval(statsInterval); clearInterval(activityInterval); };
  }, []);

  /* ── Loading / Error states ──────────────────────────── */
  if (loading && !stats) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mb-4" />
      <p>Conectando con el servidor...</p>
      <p className="text-xs text-slate-500 mt-2">El servidor gratuito puede tardar ~30s en despertar</p>
    </div>
  );

  if (error && !stats) return (
    <div className="flex flex-col items-center justify-center h-64">
      <p className="text-red-400 mb-4">{error}</p>
      <button
        onClick={() => { setRetrying(true); fetchStats(); }}
        disabled={retrying}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg transition"
      >
        {retrying ? 'Reintentando...' : 'Reintentar'}
      </button>
      <p className="text-xs text-slate-500 mt-3">El servidor gratuito (Render) se duerme tras 15 min de inactividad</p>
    </div>
  );

  if (!stats) return null;

  const coveragePercent = stats.contactCoverage.total > 0
    ? (stats.contactCoverage.reached / stats.contactCoverage.total * 100)
    : 0;

  /* ── Format chart labels ─────────────────────────────── */
  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };
  const formatHour = (h: string) => {
    const date = new Date(h);
    return `${date.getHours().toString().padStart(2, '0')}:00`;
  };

  const chartData = timeView === 'daily' ? activity?.daily : activity?.hourly;
  const chartKey = timeView === 'daily' ? 'date' : 'hour';
  const chartFormatter = timeView === 'daily' ? formatDate : formatHour;

  /* ── Summary cards ───────────────────────────────────── */
  const cards = [
    { label: 'Sesiones Conectadas', value: `${stats.sessions.connected} / ${stats.sessions.total}`, icon: Smartphone, color: 'text-emerald-400' },
    { label: 'Campanas Activas', value: stats.campaigns.running, icon: Send, color: 'text-blue-400' },
    { label: 'Mensajes Hoy', value: stats.messagesToday.sent, sub: parseInt(stats.messagesToday.failed) > 0 ? `${stats.messagesToday.failed} fallidos` : undefined, icon: MessageSquare, color: 'text-purple-400' },
    { label: 'Contactos Alcanzados', value: `${stats.contactCoverage.reached.toLocaleString()} / ${stats.contactCoverage.total.toLocaleString()}`, icon: Users, color: 'text-amber-400' },
    { label: 'Bans Totales', value: stats.banHistory.length, icon: ShieldAlert, color: stats.banHistory.length > 0 ? 'text-red-400' : 'text-slate-400' },
    { label: 'Autopilot', value: stats.autopilot?.status === 'running' ? 'Activo' : 'Detenido', sub: stats.autopilot?.next_cycle_at ? `Proximo: ${new Date(stats.autopilot.next_cycle_at).toLocaleTimeString()}` : undefined, icon: Bot, color: stats.autopilot?.status === 'running' ? 'text-emerald-400' : 'text-slate-400' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Dashboard</h2>

      {/* ── Summary Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{card.label}</span>
              <card.icon size={16} className={card.color} />
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            {(card as any).sub && (
              <p className="text-xs text-slate-500 mt-1">{(card as any).sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Row 2: Messages per session + Session health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Messages per session */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Mensajes por Sesion (24h)</h3>
          {stats.messagesPerSession.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.messagesPerSession} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="session_name" tick={{ fill: '#94a3b8', fontSize: 11 }} interval={0} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="sent" name="Enviados" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" name="Fallidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-12 text-sm">Sin sesiones creadas</p>
          )}
        </div>

        {/* Session health */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Estado de Sesiones</h3>
          {stats.messagesPerSession.length > 0 ? (
            <div className="space-y-2 max-h-[260px] overflow-auto">
              {stats.messagesPerSession.map(s => (
                <div key={s.session_id} className="flex items-center gap-3 bg-slate-800/50 rounded-lg px-4 py-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${statusDot[s.session_status] || 'bg-slate-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{s.session_name}</p>
                    <p className="text-xs text-slate-400">{s.phone ? `+${s.phone}` : 'Sin numero'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusBadge[s.session_status] || 'bg-slate-500/20 text-slate-400'}`}>
                      {s.session_status}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{s.sent} env / {s.failed} fail</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-12 text-sm">Sin sesiones creadas</p>
          )}
        </div>
      </div>

      {/* ── Row 3: Activity chart (full width) ──────── */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-slate-300">Actividad de Mensajes</h3>
          <div className="flex gap-1 bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTimeView('daily')}
              className={`px-3 py-1 rounded-md text-xs transition ${timeView === 'daily' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              7 dias
            </button>
            <button
              onClick={() => setTimeView('hourly')}
              className={`px-3 py-1 rounded-md text-xs transition ${timeView === 'hourly' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
            >
              24 horas
            </button>
          </div>
        </div>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey={chartKey} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={chartFormatter} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip content={<DarkTooltip />} labelFormatter={chartFormatter} />
              <Area type="monotone" dataKey="sent" name="Enviados" stroke="#10b981" fill="url(#sentGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="failed" name="Fallidos" stroke="#ef4444" fill="url(#failGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-center py-16 text-sm">Sin datos de actividad todavia</p>
        )}
      </div>

      {/* ── Row 4: Ban history + Contact coverage ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ban history */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Historial de Bans</h3>
          {stats.banHistory.length > 0 ? (
            <div className="space-y-3 max-h-52 overflow-auto">
              {stats.banHistory.map(ban => (
                <div key={ban.id} className="border-l-2 border-red-500/30 pl-4 py-1">
                  <p className="text-sm text-red-400 font-medium">
                    {ban.reason === 'banned' ? 'Baneado' : 'Ban Temporal'}
                    {' — '}
                    <span className="text-white">{ban.session_name}</span>
                    {ban.phone && <span className="text-red-300 ml-1">(+{ban.phone})</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    Codigo {ban.status_code} · {new Date(ban.created_at).toLocaleDateString()} {new Date(ban.created_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8 text-sm">Sin bans registrados</p>
          )}
        </div>

        {/* Contact coverage */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Cobertura de Contactos</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Progreso total</span>
                <span className="text-white font-medium">{Math.round(coveragePercent)}%</span>
              </div>
              <div className="bg-slate-800 rounded-full h-4">
                <div
                  className="bg-amber-500 h-4 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(coveragePercent, 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-amber-400">{stats.contactCoverage.reached.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">Alcanzados</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-slate-400">{(stats.contactCoverage.total - stats.contactCoverage.reached).toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">Pendientes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
