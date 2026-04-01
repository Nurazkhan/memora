import React, { useMemo, useState, useEffect } from 'react';
import { getAlbumRecommendations } from '../../api/client';

const API_BASE = 'http://127.0.0.1:8599';

function imageUrl(project, image) {
  const filename = (image?.original_path || '').split(/[\\/]/).pop() || image?.filename || '';
  return `${API_BASE}/files/${(project?.name || '').replace(/ /g, "_").toLowerCase()}/originals/${filename}`;
}

export default function PhotoPreviewSidebar({
  isOpen,
  onClose,
  images,
  project,
  currentImage,
  slotContext,
  projectId,
  onSelectImage,
  onHoverImage,
  onLeaveImage,
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [mode, setMode] = useState('recommended');
  const [recommendedImages, setRecommendedImages] = useState([]);
  const [allImages, setAllImages] = useState(images || []);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setSearch('');
    setSort('recent');
    setMode('recommended');

    async function loadRecommendations() {
      setLoadingRecommendations(true);
      try {
        const res = await getAlbumRecommendations(projectId, {
          role: slotContext?.role || 'individual',
          target_cluster_id: slotContext?.target_cluster_id || null,
        });
        setRecommendedImages(res.data.recommended || []);
        setAllImages(res.data.all_images || images || []);
      } catch (err) {
        console.error('Failed to load recommendations:', err);
        setRecommendedImages([]);
        setAllImages(images || []);
      } finally {
        setLoadingRecommendations(false);
      }
    }

    loadRecommendations();
  }, [isOpen, projectId, slotContext?.role, slotContext?.target_cluster_id]);

  useEffect(() => {
    if (!recommendedImages.length && mode === 'recommended') {
      setMode('all');
    }
  }, [recommendedImages, mode]);

  const sourceImages = mode === 'recommended' ? recommendedImages : allImages;

  const filteredImages = useMemo(() => {
    const list = [...sourceImages].filter((image) =>
      (image.filename || '').toLowerCase().includes(search.toLowerCase())
    );

    list.sort((a, b) => {
      if (sort === 'name') return (a.filename || '').localeCompare(b.filename || '');
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    return list;
  }, [sourceImages, search, sort]);

  const roleLabel =
    slotContext?.role === 'class'
      ? 'Class'
      : slotContext?.role === 'group'
        ? 'Group'
        : 'Portrait';

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 'calc(var(--sidebar-width) + 12px)',
        right: 0,
        bottom: 0,
        height: 280,
        background: 'linear-gradient(180deg, rgba(18,18,26,0.985), rgba(10,10,15,0.995))',
        borderTop: '1px solid var(--border)',
        borderLeft: '1px solid var(--border)',
        borderRadius: '20px 0 0 0',
        boxShadow: '0 -16px 50px rgba(0,0,0,0.35)',
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(16px)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Replace Photo</h3>
          <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            {roleLabel} slot recommendations first. Hover to preview on the album, click to keep.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 999, padding: 4 }}>
            <button
              className="btn btn-sm"
              onClick={() => setMode('recommended')}
              disabled={!recommendedImages.length}
              style={{
                padding: '7px 12px',
                background: mode === 'recommended' ? 'white' : 'transparent',
                color: mode === 'recommended' ? '#111827' : 'var(--text-secondary)',
                boxShadow: mode === 'recommended' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              Recommended
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setMode('all')}
              style={{
                padding: '7px 12px',
                background: mode === 'all' ? 'white' : 'transparent',
                color: mode === 'all' ? '#111827' : 'var(--text-secondary)',
                boxShadow: mode === 'all' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              }}
            >
              Show All
            </button>
          </div>
          <input
            className="form-input"
            placeholder="Search photos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 190 }}
          />
          <select className="form-input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 150 }}>
            <option value="recent">Newest first</option>
            <option value="name">Filename A-Z</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 18px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        {loadingRecommendations
          ? 'Loading smart recommendations...'
          : `${filteredImages.length} ${mode === 'recommended' ? 'recommended' : 'available'} photos`}
        {currentImage?.filename ? ` | current: ${currentImage.filename}` : ''}
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 14 }}>
        {loadingRecommendations ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Preparing recommendations...
          </div>
        ) : filteredImages.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            No matching photos found.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, height: '100%' }}>
            {filteredImages.map((image) => {
              const isCurrent = currentImage?.id === image.id;
              return (
                <button
                  key={image.id}
                  type="button"
                  onMouseEnter={() => onHoverImage && onHoverImage(image)}
                  onMouseLeave={() => onLeaveImage && onLeaveImage()}
                  onClick={() => onSelectImage(image)}
                  style={{
                    width: 124,
                    minWidth: 124,
                    padding: 0,
                    borderRadius: 14,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: isCurrent ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    textAlign: 'left',
                    transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
                    boxShadow: isCurrent ? '0 0 0 4px rgba(124, 92, 252, 0.15)' : 'none',
                  }}
                >
                  <div style={{ height: 116, background: 'var(--bg-tertiary)' }}>
                    <img
                      src={imageUrl(project, image)}
                      alt={image.filename || 'Candidate'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                  <div style={{ padding: 8 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {image.filename}
                    </div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      {isCurrent ? 'Current' : 'Hover preview'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
