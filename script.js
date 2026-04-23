/****************************************************
 * Xx16‑ALM — Text/Image System (DOCX + PDF + Arabic)
 ****************************************************/

// ===================== جدول الترميز =====================
// ترتيب A: الحروف العربية الأساسية ثم (ة، ى) ثم الأرقام ثم الترقيم ثم المسافة ثم الهمزات
const ALPHABET = "ابتثجحخدذرزسشصضطظعغفقكلمنهويةى0123456789.،!؟- ءأإآؤئ";

function encodeChar(ch) {
  const idx = ALPHABET.indexOf(ch);
  return idx === -1 ? 255 : idx;
}

function decodeChar(code) {
  if (code >= 0 && code < ALPHABET.length) return ALPHABET[code];
  return "";
}

function encodeText(str) {
  const out = [];
  for (let ch of str) out.push(encodeChar(ch));
  return new Uint8Array(out);
}

function decodeText(bytes) {
  let out = "";
  for (let b of bytes) out += decodeChar(b);
  return out;
}

// ===================== CRC32 =====================
function crc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    let c = (crc ^ bytes[i]) & 0xff;
    for (let j = 0; j < 8; j++)
      c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ (-1)) >>> 0;
}

// ===================== ALM HEADER =====================
function buildALM(rawBytes, userKey, filetype) {
  const enc = new TextEncoder();

  const magic = enc.encode("ALM");
  const version = 1;

  const ftBytes = enc.encode(filetype);
  const ftLen = ftBytes.length;

  const filesize = rawBytes.length >>> 0;
  const timestamp = Math.floor(Date.now() / 1000) >>> 0;

  const keyBytes = enc.encode(userKey || "");
  const keyLen = keyBytes.length;

  const crc = crc32(rawBytes);

  const headerLen =
    3 + 1 + 1 + ftLen + 4 + 4 + 1 + keyLen + 4;

  const out = new Uint8Array(headerLen + rawBytes.length);
  let o = 0;

  out.set(magic, o); o += 3;
  out[o++] = version;

  out[o++] = ftLen;
  out.set(ftBytes, o); o += ftLen;

  out[o++] = (filesize >>> 24) & 0xff;
  out[o++] = (filesize >>> 16) & 0xff;
  out[o++] = (filesize >>> 8) & 0xff;
  out[o++] = filesize & 0xff;

  out[o++] = (timestamp >>> 24) & 0xff;
  out[o++] = (timestamp >>> 16) & 0xff;
  out[o++] = (timestamp >>> 8) & 0xff;
  out[o++] = timestamp & 0xff;

  out[o++] = keyLen;
  out.set(keyBytes, o); o += keyLen;

  out[o++] = (crc >>> 24) & 0xff;
  out[o++] = (crc >>> 16) & 0xff;
  out[o++] = (crc >>> 8) & 0xff;
  out[o++] = crc & 0xff;

  out.set(rawBytes, o);

  return out;
}

function parseALM(stream) {
  const dec = new TextDecoder();
  let o = 0;

  if (dec.decode(stream.slice(0, 3)) !== "ALM")
    return { ok: false, error: "ترويسة غير صحيحة" };
  o += 3;

  const version = stream[o++];

  const ftLen = stream[o++];
  const filetype = dec.decode(stream.slice(o, o + ftLen));
  o += ftLen;

  const filesize =
    (stream[o++] << 24) |
    (stream[o++] << 16) |
    (stream[o++] << 8) |
    stream[o++];

  const timestamp =
    (stream[o++] << 24) |
    (stream[o++] << 16) |
    (stream[o++] << 8) |
    stream[o++];

  const keyLen = stream[o++];
  const key = dec.decode(stream.slice(o, o + keyLen));
  o += keyLen;

  const crcStored =
    ((stream[o++] << 24) |
     (stream[o++] << 16) |
     (stream[o++] << 8) |
     stream[o++]) >>> 0;

  const bytesAll = stream.slice(o);
  const bytes = bytesAll.slice(0, filesize);

  const crcCalc = crc32(bytes);

  return {
    ok: true,
    bytes,
    key,
    filetype,
    filesize,
    timestamp,
    crcOk: crcCalc === crcStored
  };
}

// ===================== Xx16 ENCODE (1024×1024) =====================
const SIZE = 1024;

