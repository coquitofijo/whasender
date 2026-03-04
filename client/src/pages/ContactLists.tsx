import { useEffect, useState, useRef } from 'react';
import api from '../api/client';
import type { ContactList, Contact } from '../types';
import { Upload, Users, Trash2, X, ChevronDown, ChevronUp, CheckCircle, Clock } from 'lucide-react';

export default function ContactLists() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [contacts, setContacts] = useState<(Contact & { sent?: boolean; last_sent_at?: string })[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsSentCount, setContactsSentCount] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/contact-lists').then(r => setLists(r.data)).catch(console.error);
  }, []);

  const uploadCSV = async () => {
    if (!uploadName.trim() || !fileRef.current?.files?.[0]) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadName);
      formData.append('file', fileRef.current.files[0]);
      const { data } = await api.post('/contact-lists', formData);
      setLists(prev => [data, ...prev]);
      setUploadName('');
      setShowUpload(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = async (listId: string) => {
    if (expandedList === listId) {
      setExpandedList(null);
      return;
    }
    setExpandedList(listId);
    setContactsPage(1);
    await loadContacts(listId, 1);
  };

  const loadContacts = async (listId: string, page: number) => {
    const { data } = await api.get(`/contact-lists/${listId}/contacts?page=${page}&limit=20`);
    setContacts(data.contacts);
    setContactsTotal(data.total);
    setContactsSentCount(data.sent_count || 0);
    setContactsPage(page);
  };

  const deleteList = async (id: string) => {
    await api.delete(`/contact-lists/${id}`);
    setLists(prev => prev.filter(l => l.id !== id));
    if (expandedList === id) setExpandedList(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Listas de Contactos</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Upload size={16} /> Importar CSV
        </button>
      </div>

      {showUpload && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
          <div className="flex gap-3 mb-3">
            <input
              type="text"
              placeholder="Nombre de la lista"
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
            <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-white px-2">
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-3 items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="flex-1 text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
            />
            <button
              onClick={uploadCSV}
              disabled={uploading}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {uploading ? 'Importando...' : 'Importar'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            El CSV debe tener columnas: phone/telefono/numero, name/nombre. Las demas columnas se importan como campos personalizados.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {lists.map(list => (
          <div key={list.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <button
                onClick={() => toggleExpand(list.id)}
                className="flex items-center gap-4 flex-1 text-left"
              >
                <div className="p-2 bg-slate-800 rounded-lg">
                  <Users size={20} className="text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-white">{list.name}</p>
                  <p className="text-sm text-slate-400">
                    {list.total_count} contactos
                    {expandedList === list.id && contactsSentCount > 0 && (
                      <span className="ml-2 text-emerald-400">
                        · {contactsSentCount}/{list.total_count} enviados
                      </span>
                    )}
                  </p>
                </div>
                {expandedList === list.id ? (
                  <ChevronUp size={18} className="text-slate-400" />
                ) : (
                  <ChevronDown size={18} className="text-slate-400" />
                )}
              </button>
              <button onClick={() => deleteList(list.id)} className="text-red-400/60 hover:text-red-400 p-1.5 ml-2">
                <Trash2 size={16} />
              </button>
            </div>

            {expandedList === list.id && (
              <div className="border-t border-slate-800 p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="pb-2 font-medium">Telefono</th>
                      <th className="pb-2 font-medium">Nombre</th>
                      <th className="pb-2 font-medium">Campos Extra</th>
                      <th className="pb-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id} className="border-t border-slate-800/50">
                        <td className="py-2 text-white">{c.phone}</td>
                        <td className="py-2 text-slate-300">{c.name}</td>
                        <td className="py-2 text-slate-400 text-xs">
                          {Object.entries(c.custom_fields || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                        </td>
                        <td className="py-2">
                          {c.sent ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle size={14} /> Enviado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Clock size={14} /> Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {contactsTotal > 20 && (
                  <div className="flex justify-center gap-2 mt-3">
                    <button
                      onClick={() => loadContacts(list.id, contactsPage - 1)}
                      disabled={contactsPage <= 1}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm disabled:opacity-30"
                    >
                      Anterior
                    </button>
                    <span className="px-3 py-1 text-slate-400 text-sm">
                      Pagina {contactsPage} de {Math.ceil(contactsTotal / 20)}
                    </span>
                    <button
                      onClick={() => loadContacts(list.id, contactsPage + 1)}
                      disabled={contactsPage >= Math.ceil(contactsTotal / 20)}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded text-sm disabled:opacity-30"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {lists.length === 0 && (
          <p className="text-slate-500 text-center py-12">No hay listas. Importa un CSV para empezar.</p>
        )}
      </div>
    </div>
  );
}
