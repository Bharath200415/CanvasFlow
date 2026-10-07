import type ShapeManager from "./ShapeManager";
import type { eventSource } from "./ShapeManager";
import type { shapeUpdateEvent } from "../../types/shapeUpdateEvents";
import type { ShapeType, shapeId } from "../Shapes/Shape";
import type { Text } from "../Shapes/Text";
import { useHistory } from "../../store/History.store";

const MAX_HISTORY = 100;

// one entry = one user action (a drag, a text editing session, a paste ...)
type historyEntry = shapeUpdateEvent[];

export default class HistoryManager {
  private shapeManager: ShapeManager;
  private subscriptionId: string;

  private undoStack: historyEntry[] = [];
  private redoStack: historyEntry[] = [];

  // events of the action in progress, closed once the action is over
  private currentEntry: historyEntry = [];
  private closeEntryTimeout: number | null = null;

  private isPointerDown = false;
  private textsBeingEdited = new Set<shapeId>();

  constructor(shapeManager: ShapeManager) {
    this.shapeManager = shapeManager;
    this.subscriptionId = this.shapeManager.subsribeShapeUpdateEvents(
      "all",
      "all",
      this.handleShapeUpdateEvent,
    );
    this.syncStore();
  }

  destructor() {
    this.shapeManager.unsubsribeShapeUpdateEvents(this.subscriptionId);
    if (this.closeEntryTimeout != null) clearTimeout(this.closeEntryTimeout);
    useHistory.setState({ canUndo: false, canRedo: false });
  }

  private handleShapeUpdateEvent = (
    shapeType: ShapeType,
    event: shapeUpdateEvent,
    source: eventSource,
  ) => {
    // only this user's own actions are undoable, selection is ui state
    if (source != "local" || shapeType == "selection") return;

    this.currentEntry.push(event);
    this.trackTextEditing(event);
    this.syncStore();

    // a text session ends here, closing right after this task keeps the commit
    // (and an empty text getting deleted) in the session but not the rest of the click
    if (event.eventType == "updateProperty" && event.payload.curState == "render")
      this.scheduleCloseEntry();
    // events outside a gesture (paste, keyboard delete, style menu) group per task
    else if (!this.isPointerDown && !this.isEditingText())
      this.scheduleCloseEntry();
  };

  private trackTextEditing(event: shapeUpdateEvent) {
    if (event.eventType == "addShape") {
      const shape = event.payload.shape;
      if (shape.shapeType == "text" && (shape as Text).curState == "edit")
        this.textsBeingEdited.add(shape.shapeId);
    } else if (event.eventType == "updateProperty") {
      if (event.payload.curState == "edit")
        this.textsBeingEdited.add(event.shapeId);
      else if (event.payload.curState == "render")
        this.textsBeingEdited.delete(event.shapeId);
    } else if (event.eventType == "deleteShape") {
      this.textsBeingEdited.delete(event.shapeId);
    }
  }

  private isEditingText() {
    // double check against the shapes so a missed event cant keep an entry open forever
    this.textsBeingEdited.forEach((id) => {
      const shape = this.shapeManager.shapes[id] as Text | undefined;
      if (!shape || shape.curState != "edit") this.textsBeingEdited.delete(id);
    });
    return this.textsBeingEdited.size > 0;
  }

  private scheduleCloseEntry() {
    if (this.closeEntryTimeout != null) return;
    this.closeEntryTimeout = setTimeout(() => {
      this.closeEntryTimeout = null;
      this.closeEntry();
    }, 0);
  }

  private closeEntry() {
    if (this.closeEntryTimeout != null) {
      clearTimeout(this.closeEntryTimeout);
      this.closeEntryTimeout = null;
    }
    if (this.currentEntry.length == 0) return;

    this.undoStack.push(this.currentEntry);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.currentEntry = [];
    this.syncStore();
  }

  onPointerDown() {
    this.isPointerDown = true;
    // a new gesture starts a new entry, unless it's the click that finishes a text edit
    if (!this.isEditingText()) this.closeEntry();
  }

  onPointerUp() {
    this.isPointerDown = false;
    if (!this.isEditingText()) this.scheduleCloseEntry();
  }

  undo() {
    this.moveEntry(this.undoStack, this.redoStack);
  }

  redo() {
    this.moveEntry(this.redoStack, this.undoStack);
  }

  // undoing an entry applies its inverses, and those applied events become the
  // entry on the other stack, so undo and redo are the same operation
  private moveEntry(from: historyEntry[], to: historyEntry[]) {
    // not in the middle of a drag or a text edit (the textarea has its own undo)
    if (this.isPointerDown || this.isEditingText()) return;
    this.closeEntry();

    while (from.length > 0) {
      const applied = this.applyInverses(from.pop()!);
      // everything in it may be gone already (eg. a collaborator deleted those shapes)
      if (applied.length > 0) {
        to.push(applied);
        break;
      }
    }
    this.syncStore();
  }

  private applyInverses(entry: historyEntry): historyEntry {
    const inverses = [...entry]
      .reverse()
      .map((event) => this.shapeManager.shapeUpdateEventsInverse[event._id])
      .filter((inverse) => inverse != undefined);

    // text derives its font size from its rectangle and its current line count,
    // so its rectangle has to be restored after the text content is
    const isTextRectangleUpdate = (event: shapeUpdateEvent) =>
      event.eventType == "updateEnclosingRectangle" &&
      this.shapeManager.shapes[event.shapeId]?.shapeType == "text";
    const ordered = [
      ...inverses.filter((event) => !isTextRectangleUpdate(event)),
      ...inverses.filter(isTextRectangleUpdate),
    ];

    const applied: historyEntry = [];
    ordered.forEach((inverse) => {
      // fresh id, collab dedupes and orders events by id
      const event = { ...inverse, _id: crypto.randomUUID() };
      if (!this.canApply(event)) return;

      this.shapeManager.handleShapeUpdateEvent(event, "history");
      applied.push(event);
    });
    return applied;
  }

  private canApply(event: shapeUpdateEvent) {
    const exists = this.shapeManager.shapes[event.shapeId] != undefined;
    return event.eventType == "addShape" ? !exists : exists;
  }

  private syncStore() {
    useHistory.setState({
      canUndo: this.undoStack.length > 0 || this.currentEntry.length > 0,
      canRedo: this.redoStack.length > 0,
    });
  }
}
