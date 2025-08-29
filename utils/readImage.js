
const Tesseract = require("tesseract.js");
const mod = require("ocr-space-api-wrapper");
const ocrSpaceApi = mod.ocrSpace || mod.default || mod;
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const os = require("os");

const apiKey = process.env.OCR_API_KEY;

//using Tesseract.js to extract text from images
// async function extractContentFromImage(imagePath) {
//    try {
//     const { data: { text } } = await Tesseract.recognize(
//       imagePath,
//       "eng+ara", // English + Arabic
//       {
//         logger: m => console.log(m.status, (m.progress * 100).toFixed(0) + "%") 
//         // Optional: show nice progress (e.g., 45%)
//       }
//     );

//     logger.info("Extracted Text:\n", text);

//     return text;
//   } catch (err) {
//     logger.error("Error extracting text from image", { error: err.message });
//     throw new ApiError("Failed to extract text from image", 500);
//   }
// }

//using ocr-space-api-wrapper to extract text from images


async function compressToUnder1MB(imagePath) {
  let quality = 80; 
  let buffer;
  let size;

  do {
    buffer = await sharp(imagePath)
      .rotate()
      .grayscale()
      .normalize()
      .webp({ quality, effort: 6 })
      .toBuffer();

    size = buffer.length;
    quality -= 5; 
  } while (size > 1024 * 1024 && quality > 10);

  const tmpPath = path.join(os.tmpdir(), `ocr-${Date.now()}.webp`);
  fs.writeFileSync(tmpPath, buffer);

  logger.info(`Compressed image saved to ${tmpPath}, size: ${(size / 1024).toFixed(2)} KB`
  );

  return tmpPath;
}

async function extractContentFromImage(imagePath) {
   const tmpPath = await compressToUnder1MB(imagePath);
try{
    const [ar, en] = await Promise.all([
    ocrSpaceApi(tmpPath, { apiKey, language: "ara" }),
    ocrSpaceApi(tmpPath, { apiKey, language: "eng" }),
  ]);
const getText = (r) => r?.ParsedResults?.[0]?.ParsedText?.trim() || "";
    const text =`${getText(ar)}\n${getText(en)}`.trim();
    if (!text) {
      return;
    }
     return text;
  }catch (err) {
    throw new ApiError(err.message || "OCR processing failed", 500);
  } finally {
    // Clean up temp file
    fs.unlink(tmpPath, () => {});
    logger.info(`Temporary file ${tmpPath} deleted`);
  }
}




module.exports = { extractContentFromImage };