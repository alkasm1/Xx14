/****************************************************
 * ALM Word Encoder v1.0 — الكلمة → BigInt → بايتات
 ****************************************************/

const ALM_ALPHABET = "ابتثجحخدذرزسشصضطظعغفقكلمنهويء ،.";

if (ALM_ALPHABET.length !== 32) {
  console.error("❌ خطأ: يجب أن يحتوي جدول ALM على 32 رمزاً بالضبط.");
}

function normalizeArabic(str) {
  const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
  str = str.replace(TASHKEEL, "");
  str = str.replace(/[أإآٱ]/g, "ا");
  str = str.replace(/ى/g, "ي");
  str = str.replace(/ة/g, "ه");
  str = str.replace(/\s+/g, " ").trim();
  return str;
}

function charToSeed(ch) {
  const idx = ALM_ALPHABET.indexOf(ch);
  if (idx === -1) return ALM_ALPHABET.indexOf(" ");
  return idx;
}

function rotl32(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function hashBlock(block) {
  let seed = 0xA5A5A5A5 >>> 0;
  for (let i = 0; i < block.length; i++) {
    const s = charToSeed(block[i]) & 0xff;
    seed = (seed ^ s) >>> 0;
    seed = rotl32(seed, 5);
    seed = (seed * 2654435761) >>> 0;
  }
  return seed >>> 0;
}

function splitToBlocks(word, blockSize = 12) {
  const blocks = [];
  for (let i = 0; i < word.length; i += blockSize) {
    blocks.push(word.slice(i, i + blockSize));
  }
  return blocks;
}

function encodeWordToBigInt(wordRaw) {
  const word = normalizeArabic(wordRaw);
  if (!word) return 0n;
  const blocks = splitToBlocks(word, 12);
  let result = 0n;
  for (const block of blocks) {
    const h = hashBlock(block);
    result = (result << 32n) | BigInt(h);
  }
  return result;
}

function bigIntToBytes(bi) {
  if (bi === 0n) return new Uint8Array([0]);
  const bytes = [];
  let x = bi;
  while (x > 0n) {
    bytes.push(Number(x & 0xffn));
    x >>= 8n;
  }
  bytes.reverse();
  return new Uint8Array(bytes);
}

function encodeWordALM(wordRaw) {
  const bi = encodeWordToBigInt(wordRaw);
  const bytes = bigIntToBytes(bi);
  return { bigInt: bi, bytes };
}

/****************************************************
 * تحويل نص كامل إلى بايتات ALM (كلمات متسلسلة)
 ****************************************************/

function encodeTextToALMBytes(textRaw) {
  const text = textRaw.trim();
  if (!text) return new Uint8Array([]);

  const words = text.split(" ");
  const out = [];

  for (const w of words) {
    const { bytes } = encodeWordALM(w);
    // نخزن طول البايتات أولاً (1 بايت يكفي حتى 255)
    if (bytes.length > 255) {
      console.warn("كلمة نتج عنها أكثر من 255 بايت، سيتم قطعها.");
    }
    out.push(bytes.length & 0xff);
    for (let i = 0; i < bytes.length; i++) {
      out.push(bytes[i]);
    }
  }

  return new Uint8Array(out);
}

/****************************************************
 * Xx16 بسيط: تخزين البايتات في القناة الحمراء لصورة 1024×1024
 ****************************************************/

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function bytesToImage(data) {
  const size = 1024;
  const imgData = ctx.createImageData(size, size);
  const totalPixels = size * size;
  const maxBytes = totalPixels; // نستخدم القناة R فقط

  for (let i = 0; i < totalPixels; i++) {
    const byte = i < data.length ? data[i] : 0;
    const idx = i * 4;
    imgData.data[idx + 0] = byte; // R
    imgData.data[idx + 1] = 0;    // G
    imgData.data[idx + 2] = 0;    // B
    imgData.data[idx + 3] = 255;  // A
  }

  ctx.putImageData(imgData, 0, 0);
}

function imageToBytes() {
  const size = 1024;
  const imgData = ctx.getImageData(0, 0, size, size);
  const totalPixels = size * size;
  const out = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    out[i] = imgData.data[idx + 0]; // R
  }

  return out;
}

/****************************************************
 * استرجاع نص تقريبي من بايتات ALM (للعرض فقط)
 * هنا لن نعيد الكلمة الأصلية بدقة (لأن ALM أحادي الاتجاه)،
 * لكن سنعيد تمثيلاً نصيًا بسيطًا (طول الكلمة + رقم).
 ****************************************************/

function decodeALMBytesToDebugText(bytes) {
  let i = 0;
  const parts = [];
  let wordIndex = 1;

  while (i < bytes.length) {
    const len = bytes[i++];
    if (len === 0 || i + len > bytes.length) break;

    let bi = 0n;
    for (let j = 0; j < len; j++) {
      bi = (bi << 8n) | BigInt(bytes[i + j]);
    }
    i += len;

    parts.push(`كلمة ${wordIndex}: ${bi.toString()}`);
    wordIndex++;
  }

  return parts.join("\n");
}

/****************************************************
 * ربط الواجهة
 ****************************************************/

const inputText = document.getElementById("inputText");
const fileInput = document.getElementById("fileInput");
const extractFromFileBtn = document.getElementById("extractFromFileBtn");
const encodeToImageBtn = document.getElementById("encodeToImageBtn");
const downloadImageBtn = document.getElementById("downloadImageBtn");

const imageInput = document.getElementById("imageInput");
const decodeFromImageBtn = document.getElementById("decodeFromImageBtn");
const outputText = document.getElementById("outputText");
const downloadRecoveredTxtBtn = document.getElementById("downloadRecoveredTxtBtn");

// حالياً: استخراج نص من ملف TXT فقط (مبسّط)
extractFromFileBtn.addEventListener("click", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    alert("اختر ملفاً أولاً.");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".txt")) {
    alert("حالياً يدعم TXT فقط في هذا النموذج المبسط.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    inputText.value = reader.result;
  };
  reader.readAsText(file, "utf-8");
});

encodeToImageBtn.addEventListener("click", () => {
  const text = inputText.value;
  if (!text.trim()) {
    alert("أدخل نصاً أو استخرج نصاً من ملف أولاً.");
    return;
  }

  const almBytes = encodeTextToALMBytes(text);
  if (almBytes.length > 1024 * 1024) {
    alert("النص كبير جداً لصورة واحدة 1024×1024 في هذا النموذج.");
    return;
  }

  bytesToImage(almBytes);
  alert("تم تحويل النص إلى صورة بنظام ALM‑Xx16.");
});

downloadImageBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "alm_xx16.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  const img = new Image();
  const reader = new FileReader();
  reader.onload = () => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1024, 1024);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

decodeFromImageBtn.addEventListener("click", () => {
  const bytes = imageToBytes();
  const debugText = decodeALMBytesToDebugText(bytes);
  outputText.value = debugText || "لم يتم العثور على بيانات ALM صالحة.";
});

downloadRecoveredTxtBtn.addEventListener("click", () => {
  const text = outputText.value || "";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.download = "recovered_alm.txt";
  link.href = URL.createObjectURL(blob);
  link.click();
});
