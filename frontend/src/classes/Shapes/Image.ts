import type { ShapeType, shapeId } from "./Shape";
import { Shape } from "./Shape";

import { useGrabToolPosition, type opacity } from "../../store/Tools.store";
import type { Point } from "./Point";
import type { shapeUpdateEvent } from "../../types/shapeUpdateEvents";

export class ImageShape implements Shape {
  readonly shapeId: shapeId;
  readonly shapeType: ShapeType = "image";

  private _src: string;
  private _imageElement: HTMLImageElement;
  private _opacity: opacity = 100;

  private _startX: number;
  private _startY: number;
  private _endX: number;
  private _endY: number;

  get src() {
    return this._src;
  }

  get opacity() {
    return this._opacity;
  }

  setOpacity(opacity: opacity) {
    this._opacity = opacity;
  }

  clone(): Shape {
    let image = new ImageShape(
      this._src,
      this._startX,
      this._startY,
      this._endX,
      this._endY,
      crypto.randomUUID(),
      this._imageElement,
    );
    image.setOpacity(this._opacity);
    return image;
  }

  constructor(
    src: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    shapeId: string = crypto.randomUUID(),
    imageElement?: HTMLImageElement,
  ) {
    this.shapeId = shapeId;
    this._src = src;
    this._startX = startX;
    this._startY = startY;
    this._endX = endX;
    this._endY = endY;

    // clones share the decoded element, so the image isnt decoded again
    if (imageElement) this._imageElement = imageElement;
    else {
      this._imageElement = new Image();
      this._imageElement.src = src;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // still loading or broken src, render loop will pick it up once loaded
    if (!this._imageElement.complete || this._imageElement.naturalWidth == 0)
      return;

    const { x: offsetX, y: offsetY } = useGrabToolPosition.getState();
    let [x1, y1, x2, y2] = this.getEnclosingRectangle();

    ctx.save();
    ctx.transform(1, 0, 0, 1, offsetX, offsetY);
    ctx.globalAlpha = this._opacity / 100.0;
    ctx.drawImage(this._imageElement, x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
  }

  getEnclosingRectangle(): [number, number, number, number] {
    let x1 = Math.min(this._startX, this._endX);
    let x2 = Math.max(this._startX, this._endX);
    let y1 = Math.min(this._startY, this._endY);
    let y2 = Math.max(this._startY, this._endY);
    return [x1, y1, x2, y2];
  }

  updateEnclosingRectangle(x1: number, y1: number, x2: number, y2: number) {
    this._startX = x1;
    this._startY = y1;
    this._endX = x2;
    this._endY = y2;
  }

  moveEnclosingRectangle(delX: number, delY: number) {
    this._startX += delX;
    this._endX += delX;
    this._startY += delY;
    this._endY += delY;
  }

  containsPoint(x: number, y: number) {
    let [sx, sy, ex, ey] = this.getEnclosingRectangle();
    return x >= sx && x <= ex && y >= sy && y <= ey;
  }

  liesInside(point1: Point, point2: Point) {
    let [sx, sy, ex, ey] = this.getEnclosingRectangle();
    let minx = Math.min(point1.x, point2.x);
    let miny = Math.min(point1.y, point2.y);
    let maxx = Math.max(point1.x, point2.x);
    let maxy = Math.max(point1.y, point2.y);

    return sx >= minx && ex <= maxx && sy >= miny && ey <= maxy;
  }

  propertySetters = {
    opacity: this.setOpacity.bind(this),
  };

  applyUpdateEvent(shapeUpdateEvent: shapeUpdateEvent) {
    switch (shapeUpdateEvent.eventType) {
      case "updateProperty":
        {
          Object.entries(shapeUpdateEvent.payload).forEach(([key, val]) => {
            let typedProp = key as keyof typeof this.propertySetters;
            let typedFn = this.propertySetters[typedProp] as (val: any) => void;
            typedFn?.(val);
          });
        }
        break;
      case "updateEnclosingRectangle":
        {
          switch (shapeUpdateEvent.payload.toUpdate) {
            case "updateFull":
              {
                let { x1, y1, x2, y2 } = shapeUpdateEvent.payload;
                this.updateEnclosingRectangle(x1!, y1!, x2!, y2!);
              }
              break;
            case "moveFull":
              {
                this.moveEnclosingRectangle(
                  shapeUpdateEvent.payload.delX!,
                  shapeUpdateEvent.payload.delY!,
                );
              }
              break;
            default:
              break;
          }
        }
        break;

      default:
        break;
    }
  }
  serialize(): any {
    return {
      shapeType: "image",
      shapeId: this.shapeId,

      src: this._src,

      startX: this._startX,
      startY: this._startY,
      endX: this._endX,
      endY: this._endY,

      opacity: this._opacity,
    };
  }
  static deserialize(serializedShape: any): Shape {
    const { shapeId, src, startX, startY, endX, endY, opacity } =
      serializedShape;

    let newShape = new ImageShape(src, startX, startY, endX, endY, shapeId);
    newShape._opacity = opacity ?? 100;

    return newShape;
  }
}
