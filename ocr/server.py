"""
Lightweight OCR + barcode HTTP server.
- OCR: RapidOCR (PaddleOCR models via ONNX runtime)
- Barcodes: pyzbar (zbar library)
Receives an image, returns detected text lines and barcodes.
"""

import io
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps
from pyzbar.pyzbar import decode as decode_barcodes
import numpy as np

logger = logging.getLogger("ocr-server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ocr_engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the OCR engine once at startup."""
    global ocr_engine
    from rapidocr_onnxruntime import RapidOCR
    logger.info("Initializing RapidOCR engine...")
    ocr_engine = RapidOCR()
    logger.info("RapidOCR engine ready.")
    yield


app = FastAPI(title="BenchLog OCR Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "rapidocr_onnxruntime"}


@app.post("/ocr")
async def run_ocr(image: UploadFile = File(...)):
    """
    Accepts an image file, runs OCR + barcode detection.

    Response:
    {
      "lines": [{ "text": "...", "confidence": 0.96, "bbox": [[x,y],...] }],
      "barcodes": [{ "data": "AS3-032X4X5", "type": "CODE128", "bbox": [x,y,w,h] }],
      "full_text": "..."
    }
    """
    try:
        contents = await image.read()
        img = Image.open(io.BytesIO(contents))

        # Apply EXIF orientation (iOS/Android camera photos may be stored rotated)
        img = ImageOps.exif_transpose(img)

        # Convert to RGB if needed
        if img.mode != "RGB":
            img = img.convert("RGB")

        img_array = np.array(img)

        # ── OCR ──────────────────────────────────────────────
        result, _ = ocr_engine(img_array)

        lines = []
        full_text_parts = []

        if result:
            for item in result:
                bbox, text, confidence = item
                lines.append({
                    "text": text,
                    "confidence": round(float(confidence), 4),
                    "bbox": [[round(float(p[0])), round(float(p[1]))] for p in bbox],
                })
                full_text_parts.append(text)

        # ── Barcode detection ────────────────────────────────
        # Try multiple preprocessing approaches for better detection
        barcodes = []
        seen_data = set()
        try:
            # Attempt 1: original image
            for bc in decode_barcodes(img):
                key = bc.data
                if key not in seen_data:
                    seen_data.add(key)
                    barcodes.append({
                        "data": bc.data.decode("utf-8", errors="replace"),
                        "type": bc.type,
                        "bbox": [bc.rect.left, bc.rect.top, bc.rect.width, bc.rect.height],
                    })

            if not barcodes:
                # Attempt 2: grayscale + sharpened
                from PIL import ImageFilter, ImageEnhance
                gray = img.convert("L")
                sharp = gray.filter(ImageFilter.SHARPEN)
                enhanced = ImageEnhance.Contrast(sharp).enhance(2.0)
                for bc in decode_barcodes(enhanced):
                    key = bc.data
                    if key not in seen_data:
                        seen_data.add(key)
                        barcodes.append({
                            "data": bc.data.decode("utf-8", errors="replace"),
                            "type": bc.type,
                            "bbox": [bc.rect.left, bc.rect.top, bc.rect.width, bc.rect.height],
                        })

            if not barcodes:
                # Attempt 3: upscaled 2x (helps with small/distant barcodes)
                upscaled = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
                for bc in decode_barcodes(upscaled):
                    key = bc.data
                    if key not in seen_data:
                        seen_data.add(key)
                        # Scale bbox back to original coordinates
                        barcodes.append({
                            "data": bc.data.decode("utf-8", errors="replace"),
                            "type": bc.type,
                            "bbox": [bc.rect.left // 2, bc.rect.top // 2, bc.rect.width // 2, bc.rect.height // 2],
                        })
        except Exception as e:
            logger.warning("Barcode detection failed: %s", e)

        return JSONResponse({
            "lines": lines,
            "barcodes": barcodes,
            "full_text": "\n".join(full_text_parts),
        })

    except Exception as e:
        logger.exception("OCR failed")
        return JSONResponse({"error": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
