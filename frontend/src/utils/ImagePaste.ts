// images are stored inline as data urls (localStorage + collab messages),
// so big pastes get downscaled to keep them reasonably small
const MAX_STORED_DIMENSION = 1600;

export type pastedImage = {
  src: string;
  width: number;
  height: number;
};

export function getImageFileFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.kind == "file" && item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("couldn't decode image"));
    image.src = src;
  });
}

export async function readImageFile(file: File): Promise<pastedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { naturalWidth: width, naturalHeight: height } = image;

    const scale = Math.min(1, MAX_STORED_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0, targetWidth, targetHeight);

    // webp keeps transparency and is much smaller than png for screenshots,
    // browsers that cant encode webp fall back to png on their own
    const src = canvas.toDataURL("image/webp", 0.9);

    return { src, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
