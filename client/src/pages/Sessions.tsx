import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { Session } from '../types';
import { Plus, Wifi, WifiOff, QrCode, Trash2, X, Shield } from 'lucide-react';

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProxy, setNewProxy] = useState('');
  const [qrData, setQrData] = useState<{ sessionId: string; qrDataUrl: string } | null>(null);
  const socket = useSocket();

  const loadSessions = useCallback(() => {
    api.get('/sessions').then(r => setSessions(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!socket) return;

    const handleQR = (data: { sessionId: string; qrDataUrl: string }) => {
      setQrData(data);
    };

    const handleStatus = (data: { sessionId: string; status: string; phone?: string }) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === data.sessionId
            ? { ...s, status: data.status as Session['status'], phone: data.phone || s.phone }
            : s
        )
      );
      if (data.status === 'connected') {
        setQrData(null);
      }
    };

    socket.on('session:qr', handleQR);
    socket.on('session:status', handleStatus);
    return () => {
      socket.off('session:qr', handleQR);
      socket.off('session:status', handleStatus);
    };
  }, [socket]);

  const addSession = async () => {
    if (!newName.trim()) return;
    const { data } = await api.post('/sessions', {
      name: newName,
      proxy_url: newProxy.trim() || undefined,
    });
    setSessions(prev => [data, ...prev]);
    setNewName('');
    setNewProxy('');
    setShowAdd(false);
    // Auto-connect
    await api.post(`/sessions/${data.id}/connect`);
  };

  const connect = async (id: string) => {
    await api.post(`/sessions/${id}/connect`);
  };

  const disconnect = async (id: string) => {
    await api.post(`/sessions/${id}/disconnect`);
    loadSessions();
  };

  const remove = async (id: string) => {
    await api.delete(`/sessions/${id}`);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (qrData?.sessionId === id) setQrData(null);
  };

  const statusColors: Record<string, string> = {
    connected: 'bg-emerald-500/20 text-emerald-400',
    connecting: 'bg-yellow-500/20 text-yellow-400',
    qr_ready: 'bg-blue-500/20 text-blue-400',
    disconnected: 'bg-slate-500/20 text-slate-400',
    logged_out: 'bg-red-500/20 text-red-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Sesiones WhatsApp</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nueva Sesion
        </button>
      </div>

      {/* Add session form */}
      {showAdd && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Nombre de la sesion (ej: Ventas 1)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSession()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              autoFocus
            />
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white px-2">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Proxy (opcional) — http://user:pass@ip:port o socks5://ip:port"
              value={newProxy}
              onChange={e => setNewProxy(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <button onClick={addSession} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap">
              Crear y Conectar
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Formatos de proxy soportados: http://user:pass@ip:port, socks5://ip:port
          </p>
        </div>
      )}

      {/* QR Modal */}
      {qrData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setQrData(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <QrCode size={20} className="text-emerald-400" />
                Escanear QR
              </h3>
              <button onClick={() => setQrData(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Abri WhatsApp &gt; Dispositivos vinculados &gt; Vincular un dispositivo
            </p>
            <div className="bg-white rounded-xl p-4 flex items-center justify-center">
              <img src={qrData.qrDataUrl} alt="QR Code" className="w-64 h-64" />
            </div>
            <p className="text-slate-500 text-xs mt-3 text-center">
              El QR se actualiza automaticamente
            </p>
          </div>
        </div>
      )}

      {/* Sessions list */}
      <div className="grid gap-3">
        {sessions.map(session => (
          <div key={session.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-lg ${session.status === 'connected' ? 'bg-emerald-500/10' : 'bg-slate-800'}`}>
                {session.status === 'connected' ? (
                  <Wifi size={20} className="text-emerald-400" />
                ) : (
                  <WifiOff size={20} className="text-slate-500" />
                )}
              </div>
              <div>
                <p className="font-medium text-white">{session.name}</p>
                <p className="text-sm text-slate-400">
                  {session.phone ? `+${session.phone}` : 'Sin vincular'}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[session.status] || statusColors.disconnected}`}>
                {session.status}
              </span>
              {session.proxy_url && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400">
                  <Shield size={12} /> Proxy
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {session.status === 'disconnected' || session.status === 'logged_out' ? (
                <button onClick={() => connect(session.id)} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-sm">
                  Conectar
                </button>
              ) : session.status === 'connected' ? (
                <button onClick={() => disconnect(session.id)} className="bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-sm">
                  Desconectar
                </button>
              ) : null}
              <button onClick={() => remove(session.id)} className="text-red-400/60 hover:text-red-400 p-1.5">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-slate-500 text-center py-12">No hay sesiones. Crea una nueva para empezar.</p>
        )}
      </div>
    </div>
  );
}
