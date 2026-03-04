import { useEffect, useState } from 'react';
import api from '../api/client';
import type { DashboardStats } from '../types';
import { Smartphone, Send, MessageSquare, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(console.error);
    const interval = setInterval(() => {
      api.get('/dashboard/stats').then(r => setStats(r.data)).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div className="text-slate-400">Cargando...</div>;

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
