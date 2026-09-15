import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItem = 'block rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-navy-800'
const navItemActive = 'bg-navy-800 text-gold-400'

export default function Layout() {
  const { signOut, canAccess } = useAuth()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {!collapsed && (
        <aside className="flex shrink-0 flex-row items-center justify-between bg-navy-900 p-4 text-white md:w-56 md:flex-col md:items-stretch md:justify-start md:p-6">
          <div className="mb-6 hidden items-center justify-between md:flex">
            <div>
              <p className="text-lg font-semibold tracking-wide text-white">SAHARTY</p>
              <p className="text-xs text-gold-400">Staff Portal</p>
            </div>
            <button onClick={toggle} title="Hide sidebar" className="rounded-md px-2 py-1 text-slate-300 hover:bg-navy-800">
              ⟨
            </button>
          </div>
          <nav className="flex flex-1 flex-row gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {canAccess('dashboard') && (
              <NavLink to="/" end className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Dashboard
              </NavLink>
            )}
            {canAccess('patients') && (
              <NavLink to="/patients" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Patients
              </NavLink>
            )}
            {canAccess('schedule') && (
              <NavLink to="/schedule" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Schedule
              </NavLink>
            )}
            {canAccess('inventory') && (
              <NavLink to="/inventory" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Inventory
              </NavLink>
            )}
            {canAccess('finances') && (
              <NavLink to="/finances" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Finances
              </NavLink>
            )}
            {canAccess('hr') && (
              <NavLink to="/hr" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                HR
              </NavLink>
            )}
            {canAccess('analytics') && (
              <NavLink to="/analytics" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Analytics
              </NavLink>
            )}
            {canAccess('settings') && (
              <NavLink to="/settings" className={({ isActive }) => `${navItem} ${isActive ? navItemActive : 'text-slate-200'}`}>
                Settings
              </NavLink>
            )}
          </nav>
          <button
            onClick={signOut}
            className="ml-2 shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-navy-800 md:ml-0 md:mt-auto md:block md:w-full md:px-4 md:text-left md:font-normal"
          >
            Sign out
          </button>
        </aside>
      )}

      <main className="flex-1 bg-slate-50 p-4 md:p-8">
        {collapsed && (
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={toggle}
              title="Show sidebar"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50"
            >
              ☰ Menu
            </button>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-navy-800 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
