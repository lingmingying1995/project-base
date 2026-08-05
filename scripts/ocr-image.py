"""Windows OCR 图片文字提取脚本
用法: python scripts/ocr-image.py "图片路径1" "图片路径2" ...
支持中文+英文，基于 Windows 自带 OCR 引擎，无需 tesseract。
"""
import sys
import asyncio
import io
from pathlib import Path

# 修复 Windows 控制台编码
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from PIL import Image
import winrt.windows.media.ocr as ocr
import winrt.windows.graphics.imaging as imaging
import winrt.windows.storage.streams as streams


async def extract_text(image_path: str) -> str:
    img = Image.open(image_path)
    if img.mode != "RGB":
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    data = buf.getvalue()

    ra_stream = streams.InMemoryRandomAccessStream()
    await ra_stream.write_async(data)
    ra_stream.seek(0)

    decoder = await imaging.BitmapDecoder.create_async(ra_stream)
    software_bitmap = await decoder.get_software_bitmap_async()

    langs = ocr.OcrEngine.available_recognizer_languages
    ocr_lang = None
    for l in langs:
        tag = l.language_tag
        if tag.startswith("zh"):
            ocr_lang = l
            break
    if ocr_lang is None and len(langs) > 0:
        ocr_lang = langs[0]
    if ocr_lang is None:
        return "[错误: 系统无 OCR 语言包]"

    engine = ocr.OcrEngine.try_create_from_language(ocr_lang)
    if engine is None:
        return "[错误: 无法创建 OCR 引擎]"

    result = await engine.recognize_async(software_bitmap)
    return result.text


async def main(paths):
    for p in paths:
        if not Path(p).exists():
            print(f"[跳过] 文件不存在: {p}")
            continue
        name = Path(p).name
        print(f"\n===== {name} =====")
        try:
            text = await extract_text(p)
            print(text)
        except Exception as e:
            print(f"[OCR失败] {e}")
        print(f"===== 结束 =====")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python ocr-image.py <图片路径> [图片路径2] ...")
        sys.exit(1)
    asyncio.run(main(sys.argv[1:]))
