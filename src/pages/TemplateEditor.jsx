import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navigator from '../components/editor/Navigator';
import Inspector from '../components/editor/Inspector';
import StageArea from '../components/editor/StageArea';
import useHistory from '../hooks/useHistory';
import {
  getTemplate,
  updateTemplate,
  createTemplate,
  uploadTemplateBackground,
} from '../api/client';
import {
  PAGE_WIDTH,
  createId,
  getPageHeight,
  getTemplateStats,
  normalizePages,
} from '../components/editor/templateUtils';

const INITIAL_PAGES = normalizePages();

function buildFrame(role, overrides = {}) {
  return {
    id: createId('obj'),
    type: 'frame',
    x: 100,
    y: 100,
    width: 220,
    height: 220,
    role,
    shape: 'rect',
    locked: false,
    deleted: false,
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}

function buildText(overrides = {}) {
  return {
    id: createId('obj'),
    type: 'text',
    x: 110,
    y: 110,
    width: 320,
    height: 56,
    content: 'Sample Text',
    source_type: 'static',
    source_variable: '',
    font_size: 28,
    fill: '#1f2937',
    align: 'left',
    locked: false,
    deleted: false,
    rotation: 0,
    opacity: 1,
    ...overrides,
  };
}

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [templateInfo, setTemplateInfo] = useState({ name: 'Untitled Template' });
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [clipboard, setClipboard] = useState([]);
  const [guides, setGuides] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [pages, setPages, undo, redo, canUndo, canRedo] = useHistory(INITIAL_PAGES);
  const activePage = pages[activePageIndex] || pages[0];
  const selectedObjects = activePage?.objects?.filter((obj) => selectedIds.includes(obj.id)) || [];
  const templateStats = useMemo(() => getTemplateStats({ pages }), [pages]);
  const isDirty = useMemo(() => {
    if (id === 'new') return true;
    return canUndo;
  }, [id, canUndo]);

  useEffect(() => {
    if (id !== 'new') {
      loadTemplate();
    } else {
      setTemplateInfo({ name: 'Untitled Template' });
      setPages(INITIAL_PAGES, true);
      setActivePageIndex(0);
    }
  }, [id]);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth - 140;
      const height = containerRef.current.offsetHeight - 120;
      const scaleByWidth = width / PAGE_WIDTH;
      const scaleByHeight = height / getPageHeight(activePage?.orientation);
      setCanvasScale(Math.max(0.3, Math.min(1.2, scaleByWidth, scaleByHeight)));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [activePage?.orientation]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput =
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' ||
        e.target.isContentEditable;
      if (isInput) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 's':
            e.preventDefault();
            handleSave();
            break;
          case 'c':
            e.preventDefault();
            copySelected();
            break;
          case 'x':
            e.preventDefault();
            copySelected();
            deleteSelected();
            break;
          case 'v':
            e.preventDefault();
            pasteObjects();
            break;
          case 'd':
            e.preventDefault();
            duplicateSelected();
            break;
          case 't':
            e.preventDefault();
            addObject('text');
            break;
          case 'r':
            e.preventDefault();
            addObject('frame', { role: 'individual' });
            break;
          default:
            break;
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedIds, activePage, clipboard, canUndo]);

  async function loadTemplate() {
    try {
      setLoadError('');
      const res = await getTemplate(id);
      setTemplateInfo({ name: res.data.name || 'Untitled Template' });
      setPages(normalizePages(res.data.layout_json?.pages), true);
      setActivePageIndex(0);
      setSelectedIds([]);
    } catch (err) {
      console.error('Failed to load template:', err);
      setLoadError('Could not load template data.');
    }
  }

  const GUIDELINE_OFFSET = 15;

  const handleDragMove = (e, objId) => {
    if (!activePage) return;
    const node = e.target;
    const vertical = [0, PAGE_WIDTH / 2, PAGE_WIDTH];
    const pageHeight = getPageHeight(activePage.orientation);
    const horizontal = [0, pageHeight / 2, pageHeight];

    activePage.objects.forEach((obj) => {
      if (obj.id === objId || obj.deleted) return;
      vertical.push(obj.x, obj.x + obj.width / 2, obj.x + obj.width);
      horizontal.push(obj.y, obj.y + obj.height / 2, obj.y + obj.height);
    });

    const resultGuides = [];
    const nodeBounds = {
      vertical: [
        { guide: Math.round(node.x()), snap: 'start' },
        { guide: Math.round(node.x() + node.width() / 2), snap: 'center' },
        { guide: Math.round(node.x() + node.width()), snap: 'end' },
      ],
      horizontal: [
        { guide: Math.round(node.y()), snap: 'start' },
        { guide: Math.round(node.y() + node.height() / 2), snap: 'center' },
        { guide: Math.round(node.y() + node.height()), snap: 'end' },
      ],
    };

    nodeBounds.vertical.forEach((bound) => {
      vertical.forEach((line) => {
        const diff = Math.abs(line - bound.guide);
        if (diff < GUIDELINE_OFFSET) {
          resultGuides.push({ pos: line, diff, orientation: 'V', snap: bound.snap });
        }
      });
    });

    nodeBounds.horizontal.forEach((bound) => {
      horizontal.forEach((line) => {
        const diff = Math.abs(line - bound.guide);
        if (diff < GUIDELINE_OFFSET) {
          resultGuides.push({ pos: line, diff, orientation: 'H', snap: bound.snap });
        }
      });
    });

    const minV = resultGuides.filter((guide) => guide.orientation === 'V').sort((a, b) => a.diff - b.diff)[0];
    const minH = resultGuides.filter((guide) => guide.orientation === 'H').sort((a, b) => a.diff - b.diff)[0];
    const finalGuides = [];

    if (minV) {
      finalGuides.push(minV);
      if (minV.snap === 'start') node.x(minV.pos);
      if (minV.snap === 'center') node.x(minV.pos - node.width() / 2);
      if (minV.snap === 'end') node.x(minV.pos - node.width());
    }

    if (minH) {
      finalGuides.push(minH);
      if (minH.snap === 'start') node.y(minH.pos);
      if (minH.snap === 'center') node.y(minH.pos - node.height() / 2);
      if (minH.snap === 'end') node.y(minH.pos - node.height());
    }

    setGuides(finalGuides);
  };

  const updateActivePage = (updates) => {
    const nextPages = [...pages];
    nextPages[activePageIndex] = { ...nextPages[activePageIndex], ...updates };
    setPages(nextPages);
  };

  const addPage = () => {
    const nextPage = {
      id: createId('page'),
      name: `Page ${pages.length + 1}`,
      orientation: activePage?.orientation || 'landscape',
      background_path: null,
      objects: [],
    };
    const nextPages = [...pages, nextPage];
    setPages(nextPages);
    setSelectedIds([]);
    setTimeout(() => setActivePageIndex(nextPages.length - 1), 0);
  };

  const deletePage = (index) => {
    if (pages.length <= 1) return;
    const nextPages = pages.filter((_, pageIndex) => pageIndex !== index);
    setPages(nextPages);
    setSelectedIds([]);
    setActivePageIndex(Math.max(0, Math.min(index - 1, nextPages.length - 1)));
  };

  const duplicatePage = (index) => {
    const page = pages[index];
    const duplicate = {
      ...page,
      id: createId('page'),
      name: `${page.name || `Page ${index + 1}`} Copy`,
      objects: page.objects.map((object) => ({
        ...object,
        id: createId('obj'),
      })),
    };
    const nextPages = [...pages.slice(0, index + 1), duplicate, ...pages.slice(index + 1)];
    setPages(nextPages);
    setActivePageIndex(index + 1);
    setSelectedIds([]);
  };

  const addObject = (type, specifics = {}) => {
    if (!activePage) return;
    const nextObject = type === 'text' ? buildText(specifics) : buildFrame(specifics.role || 'individual', specifics);
    updateActivePage({ objects: [...activePage.objects, nextObject] });
    setSelectedIds([nextObject.id]);
  };

  const addPreset = (preset) => {
    if (!activePage) return;
    const objects = [...activePage.objects];

    if (preset === 'portrait-card') {
      objects.push(buildFrame('individual', { x: 80, y: 90, width: 260, height: 320 }));
      objects.push(buildText({ x: 80, y: 430, width: 320, height: 48, content: 'Student Name', source_type: 'variable', source_variable: 'student.name' }));
      objects.push(buildText({ x: 80, y: 480, width: 240, height: 40, content: 'Class', source_type: 'variable', source_variable: 'student.class', font_size: 20, fill: '#64748b' }));
    }

    if (preset === 'group-hero') {
      objects.push(buildFrame('group', { x: 70, y: 80, width: 860, height: 470 }));
      objects.push(buildText({ x: 70, y: 575, width: 500, height: 54, content: 'Project Name', source_type: 'variable', source_variable: 'project.name', font_size: 30 }));
    }

    if (preset === 'class-grid') {
      const frameWidth = 180;
      const frameHeight = 180;
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          objects.push(
            buildFrame('individual', {
              x: 70 + col * 220,
              y: 80 + row * 250,
              width: frameWidth,
              height: frameHeight,
            })
          );
        }
      }
      objects.push(buildText({ x: 70, y: 595, width: 300, height: 44, content: 'Class 11-B', source_type: 'variable', source_variable: 'student.class', font_size: 26 }));
    }

    updateActivePage({ objects });
  };

  const updateObject = (objectId, updates) => {
    const nextObjects = activePage.objects
      .map((object) => (object.id === objectId ? { ...object, ...updates } : object))
      .filter((object) => !object.deleted);

    updateActivePage({ objects: nextObjects });
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    updateActivePage({
      objects: activePage.objects.filter((object) => !selectedIds.includes(object.id)),
    });
    setSelectedIds([]);
  };

  const reorderSelected = (direction) => {
    if (selectedIds.length !== 1) return;

    const objectId = selectedIds[0];
    const currentIndex = activePage.objects.findIndex((object) => object.id === objectId);
    if (currentIndex < 0) return;

    const nextObjects = [...activePage.objects];
    const [selectedObject] = nextObjects.splice(currentIndex, 1);

    if (direction === 'top') nextObjects.push(selectedObject);
    else if (direction === 'bottom') nextObjects.unshift(selectedObject);
    else if (direction === 'up') nextObjects.splice(Math.min(currentIndex + 1, nextObjects.length), 0, selectedObject);
    else if (direction === 'down') nextObjects.splice(Math.max(currentIndex - 1, 0), 0, selectedObject);

    updateActivePage({ objects: nextObjects });
  };

  const duplicateSelected = () => {
    if (selectedIds.length === 0) return;
    const duplicates = activePage.objects
      .filter((object) => selectedIds.includes(object.id))
      .map((object) => ({
        ...object,
        id: createId('obj'),
        x: object.x + 20,
        y: object.y + 20,
      }));

    updateActivePage({ objects: [...activePage.objects, ...duplicates] });
    setSelectedIds(duplicates.map((object) => object.id));
  };

  const copySelected = () => {
    if (selectedIds.length === 0) return;
    setClipboard(activePage.objects.filter((object) => selectedIds.includes(object.id)).map((object) => ({ ...object })));
  };

  const pasteObjects = () => {
    if (clipboard.length === 0) return;
    const pasted = clipboard.map((object) => ({
      ...object,
      id: createId('obj'),
      x: object.x + 20,
      y: object.y + 20,
    }));

    updateActivePage({ objects: [...activePage.objects, ...pasted] });
    setSelectedIds(pasted.map((object) => object.id));
    setClipboard(pasted.map((object) => ({ ...object })));
  };

  const handleSave = async () => {
    const cleanedName = templateInfo.name.trim();
    if (!cleanedName) {
      alert('Please give this template a name before saving.');
      return;
    }

    setSaveLoading(true);
    const payload = {
      name: cleanedName,
      page_size: 'A4',
      layout_json: {
        pages: pages.map((page) => ({
          ...page,
          objects: page.objects.filter((object) => !object.deleted),
        })),
      },
    };

    try {
      if (id === 'new') {
        const res = await createTemplate(payload);
        navigate(`/templates/${res.data.id}`);
      } else {
        await updateTemplate(id, payload);
        setPages(payload.layout_json.pages, true);
      }
      alert('Template saved successfully.');
    } catch (err) {
      console.error(err);
      alert('Error saving template.');
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
      updateActivePage({ background_path: res.data.background_path });
    } catch (err) {
      console.error(err);
      alert('Background upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  if (!activePage) {
    return <div className="empty-state">Loading template editor...</div>;
  }

  return (
    <div
      className="template-editor-shell"
      style={{
        height: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        margin: '-32px -40px',
        background: 'linear-gradient(180deg, #0c1019 0%, #0a0a0f 100%)',
      }}
    >
      <div
        className="editor-toolbar"
        style={{
          minHeight: 84,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(10, 10, 15, 0.92)',
          backdropFilter: 'blur(14px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          padding: '16px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/templates')}>
            Back
          </button>
          <div style={{ minWidth: 260 }}>
            <input
              className="editor-title-input"
              value={templateInfo.name}
              onChange={(e) => setTemplateInfo({ name: e.target.value })}
              placeholder="Template Name"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                fontSize: 22,
                fontWeight: 700,
                outline: 'none',
                color: 'var(--text-primary)',
                padding: 0,
              }}
            />
            <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{templateStats.pageCount} pages</span>
              <span>{templateStats.frameCount} frames</span>
              <span>{templateStats.textCount} text blocks</span>
              <span>{isDirty ? 'Unsaved changes' : 'Saved state'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => addObject('frame', { role: 'individual' })}>
            Add Frame
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => addObject('text')}>
            Add Text
          </button>
          <button className="btn btn-secondary btn-sm" onClick={duplicateSelected} disabled={selectedIds.length === 0}>
            Duplicate
          </button>
          <button className="btn btn-secondary btn-sm" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button className="btn btn-secondary btn-sm" onClick={redo} disabled={!canRedo}>
            Redo
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saveLoading}>
            {saveLoading ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => addPreset('portrait-card')}>
          Insert Portrait Card
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => addPreset('group-hero')}>
          Insert Group Hero
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => addPreset('class-grid')}>
          Insert Class Grid
        </button>
        <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          Shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+D duplicate, Delete remove
        </span>
      </div>

      {loadError && (
        <div style={{ padding: '12px 24px', color: '#fecaca', background: 'rgba(127, 29, 29, 0.35)', borderBottom: '1px solid rgba(248, 113, 113, 0.25)' }}>
          {loadError}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Navigator
          pages={pages}
          activePageIndex={activePageIndex}
          onPageSelect={(index) => {
            setActivePageIndex(index);
            setSelectedIds([]);
          }}
          onAddPage={addPage}
          onDeletePage={deletePage}
          onDuplicatePage={duplicatePage}
        />

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

          <div
            style={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(10, 10, 15, 0.88)',
              padding: '8px 16px',
              borderRadius: 999,
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(canvasScale * 100)}%</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setCanvasScale((prev) => Math.max(0.2, prev - 0.1))}>
              -
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCanvasScale((prev) => Math.min(2, prev + 0.1))}>
              +
            </button>
          </div>
        </div>

        <Inspector
          activePage={activePage}
          selectedObjects={selectedObjects}
          onPageChange={updateActivePage}
          onObjectChange={updateObject}
          onBackgroundUpload={handleBackgroundUpload}
          onReorder={reorderSelected}
          onDuplicateSelected={duplicateSelected}
          onDeleteSelected={deleteSelected}
        />
      </div>
    </div>
  );
}
