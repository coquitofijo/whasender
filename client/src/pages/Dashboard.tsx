import { useEffect, useState } from 'react';
import api from '../api/client';
import type { DashboardStats } from '../types';
import { Smartphone, Send, MessageSquare, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchStats = () => {
    setLoading(true);
    setError(null);
    api.get('/dashboard/stats')
      .then(r => { setStats(r.data); setError(null); })
      .catch(() => setError('No se pudo conectar al servidor'))
      .finally(() => { setLoading(false); setRetrying(false); });
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      api.get('/dashboard/stats').then(r => { setStats(r.data); setError(null); }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const cards = [
    { label: 'Sesiones Conectadas', value: `${stats.sessions.connected} / ${stats.sessions.total}`, icon: Smartphone, color: 'text-emerald-400' },
    { label: 'Campanas Activas', value: stats.campaigns.running, icon: Send, color: 'text-blue-400' },
    { label: 'Mensajes Hoy', value: stats.messagesToday.sent, icon: MessageSquare, color: 'text-purple-400' },
    { label: 'Campanas Completadas', value: stats.campaigns.completed, icon: CheckCircle, color: 'text-amber-400' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-slate-900 rounded-xl border border-slate-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">{card.label}</span>
              <card.icon size={20} className={card.color} />
            </div>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {parseInt(stats.messagesToday.failed) > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-red-400 text-sm">
            {stats.messagesToday.failed} mensajes fallidos en las ultimas 24 horas
          </p>
        </div>
      )}
    </div>
  );
}
