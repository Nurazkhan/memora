import React from 'react';
import {
  PAGE_WIDTH,
  SAMPLE_TEMPLATE_DATA,
  getPageHeight,
  normalizePage,
  resolveTemplateText,
} from './templateUtils';

function frameColor(role) {
  if (role === 'group') return '#22c55e';
  if (role === 'class') return '#f59e0b';
  if (role === 'free') return '#8b5cf6';
  return '#3b82f6';
}

export default function TemplateMiniPreview({ page, selected = false, showLabel = false, label }) {
  const normalizedPage = normalizePage(page);
  const pageHeight = getPageHeight(normalizedPage.orientation);
  const previewHeight = normalizedPage.orientation === 'landscape' ? 120 : 160;
  const scale = previewHeight / pageHeight;

  return (
    <div
      style={{
        width: PAGE_WIDTH * scale,
        height: pageHeight * scale,
        maxWidth: '100%',
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        background: normalizedPage.background_path
          ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(235,239,245,0.98))'
          : 'linear-gradient(180deg, #ffffff, #f8fafc)',
        border: `1px solid ${selected ? 'rgba(124, 92, 252, 0.45)' : 'rgba(15, 23, 42, 0.08)'}`,
        boxShadow: selected
          ? '0 12px 30px rgba(124, 92, 252, 0.18)'
          : '0 10px 25px rgba(15, 23, 42, 0.08)',
      }}
    >
      {normalizedPage.background_path && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at top right, rgba(124, 92, 252, 0.14), transparent 48%), linear-gradient(135deg, rgba(15,23,42,0.04), rgba(255,255,255,0))',
          }}
        />
      )}

      {normalizedPage.objects.filter((object) => !object.deleted).map((object) => {
        if (object.type === 'frame') {
          const color = frameColor(object.role);
          return (
            <div
              key={object.id}
              style={{
                position: 'absolute',
                left: object.x * scale,
                top: object.y * scale,
                width: object.width * scale,
                height: object.height * scale,
                borderRadius: object.shape === 'circle' ? '999px' : 8,
                border: `1px solid ${color}`,
                background: `${color}22`,
              }}
            />
          );
        }

        return (
          <div
            key={object.id}
            style={{
              position: 'absolute',
              left: object.x * scale,
              top: object.y * scale,
              width: object.width * scale,
              color: object.fill || '#1f2937',
              fontSize: Math.max(8, (object.font_size || 18) * scale),
              fontWeight: object.source_type === 'variable' ? 700 : 500,
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: object.align || 'left',
              opacity: object.opacity ?? 1,
            }}
          >
            {resolveTemplateText(object, SAMPLE_TEMPLATE_DATA)}
          </div>
        );
      })}

      {showLabel && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'rgba(15, 23, 42, 0.72)',
            color: 'white',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
