import React, { useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Transformer, Text as KonvaText, Image as KonvaImage, Line, Group } from 'react-konva';
import useImage from 'use-image';

const API_BASE = 'http://127.0.0.1:8599';

function EditorObject({ object, isSelected, onSelect, onChange, onDragMove, canvasScale }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && !object.locked) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, object.locked]);

  const commonProps = {
    ref: shapeRef,
    draggable: !object.locked,
    onClick: onSelect,
    onTap: onSelect,
    onDragMove: onDragMove,
    onDragEnd: (e) => {
      onChange(object.id, { x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: (e) => {
      const node = shapeRef.current;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      
      const newProps = {
        x: node.x(),
        y: node.y(),
        width: node.width() * scaleX,
        height: node.height() * scaleY,
        rotation: node.rotation()
      };
      
      if (object.type === 'text') {
        newProps.font_size = Math.round((object.font_size || 16) * scaleY);
      }
      
      onChange(object.id, newProps);
    }
  };

  if (object.type === 'frame') {
    const color = object.role === 'individual' ? '#3b82f6' : (object.role === 'group' ? '#10b981' : '#f59e0b');
    return (
      <React.Fragment>
        {object.shape === 'circle' ? (
          <Circle 
            {...commonProps} 
            x={object.x + object.width / 2} 
            y={object.y + object.height / 2} 
            radius={object.width / 2}
            fill={color + '40'}
            stroke={color}
            strokeWidth={1}
          />
        ) : (
          <Rect 
            {...commonProps} 
            x={object.x} 
            y={object.y} 
            width={object.width} 
            height={object.height} 
            fill={color + '40'}
            stroke={color}
            strokeWidth={1}
          />
        )}
        {isSelected && !object.locked && <Transformer ref={trRef} rotateEnabled={true} />}
      </React.Fragment>
    );
  }

  if (object.type === 'text') {
    const displayText = object.source_type === 'variable' ? `{{${object.source_variable}}}` : (object.content || 'Sample Text');
    return (
      <React.Fragment>
        <KonvaText 
          {...commonProps} 
          x={object.x} 
          y={object.y} 
          text={displayText} 
          fontSize={object.font_size || 16}
          align={object.align || 'left'}
          width={object.width}
          fill="#1f2937"
        />
        {isSelected && !object.locked && <Transformer ref={trRef} rotateEnabled={true} />}
      </React.Fragment>
    );
  }

  return null;
}

export default function StageArea({ activePage, selectedIds, onSelect, onObjectChange, onDragMove, canvasScale, guides }) {
  const [bgImage] = useImage(activePage.background_path ? `${API_BASE}/files/templates_assets/${activePage.background_path.split(/[\\/]/).pop()}` : null);
  const stageRef = useRef();

  return (
    <div className="stage-container" style={{ flex: 1, background: '#f3f4f6', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
       <div style={{ position: 'relative', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
          <Stage 
            ref={stageRef}
            width={1000 * canvasScale}
            height={(activePage.orientation === 'landscape' ? 707 : 1414) * canvasScale}
            scaleX={canvasScale}
            scaleY={canvasScale}
            onMouseDown={(e) => {
               if (e.target === stageRef.current) onSelect([]);
            }}
          >
            <Layer>
               <Rect 
                 width={1000} 
                 height={activePage.orientation === 'landscape' ? 707 : 1414} 
                 fill="white" 
               />
               {bgImage && (
                 <KonvaImage 
                   image={bgImage} 
                   width={1000} 
                   height={activePage.orientation === 'landscape' ? 707 : 1414} 
                 />
               )}
               {activePage.objects.filter(o => !o.deleted).map(obj => (
                 <EditorObject 
                   key={obj.id} 
                   object={obj} 
                   isSelected={selectedIds.includes(obj.id)} 
                   onSelect={(e) => {
                     e.cancelBubble = true;
                     onSelect(e.evt.shiftKey ? [...selectedIds, obj.id] : [obj.id]);
                   }}
                   onChange={onObjectChange}
                   onDragMove={(e) => onDragMove(e, obj.id)}
                   canvasScale={canvasScale}
                 />
               ))}
               
               {/* Snapping Guides */}
               {guides.map((g, i) => (
                  <Line 
                    key={i} 
                    points={g.orientation === 'V' ? [g.pos, 0, g.pos, 2000] : [0, g.pos, 2000, g.pos]} 
                    stroke="#3b82f6" 
                    strokeWidth={1 / canvasScale} 
                    dash={[4, 4]} 
                  />
               ))}
            </Layer>
          </Stage>
       </div>
    </div>
  );
}
