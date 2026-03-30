import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  }, [isCollapsed]);

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header" style={{ justifyContent: isCollapsed ? 'center' : 'space-between', paddingLeft: isCollapsed ? 0 : 24, paddingRight: isCollapsed ? 0 : 16 }}>
        <div className="sidebar-logo" style={{ display: isCollapsed ? 'none' : 'flex' }}>
          <div className="sidebar-logo-icon">M</div>
          <span className="sidebar-logo-text">Memora</span>
        </div>
        <button 
          className="btn btn-ghost" 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{ padding: 0, height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: isCollapsed ? '0 auto' : 0 }}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <nav className="sidebar-nav" style={{ padding: isCollapsed ? '24px 8px' : '24px' }}>
        {!isCollapsed && <div className="sidebar-section-title">General</div>}
        <NavLink
          to="/"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
          end
          title="Dashboard"
        >
          <span className="sidebar-link-icon">📊</span>
          {!isCollapsed && "Dashboard"}
        </NavLink>

        <NavLink
          to="/templates"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
          title="Templates"
        >
          <span className="sidebar-link-icon">📐</span>
          {!isCollapsed && "Templates"}
        </NavLink>

        {!isCollapsed && <div className="sidebar-section-title" style={{ marginTop: 20 }}>Quick Actions</div>}
        
        <button className={`sidebar-link ${isCollapsed ? 'collapsed' : ''}`} disabled title={isCollapsed ? "New Project (Coming soon)" : "Coming soon"}>
          <span className="sidebar-link-icon">📁</span>
          {!isCollapsed && "New Project"}
        </button>
        <button className={`sidebar-link ${isCollapsed ? 'collapsed' : ''}`} disabled title={isCollapsed ? "Settings (Coming soon)" : "Coming soon"}>
          <span className="sidebar-link-icon">⚙️</span>
          {!isCollapsed && "Settings"}
        </button>
      </nav>

      <div className="sidebar-footer" style={{ padding: isCollapsed ? '24px 0' : '24px', textAlign: isCollapsed ? 'center' : 'left' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {isCollapsed ? 'v1.0' : 'Memora v1.0.0'}
        </div>
      </div>
    </aside>
  );
}
