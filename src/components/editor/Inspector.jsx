import React from 'react';
import TemplateMiniPreview from './TemplateMiniPreview';

const VARIABLE_OPTIONS = [
  { value: 'student.name', label: 'Student Name' },
  { value: 'student.class', label: 'Student Class' },
  { value: 'student.number', label: 'Student Number' },
  { value: 'project.name', label: 'Project Name' },
];

function Section({ title, hint, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

function NumberField({ label, value, onChange, min = 0, max, step = 1 }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      <input
        className="form-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function Inspector({
  activePage,
  selectedObjects,
  onPageChange,
  onObjectChange,
  onBackgroundUpload,
  onReorder,
  onDuplicateSelected,
  onDeleteSelected,
}) {
  const isPageSelected = selectedObjects.length === 0;
  const isSingleSelect = selectedObjects.length === 1;
  const selected = isSingleSelect ? selectedObjects[0] : null;

  return (
    <div
      className="editor-inspector"
      style={{
        width: 320,
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
          {isPageSelected ? 'Page Settings' : isSingleSelect ? `Editing ${selected.type}` : `${selectedObjects.length} items selected`}
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {isPageSelected
            ? 'Tune the current page and preview the final layout.'
            : isSingleSelect
              ? 'Adjust content, placement, styling, and layer order.'
              : 'Use keyboard shortcuts or select a single item for detailed editing.'}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <Section title="Live Preview" hint="Rendered with sample content so variable text is visible.">
          <TemplateMiniPreview page={activePage} />
        </Section>

        {isPageSelected && (
          <React.Fragment>
            <Section title="Page Details">
              <input
                className="form-input"
                value={activePage.name || ''}
                onChange={(e) => onPageChange({ name: e.target.value })}
                placeholder="Page Name"
                style={{ marginBottom: 10 }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  className={`btn ${activePage.orientation === 'landscape' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onPageChange({ orientation: 'landscape' })}
                >
                  Landscape
                </button>
                <button
                  className={`btn ${activePage.orientation === 'portrait' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onPageChange({ orientation: 'portrait' })}
                >
                  Portrait
                </button>
              </div>
            </Section>

            <Section title="Background" hint="Upload a page image or texture, then save the template.">
              <input className="form-input" type="file" accept="image/*" onChange={onBackgroundUpload} />
              {activePage.background_path && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 10, width: '100%' }}
                  onClick={() => onPageChange({ background_path: null })}
                >
                  Remove Background
                </button>
              )}
            </Section>
          </React.Fragment>
        )}

        {selectedObjects.length > 1 && (
          <Section title="Multi Select">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn btn-secondary" onClick={onDuplicateSelected}>
                Duplicate
              </button>
              <button className="btn btn-danger" onClick={onDeleteSelected}>
                Delete
              </button>
            </div>
          </Section>
        )}

        {isSingleSelect && (
          <React.Fragment>
            {selected.type === 'frame' && (
              <Section title="Frame Role">
                <select
                  className="form-input"
                  value={selected.role || 'individual'}
                  onChange={(e) => onObjectChange(selected.id, { role: e.target.value })}
                  style={{ marginBottom: 10 }}
                >
                  <option value="individual">Individual Portrait</option>
                  <option value="group">Group Photo</option>
                  <option value="class">Class Photo</option>
                  <option value="free">Decorative Frame</option>
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    className={`btn ${selected.shape === 'rect' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => onObjectChange(selected.id, { shape: 'rect' })}
                  >
                    Rectangle
                  </button>
                  <button
                    className={`btn ${selected.shape === 'circle' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => onObjectChange(selected.id, { shape: 'circle' })}
                  >
                    Circle
                  </button>
                </div>
              </Section>
            )}

            {selected.type === 'text' && (
              <React.Fragment>
                <Section title="Content">
                  <select
                    className="form-input"
                    value={selected.source_type || 'static'}
                    onChange={(e) =>
                      onObjectChange(selected.id, {
                        source_type: e.target.value,
                        source_variable: e.target.value === 'variable' ? selected.source_variable || 'student.name' : '',
                      })
                    }
                    style={{ marginBottom: 10 }}
                  >
                    <option value="static">Static Text</option>
                    <option value="variable">Data Variable</option>
                  </select>

                  {selected.source_type === 'variable' ? (
                    <select
                      className="form-input"
                      value={selected.source_variable || 'student.name'}
                      onChange={(e) => onObjectChange(selected.id, { source_variable: e.target.value })}
                    >
                      {VARIABLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      className="form-input form-textarea"
                      value={selected.content || ''}
                      onChange={(e) => onObjectChange(selected.id, { content: e.target.value })}
                      placeholder="Type your text here"
                    />
                  )}
                </Section>

                <Section title="Typography">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <NumberField
                      label="Font Size"
                      value={selected.font_size || 16}
                      min={8}
                      max={240}
                      onChange={(value) => onObjectChange(selected.id, { font_size: value })}
                    />
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Align</span>
                      <select
                        className="form-input"
                        value={selected.align || 'left'}
                        onChange={(e) => onObjectChange(selected.id, { align: e.target.value })}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={selected.fill || '#1f2937'}
                      onChange={(e) => onObjectChange(selected.id, { fill: e.target.value })}
                      style={{ width: 42, height: 38, padding: 0, border: 'none', background: 'transparent' }}
                    />
                    <input
                      className="form-input"
                      value={selected.fill || '#1f2937'}
                      onChange={(e) => onObjectChange(selected.id, { fill: e.target.value })}
                    />
                  </div>
                </Section>
              </React.Fragment>
            )}

            <Section title="Position & Size">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <NumberField label="X" value={selected.x} onChange={(value) => onObjectChange(selected.id, { x: value })} />
                <NumberField label="Y" value={selected.y} onChange={(value) => onObjectChange(selected.id, { y: value })} />
                <NumberField label="Width" value={selected.width} min={10} onChange={(value) => onObjectChange(selected.id, { width: value })} />
                <NumberField label="Height" value={selected.height} min={10} onChange={(value) => onObjectChange(selected.id, { height: value })} />
                <NumberField
                  label="Rotation"
                  value={selected.rotation || 0}
                  min={-360}
                  max={360}
                  onChange={(value) => onObjectChange(selected.id, { rotation: value })}
                />
                <NumberField
                  label="Opacity %"
                  value={Math.round((selected.opacity ?? 1) * 100)}
                  min={10}
                  max={100}
                  onChange={(value) => onObjectChange(selected.id, { opacity: Math.max(0.1, Math.min(1, value / 100)) })}
                />
              </div>

              <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selected.locked}
                  onChange={(e) => onObjectChange(selected.id, { locked: e.target.checked })}
                />
                Lock object on canvas
              </label>
            </Section>

            <Section title="Arrange">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <button className="btn btn-secondary" onClick={() => onReorder('top')}>
                  Bring Front
                </button>
                <button className="btn btn-secondary" onClick={() => onReorder('up')}>
                  Forward
                </button>
                <button className="btn btn-secondary" onClick={() => onReorder('bottom')}>
                  Send Back
                </button>
                <button className="btn btn-secondary" onClick={() => onReorder('down')}>
                  Backward
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn btn-secondary" onClick={onDuplicateSelected}>
                  Duplicate
                </button>
                <button className="btn btn-danger" onClick={onDeleteSelected}>
                  Delete
                </button>
              </div>
            </Section>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
