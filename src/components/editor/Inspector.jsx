import React from 'react';

export default function Inspector({ activePage, selectedObjects, onPageChange, onObjectChange, onBackgroundUpload, onReorder }) {
  const isPageSelected = selectedObjects.length === 0;
  const isSingleSelect = selectedObjects.length === 1;
  const selected = isSingleSelect ? selectedObjects[0] : null;

  return (
    <div className="editor-inspector" style={{ width: 280, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
          {isPageSelected ? 'Page Settings' : (isSingleSelect ? `Object: ${selected.type}` : `${selectedObjects.length} Objects Selected`)}
        </h3>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {isPageSelected && (
          <div className="inspector-section">
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Basic Info</label>
              <input 
                className="form-input" 
                value={activePage.name || ''} 
                onChange={(e) => onPageChange({ ...activePage, name: e.target.value })}
                placeholder="Page Name"
                style={{ marginBottom: 12 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Page Size & Orientation</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button 
                  className={`btn ${activePage.orientation === 'portrait' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onPageChange({ ...activePage, orientation: 'portrait' })}
                  style={{ fontSize: 12 }}
                >Portrait</button>
                <button 
                  className={`btn ${activePage.orientation === 'landscape' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onPageChange({ ...activePage, orientation: 'landscape' })}
                  style={{ fontSize: 12 }}
                >Landscape</button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
               <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Background</label>
               <input type="file" onChange={onBackgroundUpload} style={{ fontSize: 12 }} />
               {activePage.background_path && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onPageChange({ ...activePage, background_path: null })}>Remove background</div>
               )}
            </div>
          </div>
        )}

        {isSingleSelect && (
          <div className="inspector-section">
             {selected.type === 'frame' && (
               <React.Fragment>
                 <div style={{ marginBottom: 20 }}>
                   <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Semantic Role</label>
                   <select 
                      className="form-input" 
                      value={selected.role || 'individual'}
                      onChange={(e) => onObjectChange(selected.id, { role: e.target.value })}
                      style={{ fontSize: 13 }}
                    >
                      <option value="individual">Individual Portrait</option>
                      <option value="group">Group Photo</option>
                      <option value="class">Class / Group Photo</option>
                      <option value="free">Decorative / Manual</option>
                    </select>
                 </div>

                 <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Shape</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <button 
                        className={`btn ${selected.shape === 'rect' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => onObjectChange(selected.id, { shape: 'rect' })}
                        style={{ fontSize: 12 }}
                      >Square</button>
                      <button 
                        className={`btn ${selected.shape === 'circle' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => onObjectChange(selected.id, { shape: 'circle' })}
                        style={{ fontSize: 12 }}
                      >Circle</button>
                    </div>
                 </div>
               </React.Fragment>
             )}

             {selected.type === 'text' && (
                <React.Fragment>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Content Source</label>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Use variables for dynamic text</div>
                    <select 
                      className="form-input" 
                      value={selected.source_type || 'static'}
                      onChange={(e) => onObjectChange(selected.id, { source_type: e.target.value })}
                      style={{ marginBottom: 10, fontSize: 13 }}
                    >
                      <option value="static">Static Text</option>
                      <option value="variable">Data Binding (Variable)</option>
                    </select>
                    
                    {selected.source_type === 'variable' ? (
                      <select 
                        className="form-input" 
                        value={selected.source_variable || 'student.name'}
                        onChange={(e) => onObjectChange(selected.id, { source_variable: e.target.value })}
                        style={{ fontSize: 13 }}
                      >
                         <option value="student.name">Student: Name</option>
                         <option value="student.class">Student: Class</option>
                         <option value="student.number">Student: Roll Number</option>
                         <option value="project.name">Project: Name</option>
                      </select>
                    ) : (
                      <input 
                        className="form-input" 
                        value={selected.content || ''}
                        onChange={(e) => onObjectChange(selected.id, { content: e.target.value })}
                      />
                    )}
                  </div>
                  
                  <div style={{ marginBottom: 20 }}>
                     <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Font Style</label>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Font Size</span>
                          <input 
                            className="form-input" 
                            type="number" 
                            value={selected.font_size || 16} 
                            onChange={(e) => onObjectChange(selected.id, { font_size: parseInt(e.target.value) })} 
                          />
                        </div>
                        <div>
                           <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Align</span>
                           <select 
                             className="form-input" 
                             value={selected.align || 'left'} 
                             onChange={(e) => onObjectChange(selected.id, { align: e.target.value })}
                           >
                             <option value="left">Left</option>
                             <option value="center">Center</option>
                             <option value="right">Right</option>
                           </select>
                        </div>
                     </div>
                  </div>
                </React.Fragment>
             )}

             <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Arrange / Layers</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 20 }}>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px' }} onClick={() => onReorder('top')}>Bring to Front</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px' }} onClick={() => onReorder('up')}>Bring Forward</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px' }} onClick={() => onReorder('bottom')}>Send to Back</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px' }} onClick={() => onReorder('down')}>Send Backward</button>
                </div>

                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Position & Locking</label>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input 
                      type="checkbox" 
                      checked={selected.locked} 
                      onChange={(e) => onObjectChange(selected.id, { locked: e.target.checked })} 
                    />
                    Locked
                  </label>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                  onClick={() => onObjectChange(selected.id, { deleted: true })}
                >
                  Delete Object
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
