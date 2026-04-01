export const PAGE_WIDTH = 1000;
export const PAGE_HEIGHTS = {
  landscape: 707,
  portrait: 1414,
};

export const SAMPLE_TEMPLATE_DATA = {
  student: {
    name: 'Aruzhan S.',
    class: '11-B',
    number: '24',
  },
  project: {
    name: 'Graduation Album 2026',
  },
};

export function getPageHeight(orientation = 'landscape') {
  return PAGE_HEIGHTS[orientation] || PAGE_HEIGHTS.landscape;
}

export function createId(prefix = 'item') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeObject(object, index = 0) {
  return {
    id: object?.id || createId('obj'),
    type: object?.type || 'frame',
    x: Number(object?.x ?? 80 + index * 24),
    y: Number(object?.y ?? 80 + index * 24),
    width: Number(object?.width ?? (object?.type === 'text' ? 280 : 220)),
    height: Number(object?.height ?? (object?.type === 'text' ? 44 : 220)),
    rotation: Number(object?.rotation ?? 0),
    opacity: Number(object?.opacity ?? 1),
    role: object?.role || 'individual',
    shape: object?.shape || 'rect',
    locked: Boolean(object?.locked),
    deleted: Boolean(object?.deleted),
    source_type: object?.source_type || 'static',
    source_variable: object?.source_variable || 'student.name',
    content: object?.content || '',
    font_size: Number(object?.font_size ?? 22),
    fill: object?.fill || '#1f2937',
    align: object?.align || 'left',
  };
}

export function normalizePage(page, index = 0) {
  return {
    id: page?.id || createId('page'),
    name: page?.name || `Page ${index + 1}`,
    orientation: page?.orientation === 'portrait' ? 'portrait' : 'landscape',
    background_path: page?.background_path || null,
    objects: Array.isArray(page?.objects) ? page.objects.map(normalizeObject) : [],
  };
}

export function normalizePages(rawPages) {
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    return [normalizePage(undefined, 0)];
  }

  return rawPages.map((page, index) => normalizePage(page, index));
}

export function resolveTemplateText(object, sampleData = SAMPLE_TEMPLATE_DATA) {
  if (object?.source_type !== 'variable') {
    return object?.content || 'Sample Text';
  }

  const path = String(object?.source_variable || '').split('.');
  const value = path.reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), sampleData);

  return value != null && value !== '' ? String(value) : `{{${object?.source_variable || 'variable'}}}`;
}

export function getTemplateStats(layout) {
  const pages = normalizePages(layout?.pages);
  const objects = pages.flatMap((page) => page.objects || []);

  return {
    pageCount: pages.length,
    frameCount: objects.filter((object) => object.type === 'frame').length,
    textCount: objects.filter((object) => object.type === 'text').length,
  };
}
