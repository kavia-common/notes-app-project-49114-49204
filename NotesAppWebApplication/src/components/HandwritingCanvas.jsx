import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import './handwriting.css';

/**
 * PUBLIC_INTERFACE
 * HandwritingCanvas component
 * A reusable canvas for handwriting/drawing with pointer events, pressure sensitivity (when available),
 * pen/eraser tools, color, thickness controls, undo/redo stack, clear, and export to PNG data URL.
 *
 * Props:
 * - width: number (canvas width in CSS pixels)
 * - height: number (canvas height in CSS pixels)
 * - initialStrokes: array (optional) previously saved strokes to restore
 * - backgroundColor: string (default: '#ffffff') canvas bg color when exporting
 * - onChange: function(strokes) called whenever the stroke stack changes
 *
 * Exposed methods via ref:
 * - getImageDataURL(): string - returns PNG data URL of the current drawing
 * - getStrokes(): array - current strokes list
 * - setStrokes(strokes): void - replace strokes and redraw
 * - clear(): void - clear canvas
 */
const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  { width = 600, height = 400, initialStrokes = [], backgroundColor = '#ffffff', onChange },
  ref
) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#1f2937'); // default gray-800
  const [thickness, setThickness] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);

  // strokes: [{ tool, color, thickness, points: [{x,y,pressure}], compositeOperation }]
  const [strokes, setStrokes] = useState(Array.isArray(initialStrokes) ? initialStrokes : []);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Adjust for HiDPI displays
    const displayWidth = width;
    const displayHeight = height;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.width = Math.floor(displayWidth * devicePixelRatio);
    canvas.height = Math.floor(displayHeight * devicePixelRatio);

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    // Fill background
    ctx.save();
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    ctx.restore();
    redrawAll();
  }, [width, height, devicePixelRatio, backgroundColor]);

  const drawStroke = (ctx, stroke) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = stroke.compositeOperation || (stroke.tool === 'eraser' ? 'destination-out' : 'source-over');
    ctx.strokeStyle = stroke.color || '#000000';
    ctx.fillStyle = stroke.color || '#000000';

    ctx.beginPath();
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      const prev = stroke.points[i - 1];
      // Pressure-aware line width if provided, otherwise use thickness
      const lw = Math.max(0.5, (p.pressure ? p.pressure : 1) * stroke.thickness);
      ctx.lineWidth = lw;
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
        // draw a dot for taps
        ctx.lineTo(p.x + 0.01, p.y + 0.01);
      } else {
        // Smooth out small jumps
        const midX = (prev.x + p.x) / 2;
        const midY = (prev.y + p.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    // clear
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
    ctx.restore();

    // draw strokes
    for (const s of strokes) {
      drawStroke(ctx, s);
    }
  }, [strokes, backgroundColor, devicePixelRatio]);

  useEffect(() => {
    setupCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupCanvas]);

  useEffect(() => {
    // Whenever strokes change, redraw and notify
    redrawAll();
    if (onChange) onChange(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  const getRelativePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    let x, y, pressure = 1;
    if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
      pressure = e.touches[0].force || 1;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      // Pointer Events pressure when available
      if (typeof e.pressure === 'number' && e.pressure > 0) {
        pressure = e.pressure;
      } else {
        pressure = 1;
      }
    }
    return { x, y, pressure };
  };

  const currentStrokeRef = useRef(null);

  const pointerDown = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    redoStackRef.current = [];
    const { x, y, pressure } = getRelativePos(e);
    const stroke = {
      tool,
      color: tool === 'eraser' ? '#000000' : color,
      thickness,
      compositeOperation: tool === 'eraser' ? 'destination-out' : 'source-over',
      points: [{ x, y, pressure }],
      timestamp: Date.now()
    };
    currentStrokeRef.current = stroke;
    // Draw immediate dot
    if (ctxRef.current) drawStroke(ctxRef.current, stroke);
  };

  const pointerMove = (e) => {
    if (!isDrawing || !currentStrokeRef.current) return;
    e.preventDefault();
    const { x, y, pressure } = getRelativePos(e);
    currentStrokeRef.current.points.push({ x, y, pressure });
    if (ctxRef.current) {
      // draw incremental segment
      drawStroke(ctxRef.current, currentStrokeRef.current);
    }
  };

  const endStroke = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const stroke = currentStrokeRef.current;
    if (stroke && stroke.points.length > 0) {
      setStrokes((prev) => {
        undoStackRef.current = [...prev];
        return [...prev, stroke];
      });
    }
    currentStrokeRef.current = null;
  };

  // Attach events for mouse, touch, and pointer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prefer Pointer Events when available
    const supportsPointer = !!window.PointerEvent;

    if (supportsPointer) {
      canvas.addEventListener('pointerdown', pointerDown);
      canvas.addEventListener('pointermove', pointerMove);
      const upEvents = ['pointerup', 'pointercancel', 'pointerleave'];
      upEvents.forEach((ev) => canvas.addEventListener(ev, endStroke));
      return () => {
        canvas.removeEventListener('pointerdown', pointerDown);
        canvas.removeEventListener('pointermove', pointerMove);
        upEvents.forEach((ev) => canvas.removeEventListener(ev, endStroke));
      };
    } else {
      // Fallback to mouse/touch
      canvas.addEventListener('mousedown', pointerDown);
      canvas.addEventListener('mousemove', pointerMove);
      window.addEventListener('mouseup', endStroke);
      canvas.addEventListener('touchstart', pointerDown, { passive: false });
      canvas.addEventListener('touchmove', pointerMove, { passive: false });
      window.addEventListener('touchend', endStroke);

      return () => {
        canvas.removeEventListener('mousedown', pointerDown);
        canvas.removeEventListener('mousemove', pointerMove);
        window.removeEventListener('mouseup', endStroke);
        canvas.removeEventListener('touchstart', pointerDown);
        canvas.removeEventListener('touchmove', pointerMove);
        window.removeEventListener('touchend', endStroke);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawing, tool, color, thickness]);

  // PUBLIC_INTERFACE
  useImperativeHandle(ref, () => ({
    /** Returns a PNG data URL of the current canvas content. */
    getImageDataURL: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      // Build an export canvas to ensure background color
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.floor(width * devicePixelRatio);
      exportCanvas.height = Math.floor(height * devicePixelRatio);
      const ectx = exportCanvas.getContext('2d');
      ectx.scale(devicePixelRatio, devicePixelRatio);
      ectx.fillStyle = backgroundColor;
      ectx.fillRect(0, 0, width, height);
      // redraw strokes into export canvas
      for (const s of strokes) {
        drawStroke(ectx, s);
      }
      return exportCanvas.toDataURL('image/png');
    },
    /** Returns the strokes array for persistence. */
    getStrokes: () => strokes,
    /** Replace current strokes (e.g., restoring). */
    setStrokes: (newStrokes) => {
      undoStackRef.current = strokes;
      redoStackRef.current = [];
      setStrokes(Array.isArray(newStrokes) ? newStrokes : []);
    },
    /** Clears the canvas and history. */
    clear: () => {
      undoStackRef.current = strokes;
      redoStackRef.current = [];
      setStrokes([]);
    },
  }));

  const undo = () => {
    if (strokes.length === 0) return;
    const prev = [...strokes];
    const popped = prev.pop();
    redoStackRef.current = [popped, ...redoStackRef.current];
    setStrokes(prev);
  };

  const redo = () => {
    if (redoStackRef.current.length === 0) return;
    const [first, ...rest] = redoStackRef.current;
    redoStackRef.current = rest;
    setStrokes((prev) => [...prev, first]);
  };

  const clearCanvas = () => {
    if (!strokes.length) return;
    undoStackRef.current = strokes;
    redoStackRef.current = [];
    setStrokes([]);
  };

  const handleToolChange = (e) => setTool(e.target.value);
  const handleColorChange = (e) => setColor(e.target.value);
  const handleThickness = (e) => setThickness(parseFloat(e.target.value));

  return (
    <div className="handwriting-container">
      <div className="handwriting-toolbar" role="toolbar" aria-label="Handwriting tools">
        <label>
          <input
            type="radio"
            name="tool"
            value="pen"
            checked={tool === 'pen'}
            onChange={handleToolChange}
          />
          Pen
        </label>
        <label>
          <input
            type="radio"
            name="tool"
            value="eraser"
            checked={tool === 'eraser'}
            onChange={handleToolChange}
          />
          Eraser
        </label>
        <label className="color-picker">
          Color
          <input type="color" value={color} onChange={handleColorChange} disabled={tool === 'eraser'} />
        </label>
        <label className="thickness-picker">
          Thickness
          <input
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={thickness}
            onChange={handleThickness}
          />
          <span className="thickness-value">{thickness.toFixed(1)}</span>
        </label>
        <button type="button" onClick={undo} aria-label="Undo" title="Undo" className="hw-btn">↶</button>
        <button type="button" onClick={redo} aria-label="Redo" title="Redo" className="hw-btn">↷</button>
        <button type="button" onClick={clearCanvas} aria-label="Clear" title="Clear canvas" className="hw-btn danger">Clear</button>
      </div>
      <div className="handwriting-stage">
        <canvas ref={canvasRef} className="handwriting-canvas" />
      </div>
    </div>
  );
});

export default HandwritingCanvas;
