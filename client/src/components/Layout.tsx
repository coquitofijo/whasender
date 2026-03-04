import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Smartphone, Users, Send, Bot } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sessions', icon: Smartphone, label: 'Sesiones' },
  { to: '/contact-lists', icon: Users, label: 'Contactos' },
  { to: '/campaigns', icon: Send, label: 'Campanas' },
  { to: '/autopilot', icon: Bot, label: 'Autopilot' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-emerald-400">Sender WHA</h1>
          <p className="text-xs text-slate-500 mt-1">Centro de Envios WhatsApp</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
