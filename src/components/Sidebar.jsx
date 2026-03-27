import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">M</div>
          <span className="sidebar-logo-text">Memora</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-title">General</div>
        <NavLink
          to="/"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          end
        >
          <span className="sidebar-link-icon">📊</span>
          Dashboard
        </NavLink>

        <div className="sidebar-section-title" style={{ marginTop: 20 }}>
          Quick Actions
        </div>
        <button className="sidebar-link" disabled title="Coming soon">
          <span className="sidebar-link-icon">📁</span>
          New Project
        </button>
        <button className="sidebar-link" disabled title="Coming soon">
          <span className="sidebar-link-icon">⚙️</span>
          Settings
        </button>
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Memora v1.0.0
        </div>
      </div>
    </aside>
  );
}
