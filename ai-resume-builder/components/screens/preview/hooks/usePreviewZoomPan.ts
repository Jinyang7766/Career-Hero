import React from 'react';

type PinchState = { startDistance: number; startScale: number } | null;
type PanState = { startX: number; startY: number; originX: number; originY: number } | null;

const getTouchDistance = (touches: React.TouchList): number => {
  if (!touches || touches.length < 2) return 0;
  const t1 = touches[0];
  const t2 = touches[1];
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

export const usePreviewZoomPan = () => {
  const [previewScale, setPreviewScale] = React.useState(1);
  const [pinchState, setPinchState] = React.useState<PinchState>(null);
  const [previewOffset, setPreviewOffset] = React.useState({ x: 0, y: 0 });
  const panStateRef = React.useRef<PanState>(null);
  const previewCardRef = React.useRef<HTMLDivElement | null>(null);
  const isZoomed = previewScale > 1.02;

  const clampOffset = React.useCallback((x: number, y: number, scale: number) => {
    const card = previewCardRef.current;
    if (!card || scale <= 1) return { x: 0, y: 0 };
    const width = card.offsetWidth || 0;
    const height = card.offsetHeight || 0;
    const maxX = ((scale - 1) * width) / 2;
    const maxY = ((scale - 1) * height) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const handlePreviewTouchStart = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      const distance = getTouchDistance(event.touches);
      if (!distance) return;
      panStateRef.current = null;
      setPinchState({ startDistance: distance, startScale: previewScale });
      return;
    }
    if (event.touches.length === 1 && isZoomed && !pinchState) {
      const touch = event.touches[0];
      panStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        originX: previewOffset.x,
        originY: previewOffset.y,
      };
    }
  }, [isZoomed, pinchState, previewOffset.x, previewOffset.y, previewScale]);

  const handlePreviewTouchMove = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2 && pinchState) {
      const distance = getTouchDistance(event.touches);
      if (!distance) return;
      const ratio = distance / Math.max(1, pinchState.startDistance);
      const next = Math.min(2.5, Math.max(1, pinchState.startScale * ratio));
      setPreviewScale(next);
      setPreviewOffset((prev) => clampOffset(prev.x, prev.y, next));
      event.preventDefault();
      return;
    }
    if (event.touches.length === 1 && isZoomed && panStateRef.current) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - panStateRef.current.startX;
      const deltaY = touch.clientY - panStateRef.current.startY;
      const nextX = panStateRef.current.originX + deltaX;
      const nextY = panStateRef.current.originY + deltaY;
      setPreviewOffset(clampOffset(nextX, nextY, previewScale));
      event.preventDefault();
    }
  }, [clampOffset, isZoomed, pinchState, previewScale]);

  const handlePreviewTouchEnd = React.useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) return;
    if (event.touches.length === 1 && isZoomed) {
      const touch = event.touches[0];
      panStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        originX: previewOffset.x,
        originY: previewOffset.y,
      };
    } else {
      panStateRef.current = null;
    }
    setPinchState(null);
    if (previewScale < 1.03) {
      setPreviewScale(1);
      setPreviewOffset({ x: 0, y: 0 });
    }
  }, [isZoomed, previewOffset.x, previewOffset.y, previewScale]);

  return {
    previewScale,
    previewOffset,
    previewCardRef,
    isZoomed,
    handlePreviewTouchStart,
    handlePreviewTouchMove,
    handlePreviewTouchEnd,
  };
};

