import { useGrabToolPosition } from "../../store/Tools.store";

export type Point = {
  x: number;
  y: number;
};
export function isSamePoint(point1: Point, point2: Point): Boolean {
  let threshold = 4 / useGrabToolPosition.getState().zoom; // 4 screen pixels
  return (
    Math.abs(point1.x - point2.x) <= threshold &&
    Math.abs(point1.y - point2.y) <= threshold
  );
}
