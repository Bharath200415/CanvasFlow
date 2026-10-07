import { useGrabToolPosition } from "../store/Tools.store";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

// changes zoom while keeping the canvas point under (screenX, screenY) fixed on screen
export function zoomAt(screenX: number, screenY: number, newZoom: number) {
  const { x, y, zoom } = useGrabToolPosition.getState();
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

  // canvas point under the cursor: screen / zoom - offset, solve for the new offset
  useGrabToolPosition.setState({
    zoom: clampedZoom,
    x: x + screenX / clampedZoom - screenX / zoom,
    y: y + screenY / clampedZoom - screenY / zoom,
  });
}

export function zoomFromWheel(e: WheelEvent) {
  // firefox reports wheel deltas in lines, others in pixels
  const pixelDelta = e.deltaMode == WheelEvent.DOM_DELTA_LINE ? e.deltaY * 33 : e.deltaY;
  // clamp so a single mouse wheel notch is ~20%, trackpad pinches send small deltas and stay smooth
  const clampedDelta = Math.max(-100, Math.min(100, pixelDelta));

  const { zoom } = useGrabToolPosition.getState();
  zoomAt(e.clientX, e.clientY, zoom * Math.exp(-clampedDelta * 0.002));
}
