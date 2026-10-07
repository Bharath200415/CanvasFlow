import type { Point } from "../Shapes/Point";
import type { Shape, shapeId, ShapeType } from "../Shapes/Shape";
import type {
  eventType,
  shapeUpdateEvent,
  shapeUpdateEventId,
} from "../../types/shapeUpdateEvents";
import { deserializeShape } from "../../utils/Deserialization";
import { toast } from "sonner";

type shapeUpdateSubId = string;

// local: this user's actions, external: collab peers / restored state, history: undo / redo
export type eventSource = "local" | "external" | "history";

type shapeUpdateSubCallback = (
  shapeType: ShapeType,
  event: shapeUpdateEvent,
  source: eventSource,
) => void;
type subsInfo = shapeUpdateSubCallback[];
type subsEventMapping = Partial<Record<"all" | eventType, subsInfo>>;
type shapeUpdateSubs = Partial<Record<"all" | shapeId, subsEventMapping>>;

export default class ShapeManager {
  shapes: Record<shapeId, Shape> = {};

  perShapeUpdateEvents: Record<string, shapeUpdateEvent[]> = {};
  shapeUpdateEvents: [shapeUpdateEvent, ShapeType][] = [];

  shapeUpdateEventsInverse: Record<shapeUpdateEventId, shapeUpdateEvent> = {}; // og event id mapped to inverse event

  shapeUpdateEventSubscriptions: shapeUpdateSubs = {};
  shapeUpdateEventSubscriptionsInfo: Record<
    shapeUpdateSubId,
    {
      shape: shapeId | "all";
      event: eventType | "all";
      cb: shapeUpdateSubCallback;
    }
  > = {};

  draw(ctx: CanvasRenderingContext2D) {
    const selectionShapes: Shape[] = [];
    Object.values(this.shapes).forEach((shape) => {
      if (shape.shapeType == "selection") selectionShapes.push(shape);
      else shape.draw(ctx);
    });
    selectionShapes.forEach((shape) => shape.draw(ctx));
  }

  subsribeShapeUpdateEvents(
    shape: "all" | shapeId,
    event: "all" | eventType,
    shapeUpdateSubCallback: shapeUpdateSubCallback,
  ): shapeUpdateSubId {
    let subId = crypto.randomUUID();

    if (!this.shapeUpdateEventSubscriptions[shape]) {
      this.shapeUpdateEventSubscriptions[shape] = { [event]: [] };
    } else if (!this.shapeUpdateEventSubscriptions[shape][event])
      this.shapeUpdateEventSubscriptions[shape][event] = [];

    this.shapeUpdateEventSubscriptionsInfo[subId] = {
      shape,
      event,
      cb: shapeUpdateSubCallback,
    };
    this.shapeUpdateEventSubscriptions[shape][event]!.push(
      shapeUpdateSubCallback,
    );

    return subId;
  }

