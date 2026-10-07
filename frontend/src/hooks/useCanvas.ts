import type React from "react";
import { useEffect } from "react";
import CanvasManager from "../classes/Managers/CanvasManager";
import { useCanvasManager } from "../store/CanvasManager.store";
import { useGrabToolPosition } from "../store/Tools.store";

type useCanvasProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  editableTextContainerRef: React.RefObject<HTMLDivElement | null>;
};

export default function useCanvas(props: useCanvasProps) {
  const { setCanvasManager } = useCanvasManager();

  useEffect(() => {
    if (!props.canvasRef.current) return;

    const canvasEl = props.canvasRef.current;
    const dpr = window.devicePixelRatio;

    let ctx = canvasEl.getContext("2d");
    canvasEl.width = canvasEl.clientWidth * dpr;
    canvasEl.height = canvasEl.clientHeight * dpr;

    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const canvasManager = new CanvasManager(
      props.canvasRef,
      props.editableTextContainerRef,
    );
    setCanvasManager(canvasManager);

    const handleDocumentResize = () => {
      const dpr = window.devicePixelRatio;
      canvasEl.width = canvasEl.clientWidth * dpr;
      canvasEl.height = canvasEl.clientHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    window.addEventListener("resize", handleDocumentResize);

    let animationid: number;

    let work = () => {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

      // shapes draw in canvas units with the pan offset, zoom is applied once here
      ctx.save();
      const zoom = useGrabToolPosition.getState().zoom;
      ctx.scale(zoom, zoom);
      canvasManager.draw(ctx);
      ctx.restore();
      animationid = requestAnimationFrame(work);
    };

    animationid = requestAnimationFrame(work);

    return () => {
      cancelAnimationFrame(animationid);
      window.removeEventListener("resize", handleDocumentResize);
      canvasManager.destructor();
      setCanvasManager(null);
    };
  }, []);
}
