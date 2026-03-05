import { useEffect, useState } from 'react';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { BanAlert } from '../types';
import { ShieldAlert, AlertTriangle, X } from 'lucide-react';

export default function BanAlerts() {
  const [alerts, setAlerts] = useState<BanAlert[]>([]);
  const socket = useSocket();

  useEffect(() => {
    api.get('/ban-alerts').then(r => setAlerts(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleBan = (data: any) => {
      setAlerts(prev => [{ ...data, dismissed: false }, ...prev]);
    };

    socket.on('session:banned', handleBan);
    return () => { socket.off('session:banned', handleBan); };
  }, [socket]);

  const dismiss = async (id: string) => {
    await api.post(`/ban-alerts/${id}/dismiss`).catch(() => {});
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {alerts.map(alert => {
        const isRestricted = alert.reason === 'restricted';
        return (
          <div
            key={alert.id}
            className={`${isRestricted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-xl p-4 flex items-center justify-between`}
          >
            <div className="flex items-center gap-3">
              {isRestricted ? (
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0" />
              ) : (
                <ShieldAlert size={20} className="text-red-400 flex-shrink-0" />
              )}
              <div>
                <p className={`${isRestricted ? 'text-amber-400' : 'text-red-400'} font-medium text-sm`}>
                  {alert.reason === 'banned' ? 'Numero Baneado' :
                   alert.reason === 'restricted' ? 'Numero Restringido' :
                   'Ban Temporal por Spam'}
                  {' — '}
                  <span className="text-white">{alert.session_name}</span>
                  {alert.phone && <span className={`${isRestricted ? 'text-amber-300' : 'text-red-300'} ml-1`}>(+{alert.phone})</span>}
                </p>
                <p className={`${isRestricted ? 'text-amber-400/60' : 'text-red-400/60'} text-xs mt-0.5`}>
                  {isRestricted
                    ? `Muchos fallos consecutivos · Removido del autopilot · ${new Date(alert.created_at).toLocaleString()}`
                    : `Codigo ${alert.status_code} · Removida del autopilot · ${new Date(alert.created_at).toLocaleString()}`
                  }
                </p>
              </div>
            </div>
            <button
              onClick={() => dismiss(alert.id)}
              className={`${isRestricted ? 'text-amber-400/50 hover:text-amber-400' : 'text-red-400/50 hover:text-red-400'} p-1 flex-shrink-0`}
              title="Descartar alerta"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