  unsubsribeShapeUpdateEvents(shapeUpdateSubId: shapeUpdateSubId) {
    let subInfo = this.shapeUpdateEventSubscriptionsInfo[shapeUpdateSubId];
    if (
      subInfo &&
      this.shapeUpdateEventSubscriptions[subInfo.shape]?.[subInfo.event]
    ) {
      this.shapeUpdateEventSubscriptions[subInfo.shape]![subInfo.event] =
        this.shapeUpdateEventSubscriptions[subInfo.shape]![
          subInfo.event
        ]?.filter((cb) => cb != subInfo.cb);

      delete this.shapeUpdateEventSubscriptionsInfo[shapeUpdateSubId];

      if (
        this.shapeUpdateEventSubscriptions[subInfo.shape]?.[subInfo.event]
          ?.length == 0
      ) {
        delete this.shapeUpdateEventSubscriptions[subInfo.shape]?.[
          subInfo.event
        ];
      }
      if (
        Object.keys(
          this.shapeUpdateEventSubscriptions[subInfo.shape] || { 1: 1 },
        ).length == 0
      ) {
        delete this.shapeUpdateEventSubscriptions[subInfo.shape];
      }
    }
  }
  passEventToSubscribers(
    shapeType: ShapeType,
    op: shapeUpdateEvent,
    source: eventSource,
  ) {
    this.shapeUpdateEventSubscriptions?.["all"]?.["all"]?.forEach((cb) =>
      cb(shapeType, op, source),
    );
    if (op.eventType != "addShape") {
      this.shapeUpdateEventSubscriptions?.[op.shapeId]?.["all"]?.forEach((cb) =>
        cb(shapeType, op, source),
      );
      this.shapeUpdateEventSubscriptions?.[op.shapeId]?.[op.eventType]?.forEach(
        (cb) => cb(shapeType, op, source),
      );
    }
  }
  handleShapeUpdateEvent(op: shapeUpdateEvent, source: eventSource = "local") {
    let shapetype = this.shapes[op.shapeId]?.shapeType;
    switch (op.eventType) {
      case "addShape":
        {
          this.shapeUpdateEventsInverse[op._id] = {
            _id: crypto.randomUUID(),
            eventType: "deleteShape",
            shapeId: op.shapeId,
          };
          this.shapes[op.shapeId] = op.payload.shape;
        }
        break;

      case "deleteShape":
        {
          this.shapeUpdateEventsInverse[op._id] = {
            _id: crypto.randomUUID(),
            eventType: "addShape",
            shapeId: op.shapeId,
            payload: { shape: this.shapes[op.shapeId] },
          };
          delete this.shapes[op.shapeId];
        }
        break;
      case "updateEnclosingRectangle":
        {
          let [x1, y1, x2, y2] =
            this.shapes[op.shapeId].getEnclosingRectangle();

          // a move is undone exactly by moving back, no rescaling involved
          this.shapeUpdateEventsInverse[op._id] =
            op.payload.toUpdate == "moveFull"
              ? {
                  _id: crypto.randomUUID(),
                  eventType: "updateEnclosingRectangle",
                  shapeId: op.shapeId,
                  payload: {
                    toUpdate: "moveFull",
                    delX: -(op.payload.delX ?? 0),
                    delY: -(op.payload.delY ?? 0),
                  },
                }
              : {
                  _id: crypto.randomUUID(),
                  eventType: "updateEnclosingRectangle",
                  shapeId: op.shapeId,
                  payload: { toUpdate: "updateFull", x1, y1, x2, y2 },
                };
          this.shapes[op.shapeId].applyUpdateEvent(op);
        }
        break;
      case "updateProperty":
        {
          let curShape = this.shapes[op.shapeId];
          this.shapeUpdateEventsInverse[op._id] = {
            _id: crypto.randomUUID(),
            eventType: "updateProperty",
            shapeId: op.shapeId,
            payload: Object.keys(op.payload).reduce((prevVal, key) => {
              let curVal: unknown = curShape[key as keyof typeof curShape];
              if (curVal === undefined) return prevVal;

              // snapshot, tools mutate things like the points array in place.
              // selection holds shape instances which cant be cloned (and are never undone)
              if (curShape.shapeType != "selection")
                curVal = structuredClone(curVal);

              return { ...prevVal, [key]: curVal };
            }, {}),
          };

          this.shapes[op.shapeId].applyUpdateEvent(op);
        }
        break;
      default:
        return;
    }

    if (!shapetype) shapetype = this.shapes[op.shapeId]?.shapeType;

    this.shapeUpdateEvents.push([op, shapetype]);
    this.passEventToSubscribers(shapetype, op, source);
  }
  destructor() {}

  getShapesAt(x: number, y: number): Shape[] {
    return Object.values(this.shapes).filter((shape) =>
      shape.containsPoint(x, y),
    );
  }
  getShapesInside(point1: Point, point2: Point) {
    return Object.values(this.shapes).filter((shape) =>
      shape.liesInside(point1, point2),
    );
  }

  saveStateLocalStorage() {
    //
    let eventsToSave: { type: string; payload: any }[] = [];

    Object.values(this.shapes).forEach((shape) => {
      if (shape.shapeType != "selection") {
        eventsToSave.push({
          type: "addShape",
          payload: {
            shape: shape.serialize(),
          },
        });
      }
    });
    try {
      localStorage.setItem(
        "shapeManagerLocalState",
        JSON.stringify(eventsToSave),
      );
    } catch {
      // quota exceeded, mostly from big images. same id so the 5s autosave doesnt stack toasts
      toast.error("Canvas is too large to save locally, try removing some images", {
        id: "localStorageFull",
      });
    }
  }
  loadStateLocalStorage() {
    let savedEvents: any[] = JSON.parse(
      localStorage.getItem("shapeManagerLocalState") || "[]",
    );

    savedEvents.forEach((ev) => {
      let newshape = deserializeShape(ev.payload.shape!);
      this.handleShapeUpdateEvent(
        {
          _id: crypto.randomUUID(),
          eventType: "addShape",
          shapeId: newshape!.shapeId,
          payload: { shape: newshape! },
        },
        "external",
      );
    });
  }
}
