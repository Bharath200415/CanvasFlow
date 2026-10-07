import { toast } from "sonner";
import Collab from "../feature/Collab/Collab";
import ShapeManager from "./ShapeManager";
import ToolManager from "./ToolManager";
import { ImageShape } from "../Shapes/Image";
import type { Point } from "../Shapes/Point";
import { useGrabToolPosition, useTool } from "../../store/Tools.store";
import {
  getImageFileFromClipboard,
  readImageFile,
  type pastedImage,
} from "../../utils/ImagePaste";

export default class CanvasManager {
  private shapeManager: ShapeManager = new ShapeManager();
  private toolManager: ToolManager;
  private collab: Collab | null = null;

  private saveShapeManagerStateLocalStorage: boolean = false;
  private setInvervals: number[] = [];

  private lastPointerPosition: Point | null = null; // screen coords, for placing pasted images

  private handleMouseDown = (e: MouseEvent) => {
    this.toolManager.onMouseDown(e);
    this.collab?.onMouseDown();
  };
  private handleMouseup = (e: MouseEvent) => {
    this.toolManager.onMouseUp(e);
    this.collab?.onMouseUp();
  };
  private handleMouseMove = (e: MouseEvent) => {
    this.lastPointerPosition = { x: e.clientX, y: e.clientY };
    this.toolManager.onMouseMove(e);
    this.collab?.onMouseMove(e);
  };
  private handleKeyDown = (e: KeyboardEvent) => {
    this.toolManager.onKeyPress(e);
  };

  private handlePaste = (e: ClipboardEvent) => {
    // text boxes handle their own paste
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName == "TEXTAREA" ||
        target.tagName == "INPUT" ||
        target.isContentEditable)
    )
      return;

    const file = getImageFileFromClipboard(e);
    if (!file) return;
    e.preventDefault();

    readImageFile(file)
      .then((image) => this.addPastedImage(image))
      .catch(() => toast.error("Couldn't paste that image"));
  };

  private addPastedImage({ src, width, height }: pastedImage) {
    // fit inside 60% of the viewport, centered on the pointer
    const scale = Math.min(
      1,
      (window.innerWidth * 0.6) / width,
      (window.innerHeight * 0.6) / height,
    );
    const displayWidth = width * scale;
    const displayHeight = height * scale;

    const { x: grabShiftX, y: grabShiftY } = useGrabToolPosition.getState();
    const center = this.lastPointerPosition ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const centerX = center.x - grabShiftX;
    const centerY = center.y - grabShiftY;

    const image = new ImageShape(
      src,
      centerX - displayWidth / 2,
      centerY - displayHeight / 2,
      centerX + displayWidth / 2,
      centerY + displayHeight / 2,
    );
    this.shapeManager.handleShapeUpdateEvent({
      _id: crypto.randomUUID(),
      eventType: "addShape",
      shapeId: image.shapeId,
      payload: { shape: image },
    });

    // so it can be moved / resized right away
    useTool.setState({ selectedTool: "cursor" });
  }

  private saveShapeManagerLocalStorageIfValid = () => {
    if (this.saveShapeManagerStateLocalStorage) {
      this.shapeManager.saveStateLocalStorage();
    }
  };
  private handlePageHide = () => {
    // localStorage.setItem(
    //   "debug_pagehide",
    //   JSON.stringify({
    //     flag: this.saveShapeManagerStateLocalStorage,
    //     shapes: this.shapeManager.shapes,
    //     time: Date.now(),
    //   }),
    // );
    // this.saveShapeManagerLocalStorageIfValid();
    //
    //
    // FUKCEDDDDDDDDDDDDD UPPPPPPPPPPP
    // this is clearing out localstorage on closing window when colab is on, need to check some destructors chain etc, that might be fucking it up, leaving for now
  };

  draw(ctx: CanvasRenderingContext2D) {
    this.shapeManager.draw(ctx);
    this.collab?.draw(ctx);
  }

  private setupEventListeners() {
    document.addEventListener("pointerdown", this.handleMouseDown);
    document.addEventListener("pointerup", this.handleMouseup);
    document.addEventListener("pointermove", this.handleMouseMove);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("paste", this.handlePaste);
    window.addEventListener("pagehide", this.handlePageHide);

    let id = setInterval(() => {
      this.saveShapeManagerLocalStorageIfValid();
    }, 5000);
    this.setInvervals.push(id);
  }
  private removeEventListeners() {
    document.removeEventListener("pointerdown", this.handleMouseDown);
    document.removeEventListener("pointerup", this.handleMouseup);
    document.removeEventListener("pointermove", this.handleMouseMove);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("paste", this.handlePaste);

    this.setInvervals.forEach((id) => clearInterval(id));
  }

  stopCurrentCollab() {
    this.collab?.destructor();
    this.collab = null;

    this.shapeManager.saveStateLocalStorage();
    this.saveShapeManagerStateLocalStorage = true;
  }

  startCollab() {
    if (this.collab) return;

    this.shapeManager.saveStateLocalStorage();
    this.saveShapeManagerStateLocalStorage = false;

    this.collab = new Collab(this.shapeManager);
  }

  constructor(
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    editableTextContainerRef: React.RefObject<HTMLDivElement | null>,
  ) {
    this.toolManager = new ToolManager(
      this.shapeManager,
      canvasRef,
      editableTextContainerRef,
    );

    this.setupEventListeners();

    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("roomId");
    if (roomId) {
      // try connecting to collab
      this.collab = new Collab(this.shapeManager, roomId);
    } else {
      this.saveShapeManagerStateLocalStorage = true;
      this.shapeManager.loadStateLocalStorage();
    }
  }

  destructor() {
    this.removeEventListeners();

    this.collab?.destructor();
    this.toolManager.destructor();
    this.shapeManager.destructor();
  }
}
