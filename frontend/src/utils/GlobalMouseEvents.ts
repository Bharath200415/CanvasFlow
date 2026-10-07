import { useGrabToolPosition } from "../store/Tools.store";

export type globalMouseEvent = {
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  ogX: number;
  ogY?: number;
};

export function getGlobalMouseEvent(e: MouseEvent): globalMouseEvent {
  const { x: grabshiftX, y: grabshiftY, zoom } = useGrabToolPosition.getState();
  return {
    clientX: e.clientX / zoom - grabshiftX,
    clientY: e.clientY / zoom - grabshiftY,
    x: e.x / zoom - grabshiftX,
    y: e.y / zoom - grabshiftY,
    ogX: e.x,
    ogY: e.y,
  };
}

// places a text editing textarea over a canvas position, matching pan + zoom
export function positionTextEditor(
  element: HTMLElement,
  canvasX: number,
  canvasY: number,
) {
  const { x: grabshiftX, y: grabshiftY, zoom } = useGrabToolPosition.getState();
  element.style.left = `${(canvasX + grabshiftX) * zoom}px`;
  element.style.top = `${(canvasY + grabshiftY) * zoom}px`;
  element.style.transformOrigin = "0 0";
  element.style.transform = `scale(${zoom})`;
}
