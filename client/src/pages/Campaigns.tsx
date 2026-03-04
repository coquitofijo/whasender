import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useSocket } from '../context/SocketContext';
import type { Campaign, Session, ContactList } from '../types';
import { Plus, Play, Pause, Eye, X, FileText } from 'lucide-react';

const MESSAGE_TEMPLATES = [
  {
    label: 'Saludo simple',
    text: 'Hola {nombre}, como estas? Te escribo para...',
  },
  {
    label: 'Promo / Oferta',
    text: 'Hola {nombre}! Tenemos una promo especial para vos. Escribinos para mas info!',
  },
  {
    label: 'Seguimiento',
    text: 'Hola {nombre}, te escribimos porque vimos que estabas interesado/a. Seguis buscando? Cualquier consulta estamos a disposicion!',
  },
  {
    label: 'Recordatorio',
    text: 'Hola {nombre}, te recordamos que tenes una cita/pedido pendiente. Confirmas? Gracias!',
  },
  {
    label: 'Bienvenida',
    text: 'Hola {nombre}! Bienvenido/a. Estamos para ayudarte en lo que necesites. No dudes en escribirnos!',
  },
];

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    session_id: '',
    list_id: '',
    message_template: '',
    delay_min_ms: 3000,
    delay_max_ms: 4000,
    contact_limit: 0,
  });
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/campaigns').then(r => setCampaigns(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleStatus = (data: { campaignId: string; status: string }) => {
      setCampaigns(prev =>
        prev.map(c => c.id === data.campaignId ? { ...c, status: data.status as Campaign['status'] } : c)
      );
    };

    const handleProgress = (data: { campaignId: string; sent: number; failed: number }) => {
      setCampaigns(prev =>
        prev.map(c =>
          c.id === data.campaignId ? { ...c, sent_count: data.sent, failed_count: data.failed } : c
        )
      );
    };

    socket.on('campaign:status', handleStatus);
    socket.on('campaign:progress', handleProgress);
    return () => {
      socket.off('campaign:status', handleStatus);
      socket.off('campaign:progress', handleProgress);
    };
  }, [socket]);

  const openCreate = async () => {
    const [sessRes, listRes] = await Promise.all([
      api.get('/sessions'),
      api.get('/contact-lists'),
    ]);
    setSessions(sessRes.data);
    setLists(listRes.data);
    setShowCreate(true);
  };

  const createCampaign = async () => {
    if (!form.name || !form.session_id || !form.list_id || !form.message_template) return;
    const { data } = await api.post('/campaigns', form);
    setCampaigns(prev => [data, ...prev]);
    setShowCreate(false);
    setForm({ name: '', session_id: '', list_id: '', message_template: '', delay_min_ms: 3000, delay_max_ms: 4000, contact_limit: 0 });
    // Reload to get joined data
    api.get('/campaigns').then(r => setCampaigns(r.data));
  };

  const startCampaign = async (id: string) => {
    await api.post(`/campaigns/${id}/start`);
  };

  const pauseCampaign = async (id: string) => {
    await api.post(`/campaigns/${id}/pause`);
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-500/20 text-slate-400',
    running: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  // Get available variables from selected list's contacts
  const _selectedList = lists.find(l => l.id === form.list_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Campanas</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nueva Campana
        </button>
      </div>

      {/* Create campaign modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Nueva Campana</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Promo Marzo"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Sesion WhatsApp</label>
                <select
                  value={form.session_id}
                  onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Seleccionar sesion...</option>
                  {sessions.filter(s => s.status === 'connected').map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone ? `+${s.phone}` : 'sin numero'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Lista de Contactos</label>
                <select
                  value={form.list_id}
                  onChange={e => setForm(f => ({ ...f, list_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Seleccionar lista...</option>
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.total_count} contactos)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Cantidad de contactos a enviar</label>
                <input
                  type="number"
                  value={form.contact_limit || ''}
                  onChange={e => setForm(f => ({ ...f, contact_limit: parseInt(e.target.value) || 0 }))}
                  placeholder="Todos los contactos"
                  min={0}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Dejar en 0 o vacio para enviar a todos. Si pones 20, envia a los primeros 20 no contactados.
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Templates rapidos</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {MESSAGE_TEMPLATES.map(t => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, message_template: t.text }))}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      <FileText size={12} />
                      {t.label}
                    </button>
                  ))}
                </div>

                <label className="block text-sm text-slate-400 mb-1">Mensaje</label>
                <textarea
                  value={form.message_template}
                  onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
                  placeholder={`Hola {nombre}, te escribo para...`}
                  rows={4}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Usa {'{'}nombre{'}'} y {'{'}telefono{'}'} como variables. Se reemplazan automaticamente por los datos de cada contacto.
                </p>

                {/* Live preview */}
                {form.message_template && (
                  <div className="mt-2 bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Vista previa:</p>
                    <p className="text-sm text-emerald-300 whitespace-pre-wrap">
                      {form.message_template
                        .replace(/\{nombre\}/g, 'Juan Perez')
                        .replace(/\{telefono\}/g, '5491112345678')
                        .replace(/\{empresa\}/g, 'Mi Empresa')
                        .replace(/\{ciudad\}/g, 'Buenos Aires')
                      }
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Delay minimo (seg)</label>
                  <input
                    type="number"
                    value={form.delay_min_ms / 1000}
                    onChange={e => setForm(f => ({ ...f, delay_min_ms: parseFloat(e.target.value) * 1000 }))}
                    min={1}
                    step={0.5}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Delay maximo (seg)</label>
                  <input
                    type="number"
                    value={form.delay_max_ms / 1000}
                    onChange={e => setForm(f => ({ ...f, delay_max_ms: parseFloat(e.target.value) * 1000 }))}
                    min={1}
                    step={0.5}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                onClick={createCampaign}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium"
              >
                Crear Campana
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns list */}
      <div className="grid gap-3">
        {campaigns.map(campaign => {
          const progress = campaign.total_contacts > 0
            ? ((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100
            : 0;

          return (
            <div key={campaign.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-white">{campaign.name}</p>
                    <p className="text-xs text-slate-400">
                      {campaign.session_name} → {campaign.list_name}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  {(campaign.status === 'draft' || campaign.status === 'paused') && (
                    <button onClick={() => startCampaign(campaign.id)} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 p-2 rounded-lg">
                      <Play size={16} />
                    </button>
                  )}
                  {campaign.status === 'running' && (
                    <button onClick={() => pauseCampaign(campaign.id)} className="bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 p-2 rounded-lg">
                      <Pause size={16} />
                    </button>
                  )}
                  <button onClick={() => navigate(`/campaigns/${campaign.id}`)} className="bg-slate-800 text-slate-300 hover:bg-slate-700 p-2 rounded-lg">
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {campaign.sent_count}/{campaign.total_contacts} enviados
                  {campaign.failed_count > 0 && ` (${campaign.failed_count} fallidos)`}
                </span>
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && (
          <p className="text-slate-500 text-center py-12">No hay campanas. Crea una nueva para empezar.</p>
        )}
      </div>
    </div>
  );
}
