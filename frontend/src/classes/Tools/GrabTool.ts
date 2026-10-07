import type ShapeManager from "../Managers/ShapeManager";
import type { EventType } from "../Managers/ToolManager";
import type Tool from "./Tool";
import {
  useGrabToolPosition,
  type Tool as ToolType,
} from "../../store/Tools.store";
import type { Point } from "../Shapes/Point";
import type { globalMouseEvent } from "../../utils/GlobalMouseEvents";

type state = "idle" | "moving";
export default class GrabTool implements Tool {
  toolType: ToolType = "grab";

  shapeManager: ShapeManager;
  curState: state = "idle";

  lastMouseMove: Point = { x: -1e18, y: -1e18 };
  isScreenEmpty = false;

  emit: (tool: ToolType, event: EventType) => void;
  constructor(
    shapeManager: ShapeManager,
    emit: (tool: ToolType, event: EventType) => void,
  ) {
    this.shapeManager = shapeManager;
    this.emit = emit;
  }
  reset(): void {
    this.isScreenEmpty = false;
    this.lastMouseMove.x = -1e18;
    this.lastMouseMove.y = -1e18;
    useGrabToolPosition.setState({ x: 0, y: 0, zoom: 1 });

    this.curState = "idle";

    document.body.style.cursor = "default";
  }
  destructor(): void {
    document.body.style.cursor = "default";
  }

  onCanvasMouseDown(e: globalMouseEvent) {
    if (this.curState == "idle") {
      this.curState = "moving";

      this.lastMouseMove.x = e.clientX;
      this.lastMouseMove.y = e.clientY;
    }
  }

  onCanvasMouseMove(e: globalMouseEvent) {
    if (this.curState == "moving") {
      document.body.style.cursor = "grabbing";

      let dx = e.clientX - this.lastMouseMove.x;
      let dy = e.clientY - this.lastMouseMove.y;

      this.lastMouseMove.x = e.clientX;
      this.lastMouseMove.y = e.clientY;

      // dx, dy are screen pixels, the offset is in canvas units.
      // read the offset fresh each time since zooming also moves it
      const { x, y, zoom } = useGrabToolPosition.getState();
      useGrabToolPosition.setState({
        x: x + dx / zoom,
        y: y + dy / zoom,
      });

      // this.updateScreenEmpty();
    } else document.body.style.cursor = "grab";
  }
  onCanvasMouseUp() {
    if (this.curState == "moving") {
      this.curState = "idle";
    }
  }

  onOtherMouseDown(): void {
    document.body.style.cursor = "default";
  }
  onOtherMouseMove(): void {
    document.body.style.cursor = "default";
  }
  onOtherMouseUp(): void {
    document.body.style.cursor = "default";
  }

  onSwitchTool(): void {}
}
