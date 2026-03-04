import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { Campaign, MessageLog } from '../types';
import { Play, Pause, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [currentContact, setCurrentContact] = useState<{ phone: string; name: string } | null>(null);
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    api.get(`/campaigns/${id}`).then(r => setCampaign(r.data)).catch(console.error);
    loadLogs(1);
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return;

    const handleProgress = (data: { campaignId: string; sent: number; failed: number; total: number; currentContact: { phone: string; name: string } }) => {
      if (data.campaignId !== id) return;
      setCampaign(prev => prev ? { ...prev, sent_count: data.sent, failed_count: data.failed, total_contacts: data.total } : prev);
      setCurrentContact(data.currentContact);
    };

    const handleStatus = (data: { campaignId: string; status: string }) => {
      if (data.campaignId !== id) return;
      setCampaign(prev => prev ? { ...prev, status: data.status as Campaign['status'] } : prev);
      if (data.status === 'completed' || data.status === 'paused') {
        setCurrentContact(null);
      }
    };

    const handleMessageSent = (data: { campaignId: string; phone: string; name: string; status: string }) => {
      if (data.campaignId !== id) return;
      // Refresh logs
      loadLogs(1);
    };

    socket.on('campaign:progress', handleProgress);
    socket.on('campaign:status', handleStatus);
    socket.on('campaign:message_sent', handleMessageSent);
    return () => {
      socket.off('campaign:progress', handleProgress);
      socket.off('campaign:status', handleStatus);
      socket.off('campaign:message_sent', handleMessageSent);
    };
  }, [socket, id]);

  const loadLogs = async (page: number) => {
    if (!id) return;
    const { data } = await api.get(`/campaigns/${id}/logs?page=${page}&limit=20`);
    setLogs(data.logs);
    setLogsTotal(data.total);
    setLogsPage(page);
  };

  const startCampaign = async () => {
    if (!id) return;
    await api.post(`/campaigns/${id}/start`);
  };

  const pauseCampaign = async () => {
    if (!id) return;
    await api.post(`/campaigns/${id}/pause`);
  };

  if (!campaign) return <div className="text-slate-400">Cargando...</div>;

  const progress = campaign.total_contacts > 0
    ? ((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100
    : 0;

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-500/20 text-slate-400',
    running: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  return (
    <div>
      <button onClick={() => navigate('/campaigns')} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm">
        <ArrowLeft size={16} /> Volver a campanas
      </button>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {campaign.session_name} ({campaign.session_phone ? `+${campaign.session_phone}` : 'sin numero'}) → {campaign.list_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-4 py-1.5 rounded-full text-sm font-medium ${statusColors[campaign.status]}`}>
              {campaign.status}
            </span>
            {(campaign.status === 'draft' || campaign.status === 'paused') && (
              <button onClick={startCampaign} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Play size={16} /> {campaign.status === 'paused' ? 'Retomar' : 'Iniciar'}
              </button>
            )}
            {campaign.status === 'running' && (
              <button onClick={pauseCampaign} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Pause size={16} /> Pausar
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Progreso</span>
            <span className="text-white font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="bg-slate-800 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${campaign.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-6 mt-3 text-sm">
            <span className="text-emerald-400">{campaign.sent_count} enviados</span>
            <span className="text-red-400">{campaign.failed_count} fallidos</span>
            <span className="text-slate-400">{campaign.total_contacts - campaign.sent_count - campaign.failed_count} pendientes</span>
          </div>
        </div>

        {/* Current contact */}
        {currentContact && campaign.status === 'running' && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-sm text-emerald-400">
              Enviando a: <span className="font-medium">{currentContact.name || currentContact.phone}</span> ({currentContact.phone})
            </p>
          </div>
        )}
      </div>

      {/* Message template */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Mensaje Template</h3>
        <p className="text-white text-sm whitespace-pre-wrap bg-slate-800 rounded-lg p-3">{campaign.message_template}</p>
        <p className="text-xs text-slate-500 mt-2">
          Delay: {campaign.delay_min_ms / 1000}s - {campaign.delay_max_ms / 1000}s entre mensajes
        </p>
      </div>

      {/* Message logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Historial de Envios ({logsTotal})</h3>

        {logs.length > 0 ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="pb-2 font-medium">Telefono</th>
                  <th className="pb-2 font-medium">Nombre</th>
                  <th className="pb-2 font-medium">Estado</th>
                  <th className="pb-2 font-medium">Hora</th>
                  <th className="pb-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-t border-slate-800/50">
                    <td className="py-2 text-white">{log.contact_phone}</td>
                    <td className="py-2 text-slate-300">{log.contact_name}</td>
                    <td className="py-2">
                      {log.status === 'sent' ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle size={14} /> Enviado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400 text-xs">
                          <XCircle size={14} /> Fallido
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-slate-400 text-xs">
                      {new Date(log.sent_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 text-red-400/70 text-xs truncate max-w-[200px]">
                      {log.error_message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logsTotal > 20 && (
              <div className="flex justify-center gap-2 mt-3">
                <button
                  onClick={() => loadLogs(logsPage - 1)}
                  disabled={logsPage <= 1}
                  className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm disabled:opacity-30"
                >
                  Anterior
                </button>
                <span className="px-3 py-1 text-slate-400 text-sm">
                  Pagina {logsPage} de {Math.ceil(logsTotal / 20)}
                </span>
                <button
                  onClick={() => loadLogs(logsPage + 1)}
                  disabled={logsPage >= Math.ceil(logsTotal / 20)}
                  className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm disabled:opacity-30"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-500 text-center py-8">No hay envios registrados aun</p>
        )}
      </div>
    </div>
  );
}
