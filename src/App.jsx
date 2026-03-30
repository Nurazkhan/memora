import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ProjectView from './pages/ProjectView';
import TemplatesList from './pages/TemplatesList';
import TemplateEditor from './pages/TemplateEditor';

export default function App() {
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/project/:id" element={<ProjectView />} />
            <Route path="/templates" element={<TemplatesList />} />
            <Route path="/templates/:id" element={<TemplateEditor />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
