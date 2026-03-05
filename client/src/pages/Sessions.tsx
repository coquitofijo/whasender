import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { Session } from '../types';
import { Plus, Wifi, WifiOff, QrCode, Trash2, X, Shield, AlertTriangle, RotateCcw } from 'lucide-react';

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

    // When a session is banned, update its status in the list immediately
    const handleBanned = (data: { session_id: string }) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === data.session_id
            ? { ...s, status: 'banned' as Session['status'] }
            : s
        )
      );
    };

    socket.on('session:qr', handleQR);
    socket.on('session:status', handleStatus);
    socket.on('session:banned', handleBanned);
    return () => {
      socket.off('session:qr', handleQR);
      socket.off('session:status', handleStatus);
      socket.off('session:banned', handleBanned);
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

  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    connected: { label: 'Conectado', color: 'bg-emerald-500/20 text-emerald-400', dot: 'bg-emerald-400' },
    connecting: { label: 'Conectando...', color: 'bg-yellow-500/20 text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
    qr_ready: { label: 'Esperando QR', color: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400 animate-pulse' },
    disconnected: { label: 'Desconectado', color: 'bg-slate-500/20 text-slate-400', dot: 'bg-slate-400' },
    logged_out: { label: 'Deslogueado', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-400' },
    banned: { label: 'Baneado', color: 'bg-red-500/20 text-red-400', dot: 'bg-red-400' },
    restricted: { label: 'Restringido', color: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  };

  // Group sessions by status category
  const connected = sessions.filter(s => s.status === 'connected');
  const inProgress = sessions.filter(s => s.status === 'connecting' || s.status === 'qr_ready');
  const loggedOut = sessions.filter(s => s.status === 'logged_out' || s.status === 'disconnected');
  const restricted = sessions.filter(s => s.status === 'restricted');
  const banned = sessions.filter(s => s.status === 'banned');

  const unrestrict = async (id: string) => {
    try {
      await api.post(`/sessions/${id}/unrestrict`);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'connected' } : s));
    } catch (err) { console.error(err); }
  };

  const renderSession = (session: Session) => {
    const cfg = statusConfig[session.status] || statusConfig.disconnected;
    return (
      <div key={session.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 flex items-center justify-between hover:border-slate-600 transition-colors">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg ${
            session.status === 'connected' ? 'bg-emerald-500/10' :
            session.status === 'banned' ? 'bg-red-500/10' :
            session.status === 'restricted' ? 'bg-amber-500/10' :
            'bg-slate-800'
          }`}>
            {session.status === 'connected' ? (
              <Wifi size={20} className="text-emerald-400" />
            ) : session.status === 'restricted' ? (
              <AlertTriangle size={20} className="text-amber-400" />
            ) : (
              <WifiOff size={20} className={session.status === 'banned' ? 'text-red-400' : 'text-slate-500'} />
            )}
          </div>
          <div>
            <p className="font-medium text-white">{session.name}</p>
            <p className="text-sm text-slate-400">
              {session.phone ? `+${session.phone}` : 'Sin vincular'}
            </p>
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {session.proxy_url && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400">
              <Shield size={12} /> Proxy
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(session.status === 'disconnected' || session.status === 'logged_out') && (
            <button onClick={() => connect(session.id)} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg text-sm">
              Conectar
            </button>
          )}
          {session.status === 'connected' && (
            <button onClick={() => disconnect(session.id)} className="bg-slate-700 text-slate-300 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-sm">
              Desconectar
            </button>
          )}
          {session.status === 'restricted' && (
            <button onClick={() => unrestrict(session.id)} className="flex items-center gap-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg text-sm">
              <RotateCcw size={14} /> Reactivar
            </button>
          )}
          <button onClick={() => remove(session.id)} className="text-red-400/60 hover:text-red-400 p-1.5">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ icon, title, count, color }: { icon: React.ReactNode; title: string; count: number; color: string }) => (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h3 className={`text-sm font-semibold uppercase tracking-wider ${color}`}>{title}</h3>
      <span className={`text-xs px-2 py-0.5 rounded-full ${color} bg-slate-800`}>{count}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Sesiones WhatsApp</h2>
          <p className="text-sm text-slate-400 mt-1">{sessions.length} sesiones · {connected.length} conectadas</p>
        </div>
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

      {/* Grouped sessions */}
      <div className="space-y-6">
        {/* Conectadas */}
        {connected.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <SectionHeader
              icon={<Wifi size={16} className="text-emerald-400" />}
              title="Conectadas"
              count={connected.length}
              color="text-emerald-400"
            />
            <div className="grid gap-2">{connected.map(renderSession)}</div>
          </div>
        )}

        {/* En proceso (connecting/qr_ready) */}
        {inProgress.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <SectionHeader
              icon={<QrCode size={16} className="text-yellow-400" />}
              title="En proceso"
              count={inProgress.length}
              color="text-yellow-400"
            />
            <div className="grid gap-2">{inProgress.map(renderSession)}</div>
          </div>
        )}

        {/* Deslogueadas */}
        {loggedOut.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <SectionHeader
              icon={<WifiOff size={16} className="text-orange-400" />}
              title="Deslogueadas"
              count={loggedOut.length}
              color="text-orange-400"
            />
            <div className="grid gap-2">{loggedOut.map(renderSession)}</div>
          </div>
        )}

        {/* Restringidas */}
        {restricted.length > 0 && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5">
            <SectionHeader
              icon={<AlertTriangle size={16} className="text-amber-400" />}
              title="Restringidas"
              count={restricted.length}
              color="text-amber-400"
            />
            <p className="text-xs text-amber-400/60 mb-3">Detectamos muchos fallos consecutivos. Revisá el numero y reactivalo si está OK.</p>
            <div className="grid gap-2">{restricted.map(renderSession)}</div>
          </div>
        )}

        {/* Baneadas */}
        {banned.length > 0 && (
          <div className="bg-slate-900 border border-red-500/30 rounded-xl p-5">
            <SectionHeader
              icon={<span className="text-red-400 text-base">⛔</span>}
              title="Baneadas"
              count={banned.length}
              color="text-red-400"
            />
            <div className="grid gap-2">{banned.map(renderSession)}</div>
          </div>
        )}

        {sessions.length === 0 && (
          <p className="text-slate-500 text-center py-12">No hay sesiones. Crea una nueva para empezar.</p>
        )}
      </div>
    </div>
  );
}
