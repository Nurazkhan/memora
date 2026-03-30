import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigator from '../components/editor/Navigator';
import Inspector from '../components/editor/Inspector';
import StageArea from '../components/editor/StageArea';
import useHistory from '../hooks/useHistory';
import { 
  getTemplate, 
  updateTemplate, 
  createTemplate, 
  uploadTemplateBackground 
} from '../api/client';

const INITIAL_TEMPLATE = {
  name: 'Untitled Template',
  pages: [
    {
      id: 'page1',
      name: 'Page 1',
      orientation: 'landscape',
      background_path: null,
      objects: []
    }
  ]
};

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State Management
  const [templateInfo, setTemplateInfo] = useState({ name: 'Untitled Template' });
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [clipboard, setClipboard] = useState([]);
  const containerRef = useRef(null);

  // History Stack
  const [pages, setPages, undo, redo, canUndo, canRedo] = useHistory(INITIAL_TEMPLATE.pages);

  const activePage = pages[activePageIndex];

  // Load Template
  useEffect(() => {
    if (id !== 'new') {
      loadTemplate();
    }
  }, [id]);

  async function loadTemplate() {
    try {
      const res = await getTemplate(id);
      setTemplateInfo({ name: res.data.name });
      const layout = res.data.layout_json;
      if (layout && layout.pages) {
         setPages(layout.pages, true); // Overwrite initial state
      }
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  }

  // Responsive Scaling
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
         const width = containerRef.current.offsetWidth - 100;
         setCanvasScale(Math.min(1.2, width / 1000));
      }
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Guard for typing in inputs
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { if (!isInput) { e.preventDefault(); undo(); } }
        if (e.key === 'y') { if (!isInput) { e.preventDefault(); redo(); } }
        if (e.key === 'c') { if (!isInput) { e.preventDefault(); copySelected(); } }
        if (e.key === 'v') { if (!isInput) { e.preventDefault(); pasteObjects(); } }
        if (e.key === 'd') { if (!isInput) { e.preventDefault(); duplicateSelected(); } }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
         if (!isInput) {
           e.preventDefault();
           deleteSelected();
         }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedIds, pages]);

  // --- SNAPPING LOGIC ---
  const [guides, setGuides] = useState([]);
  const GUIDELINE_OFFSET = 15; // Increased for better "magnetic" feel

  const handleDragMove = (e, objId) => {
    const stage = e.target.getStage();
    const layer = e.target.getLayer();
    const node = e.target;
    
    // 1. Get possible stop points
    const vertical = [0, 500, 1000]; // L, C, R
    const horizontal = [0, activePage.orientation === 'landscape' ? 353.5 : 707, activePage.orientation === 'landscape' ? 707 : 1414];
    
    activePage.objects.forEach(obj => {
      if (obj.id === objId || obj.deleted) return;
      vertical.push(obj.x, obj.x + obj.width / 2, obj.x + obj.width);
      horizontal.push(obj.y, obj.y + obj.height / 2, obj.y + obj.height);
    });

    // 2. Get node bounds
    const box = node.getClientRect();
    const absPos = node.getAbsolutePosition();
    const nodeBounds = {
      vertical: [
        { guide: Math.round(node.x()), offset: Math.round(absPos.x - node.x()), snap: 'start' },
        { guide: Math.round(node.x() + node.width() / 2), offset: Math.round(absPos.x - node.x()), snap: 'center' },
        { guide: Math.round(node.x() + node.width()), offset: Math.round(absPos.x - node.x()), snap: 'end' },
      ],
      horizontal: [
        { guide: Math.round(node.y()), offset: Math.round(absPos.y - node.y()), snap: 'start' },
        { guide: Math.round(node.y() + node.height() / 2), offset: Math.round(absPos.y - node.y()), snap: 'center' },
        { guide: Math.round(node.y() + node.height()), offset: Math.round(absPos.y - node.y()), snap: 'end' },
      ]
    };

    // 3. Find matches
    const resultGuides = [];
    nodeBounds.vertical.forEach(bound => {
      vertical.forEach(line => {
        const diff = Math.abs(line - bound.guide);
        if (diff < GUIDELINE_OFFSET) {
           resultGuides.push({ pos: line, diff, orientation: 'V', snap: bound.snap });
        }
      });
    });
    nodeBounds.horizontal.forEach(bound => {
      horizontal.forEach(line => {
        const diff = Math.abs(line - bound.guide);
        if (diff < GUIDELINE_OFFSET) {
           resultGuides.push({ pos: line, diff, orientation: 'H', snap: bound.snap });
        }
      });
    });

    const finalGuides = [];
    const minV = resultGuides.filter(g => g.orientation === 'V').sort((a,b) => a.diff - b.diff)[0];
    const minH = resultGuides.filter(g => g.orientation === 'H').sort((a,b) => a.diff - b.diff)[0];
    
    if (minV) {
      finalGuides.push(minV);
      if (minV.snap === 'start') node.x(minV.pos);
      else if (minV.snap === 'center') node.x(minV.pos - node.width() / 2);
      else if (minV.snap === 'end') node.x(minV.pos - node.width());
    }
    if (minH) {
      finalGuides.push(minH);
      if (minH.snap === 'start') node.y(minH.pos);
      else if (minH.snap === 'center') node.y(minH.pos - node.height() / 2);
      else if (minH.snap === 'end') node.y(minH.pos - node.height());
    }

    setGuides(finalGuides);
  };

  // Object Actions
  const addPage = () => {
    const newPage = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Page ${pages.length + 1}`,
      orientation: activePage ? activePage.orientation : 'landscape',
      objects: []
    };
    const nextPages = [...pages, newPage];
    setPages(nextPages);
    // Use timeout to ensure state update has propagated or handle in useEffect
    setTimeout(() => setActivePageIndex(nextPages.length - 1), 0);
  };

  const deletePage = (index) => {
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== index);
    setPages(newPages);
    setActivePageIndex(Math.max(0, index - 1));
  };

  const updateActivePage = (updates) => {
    const newPages = [...pages];
    newPages[activePageIndex] = { ...newPages[activePageIndex], ...updates };
    setPages(newPages);
  };

  // Object Actions
  const addObject = (type, specifics = {}) => {
    const newObj = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 100,
      y: 100,
      width: specifics.width || (type === 'frame' ? 200 : 300),
      height: specifics.height || (type === 'frame' ? 200 : 50),
      role: 'individual',
      shape: specifics.shape || 'rect',
      locked: false,
      deleted: false,
      ...specifics
    };
    const newObjects = [...activePage.objects, newObj];
    updateActivePage({ objects: newObjects });
    setSelectedIds([newObj.id]);
  };

  const updateObject = (id, updates) => {
    const newObjects = activePage.objects.map(obj => {
       if (obj.id === id) {
          if (updates.deleted) return { ...obj, deleted: true };
          return { ...obj, ...updates };
       }
       return obj;
    }).filter(obj => !obj.deleted || obj.id !== id); // Actually filter out if deleted is set

    const filtered = activePage.objects.map(obj => obj.id === id ? { ...obj, ...updates } : obj).filter(obj => !obj.deleted);
    updateActivePage({ objects: filtered });
  };

  const deleteSelected = () => {
     if (selectedIds.length === 0) return;
     const newObjects = activePage.objects.map(obj => 
        selectedIds.includes(obj.id) ? { ...obj, deleted: true } : obj
     ).filter(obj => !obj.deleted);
     updateActivePage({ objects: newObjects });
     setSelectedIds([]);
  };

  const reorderSelected = (direction) => {
    if (selectedIds.length !== 1) return;
    const objId = selectedIds[0];
    const objIndex = activePage.objects.findIndex(o => o.id === objId);
    if (objIndex < 0) return;
    
    const newObjects = [...activePage.objects];
    const [targetObj] = newObjects.splice(objIndex, 1);
    
    if (direction === 'up' && objIndex < newObjects.length) {
      newObjects.splice(objIndex + 1, 0, targetObj);
    } else if (direction === 'down' && objIndex > 0) {
      newObjects.splice(objIndex - 1, 0, targetObj);
    } else if (direction === 'top') {
      newObjects.push(targetObj);
    } else if (direction === 'bottom') {
      newObjects.unshift(targetObj);
    } else {
      newObjects.splice(objIndex, 0, targetObj);
    }
    
    updateActivePage({ objects: newObjects });
  };

  const duplicateSelected = () => {
     if (selectedIds.length === 0) return;
     const newObjs = activePage.objects.filter(o => selectedIds.includes(o.id)).map(o => ({
        ...o,
        id: Math.random().toString(36).substr(2, 9),
        x: o.x + 20,
        y: o.y + 20
     }));
     updateActivePage({ objects: [...activePage.objects, ...newObjs] });
     setSelectedIds(newObjs.map(o => o.id));
  };

  const copySelected = () => {
     if (selectedIds.length === 0) return;
     const selected = activePage.objects.filter(o => selectedIds.includes(o.id));
     setClipboard(selected.map(o => ({ ...o })));
  };

  const pasteObjects = () => {
     if (clipboard.length === 0) return;
     const newObjs = clipboard.map(o => ({
        ...o,
        id: Math.random().toString(36).substr(2, 9),
        x: o.x + 20,
        y: o.y + 20
     }));
     updateActivePage({ objects: [...activePage.objects, ...newObjs] });
     setSelectedIds(newObjs.map(o => o.id));
     // Optional: update clipboard offset so repeated pastes offset further
     setClipboard(newObjs);
  };

  // Save Template
  const handleSave = async () => {
    setSaveLoading(true);
    const payload = {
      name: templateInfo.name,
      page_size: 'A4',
      layout_json: { pages }
    };

    try {
      if (id === 'new') {
        const res = await createTemplate(payload);
        navigate(`/templates/${res.data.id}`);
      } else {
        await updateTemplate(id, payload);
      }
      alert('Template saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Error saving template');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleBackgroundUpload = async (e) => {
     if (!e.target.files?.[0] || id === 'new') return;
     const formData = new FormData();
     formData.append('file', e.target.files[0]);
     try {
       const res = await uploadTemplateBackground(id, formData);
       updateActivePage({ background_path: res.background_path });
     } catch (err) {
       console.error(err);
     }
  };

  const selectedObjects = activePage.objects.filter(obj => selectedIds.includes(obj.id));

  return (
    <div className="editor-root" style={{ height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar / Toolbar */}
      <div className="editor-toolbar" style={{ height: 56, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
           <button onClick={() => navigate('/templates')} className="btn-icon" title="Go back">←</button>
           <input 
             className="editor-title-input"
             value={templateInfo.name}
             onChange={e => setTemplateInfo({ ...templateInfo, name: e.target.value })}
             style={{ background: 'transparent', border: 'none', fontSize: 16, fontWeight: 700, outline: 'none' }}
           />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
           <div style={{ display: 'flex', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 12, gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => addObject('frame', { shape: 'rect' })}>+ Frame</button>
              <button className="btn btn-secondary" onClick={() => addObject('text')}>+ Text</button>
           </div>
           
           <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-icon" onClick={undo} disabled={!canUndo} title="Undo">↩️</button>
              <button className="btn btn-icon" onClick={redo} disabled={!canRedo} title="Redo">↪️</button>
           </div>

           <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Save Template'}
           </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Navigator (Left) */}
        <Navigator 
          pages={pages} 
          activePageIndex={activePageIndex} 
          onPageSelect={setActivePageIndex}
          onAddPage={addPage}
          onDeletePage={deletePage}
          onDuplicatePage={(idx) => {
             const copy = { ...pages[idx], id: Math.random().toString(36).substr(2, 9), name: `${pages[idx].name} (Copy)` };
             setPages([...pages, copy]);
          }}
        />

        {/* Main Canvas (Center) */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
           <StageArea 
             activePage={activePage}
             selectedIds={selectedIds}
             onSelect={setSelectedIds}
             onObjectChange={updateObject}
             onDragMove={handleDragMove}
             canvasScale={canvasScale}
             guides={guides} 
           />
           
           {/* Canvas Controls */}
           <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '6px 16px', borderRadius: 30, boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{Math.round(canvasScale * 100)}%</span>
              <button className="btn-icon" onClick={() => setCanvasScale(prev => Math.max(0.2, prev - 0.1))}>-</button>
              <button className="btn-icon" onClick={() => setCanvasScale(prev => Math.min(2.0, prev + 0.1))}>+</button>
           </div>
        </div>

        {/* Inspector (Right) */}
        <Inspector 
          activePage={activePage}
          selectedObjects={selectedObjects}
          onPageChange={updateActivePage}
          onObjectChange={updateObject}
          onBackgroundUpload={handleBackgroundUpload}
          onReorder={reorderSelected}
        />
      </div>
    </div>
  );
}