function encodeToCanvas(bytes) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = SIZE;
  canvas.height = SIZE;

  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;

  for (let i = 0; i < SIZE * SIZE; i++) {
    const b = bytes[i] || 0;
    const p = i * 4;
    d[p] = b;
    d[p + 1] = 0;
    d[p + 2] = 0;
    d[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

function decodeFromCanvas(img) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(img.width * img.height);

  for (let i = 0; i < out.length; i++)
    out[i] = data[i * 4];

  return out;
}

// ===================== UI عناصر =====================
const textBox = document.getElementById("textBox");
const fileInput = document.getElementById("fileInput");
const imageInput = document.getElementById("imageInput");
const userKeyEl = document.getElementById("userKey");
const outputText = document.getElementById("outputText");
const metaBox = document.getElementById("metaBox");

let decodedBytes = null;
let decodedFiletype = null;

// ===================== استخراج النص من ملف =====================
document.getElementById("btnExtract").onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert("اختر ملفاً أولاً");

  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "txt") {
    const reader = new FileReader();
    reader.onload = e => {
      textBox.value = e.target.result;
    };
    reader.readAsText(file, "utf-8");
  } else if (ext === "docx") {
    // DOCX = ZIP → نستخدم JSZip
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file("word/document.xml").async("string");

    // استخراج النص من XML
    let text = docXml
      .replace(/<w:p[^>]*>/g, "\n")   // فقرة جديدة
      .replace(/<[^>]+>/g, "")        // إزالة كل الوسوم
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&apos;/g, "'");

    textBox.value = text.trim();
  } else if (ext === "pdf") {
    // PDF → نستخدم pdf.js
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      fullText += strings.join(" ") + "\n";
    }

    textBox.value = fullText.trim();
  } else {
    alert("لا يمكن استخراج نص من هذا النوع. يدعم TXT / DOCX / PDF فقط.");
  }
};

// ===================== ENCODE النص → صورة =====================
document.getElementById("btnEncode").onclick = () => {
  const text = textBox.value.trim();
  if (!text) return alert("أدخل نصاً أولاً");

  const encoded = encodeText(text);
  const alm = buildALM(encoded, userKeyEl.value, "txt");

  if (alm.length > SIZE * SIZE) {
    alert("النص طويل جداً ولا يمكن وضعه في صورة واحدة 1024×1024.");
    return;
  }

  encodeToCanvas(alm);
  document.getElementById("statusEncode").textContent = "تم تحويل النص إلى صورة.";
};

// ===================== حفظ الصورة =====================
document.getElementById("btnSaveImage").onclick = () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "alm_text.png";
  a.click();
};

// ===================== DECODE من صورة =====================
document.getElementById("btnDecode").onclick = () => {
  const file = imageInput.files[0];
  if (!file) return alert("اختر صورة أولاً");

  const img = new Image();
  img.onload = () => {
    const stream = decodeFromCanvas(img);
    const result = parseALM(stream);

    if (!result.ok) {
      document.getElementById("statusDecode").textContent = result.error;
      return;
    }

    decodedBytes = result.bytes;
    decodedFiletype = result.filetype;

    metaBox.textContent =
      "نوع الملف: " + result.filetype +
      "\nالحجم: " + result.filesize + " بايت" +
      "\nCRC: " + (result.crcOk ? "صحيح" : "غير مطابق") +
      "\nالمفتاح: " + (result.key || "بدون مفتاح") +
      "\nالوقت: " + new Date(result.timestamp * 1000).toLocaleString("ar-EG");

    if (result.filetype === "txt") {
      outputText.value = decodeText(result.bytes);
    } else {
      outputText.value = "تم استخراج ملف غير نصي.\nيمكنك تنزيله من زر (تنزيل الملف الأصلي).";
    }
    document.getElementById("btnExportWord").onclick = async () => {
  const text = outputText.value.trim();
  if (!text) return alert("لا يوجد نص لتحويله إلى Word");

  const { Document, Packer, Paragraph } = docx;

  const doc = new Document({
    sections: [{
      properties: {},
      children: [new Paragraph(text)],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "restored.docx";
  a.click();
};
    document.getElementById("btnExportPDF").onclick = () => {
  const text = outputText.value.trim();
  if (!text) return alert("لا يوجد نص لتحويله إلى PDF");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const lines = pdf.splitTextToSize(text, 180);
  pdf.text(lines, 15, 15);

  pdf.save("restored.pdf");
};
    

    document.getElementById("statusDecode").textContent = "تم الاسترجاع.";
  };

  img.src = URL.createObjectURL(file);
};

// ===================== تنزيل الملف الأصلي =====================
document.getElementById("btnExport").onclick = () => {
  if (!decodedBytes) return alert("لا يوجد ملف مسترجع");

  const blob = new Blob([decodedBytes], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "output." + (decodedFiletype || "bin");
  a.click();
};
