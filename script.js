// ================= ALM COMMANDS =================
const ALM_CMD_ENCODE = 101;   // ترميز ملف → صورة
const ALM_CMD_DECODE = 102;   // فك صورة → ملف
const ALM_CMD_EXPORT = 103;   // تصدير الملف المسترجع

// ================= UI BINDINGS =================
const docInput       = document.getElementById("docInput");
const imageInput     = document.getElementById("imageInput");
const userKeyEl      = document.getElementById("userKey");
const userKeyDecodeEl= document.getElementById("userKeyDecode");
const exportModeEl   = document.getElementById("exportMode");
const canvas         = document.getElementById("canvas");
const statusEncode   = document.getElementById("statusEncode");
const statusDecode   = document.getElementById("statusDecode");
const outputText     = document.getElementById("outputText");

// Metadata elements
const metaFilenameEl     = document.getElementById("metaFilename");
const metaFiletypeEl     = document.getElementById("metaFiletype");
const metaFilesizeEl     = document.getElementById("metaFilesize");
const metaPartsEl        = document.getElementById("metaParts");
const metaCRCEl          = document.getElementById("metaCRC");
const metaCRCStatusEl    = document.getElementById("metaCRCStatus");
const metaUserKeyEl      = document.getElementById("metaUserKey");
const metaTimestampRawEl = document.getElementById("metaTimestampRaw");
const metaTimestampHumanEl = document.getElementById("metaTimestampHuman");

// تخزين عالمي للبيانات المسترجعة للتصدير
window._decodedBytes = null;

// ================= BUTTON HANDLERS =================

document.getElementById("btnEncode").onclick = () => {
  const file    = docInput.files[0];
  const userKey = userKeyEl.value;
  runALM(ALM_CMD_ENCODE, { file, userKey });
};

document.getElementById("btnDecode").onclick = () => {
  const image   = imageInput.files[0];
  const userKey = userKeyDecodeEl ? userKeyDecodeEl.value : "";
  runALM(ALM_CMD_DECODE, { image, userKey });
};

document.getElementById("btnExport").onclick = () => {
  const mode = exportModeEl.value;
  runALM(ALM_CMD_EXPORT, { mode });
};

// زر حفظ الصورة من الـ Canvas
const btnSaveImage = document.getElementById("btnSaveImage");
if (btnSaveImage) {
  btnSaveImage.onclick = () => {
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "xx17_encoded.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
}

// ================= ALM ENGINE =================
function runALM(cmdId, payload = {}) {
  switch (cmdId) {
    case ALM_CMD_ENCODE:
      return almEncodeFile(payload);
    case ALM_CMD_DECODE:
      return almDecodeImage(payload);
    case ALM_CMD_EXPORT:
      return almExportFile(payload);
    default:
      console.warn("Unknown ALM command:", cmdId);
  }
}

// ================= HELPERS: CRC32 =================
function crc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    let c = (crc ^ bytes[i]) & 0xFF;
    for (let j = 0; j < 8; j++) {
      if (c & 1) c = (c >>> 1) ^ 0xEDB88320;
      else c = c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ (-1)) >>> 0;
}

// ================= ALM LOGIC =================

// ---- 1) ترميز ملف → صورة ----
function almEncodeFile({ file, userKey }) {
  if (!file) {
    statusEncode.textContent = "اختر ملفًا أولاً.";
    return;
  }

  statusEncode.textContent = "جاري قراءة الملف...";

  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result;
    const bytes = new Uint8Array(arrayBuffer);

    const filename = file.name || "file.bin";
    const almStream = buildALMStreamWithHeader(bytes, userKey, filename);

    drawALMStreamToCanvas(almStream);
    statusEncode.textContent = "تم الترميز داخل الصورة.";

    // تعبئة بعض الميتاداتا مباشرة بعد الترميز
    if (metaFilenameEl) metaFilenameEl.textContent = filename;
    if (metaFiletypeEl) {
      const dotIdx = filename.lastIndexOf(".");
      let ft = "bin";
      if (dotIdx !== -1 && dotIdx < filename.length - 1) {
        ft = filename.slice(dotIdx + 1).toLowerCase();
      }
      metaFiletypeEl.textContent = ft;
    }
    if (metaFilesizeEl) metaFilesizeEl.textContent = bytes.length + " بايت";
    if (metaUserKeyEl) metaUserKeyEl.textContent = String(userKey || "—");
  };

  reader.onerror = function() {
    statusEncode.textContent = "فشل في قراءة الملف.";
  };

  reader.readAsArrayBuffer(file);
}

// ---- 2) فك صورة → نص/ملف ----
function almDecodeImage({ image, userKey }) {
  if (!image) {
    statusDecode.textContent = "اختر صورة أولاً.";
    return;
  }

  statusDecode.textContent = "جاري قراءة الصورة...";

  const img = new Image();
  img.onload = function() {
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    const almStream = new Uint8Array(img.width * img.height);
    for (let i = 0; i < almStream.length; i++) {
      almStream[i] = data[i * 4]; // قناة R
    }

    const result = parseALMStream(almStream);

    if (!result.ok) {
      statusDecode.textContent = "فشل فك الترميز: " + result.error;
      return;
    }

    const { bytes, key, crcOk, meta } = result;

    if (!crcOk) {
      statusDecode.textContent = "تحذير: CRC غير مطابق. قد تكون البيانات تالفة.";
    } else {
      statusDecode.textContent = "تم فك الترميز بنجاح.";
    }

    // مقارنة مفتاح المستخدم (اختياري حالياً – تحذير فقط)
    if (userKey && key && userKey !== key) {
      statusDecode.textContent += " (تحذير: مفتاح المستخدم لا يطابق المفتاح الأصلي)";
    }

    // عرض كنص إن أمكن
    try {
      const decoder = new TextDecoder();
      const text = decoder.decode(bytes);
      outputText.textContent = text;
    } catch {
      outputText.textContent = "تم استخراج ملف غير نصي. يمكنك تصديره.";
    }

    window._decodedBytes = bytes;

    // تعبئة الميتاداتا من meta
    if (meta) {
      if (metaFiletypeEl) metaFiletypeEl.textContent = meta.filetype || "غير معروف";
      if (metaFilesizeEl) metaFilesizeEl.textContent = meta.filesize + " بايت";
      if (metaPartsEl) metaPartsEl.textContent = "1";
      if (metaCRCEl) metaCRCEl.textContent = "0x" + meta.crcStored.toString(16).toUpperCase();
      if (metaCRCStatusEl) metaCRCStatusEl.textContent = crcOk ? "سليم" : "غير مطابق";
      if (metaUserKeyEl) metaUserKeyEl.textContent = meta.key || "—";
      if (metaTimestampRawEl) metaTimestampRawEl.textContent = meta.timestamp;

      if (metaTimestampHumanEl) {
        try {
          const d = new Date(meta.timestamp * 1000);
          metaTimestampHumanEl.textContent = d.toLocaleString("ar-EG");
        } catch {
          metaTimestampHumanEl.textContent = "غير متوفر";
        }
      }
    }
  };

  img.onerror = function() {
    statusDecode.textContent = "فشل تحميل الصورة.";
  };

  img.src = URL.createObjectURL(image);
}

// ---- 3) تصدير الملف المسترجع ----
function almExportFile({ mode }) {
  if (!window._decodedBytes) {
    alert("لا يوجد ملف مسترجع بعد. قم بفك الترميز أولاً.");
    return;
  }

  let mime = "application/octet-stream";
  let ext  = "bin";

  if (mode === "txt") {
    mime = "text/plain;charset=utf-8";
    ext  = "txt";
  }

  const blob = new Blob([window._decodedBytes], { type: mime });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "xx17_output." + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ================= ALM STREAM WITH HEADER (B) =================

// Header B:
// magic "ALM" (3)
// version (1)
// filetypeLen (1) + filetype
// filesize (4)
// timestamp (4)
// keyLen (1) + key (نصي كما طلبت)
// crc32 (4)
// ثم data

function buildALMStreamWithHeader(bytes, userKey, filename = "file.bin") {
  const encoder = new TextEncoder();

  // استنتاج نوع الملف من الاسم
  let filetype = "bin";
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx !== -1 && dotIdx < filename.length - 1) {
    filetype = filename.slice(dotIdx + 1).toLowerCase();
  }

  const magic = encoder.encode("ALM"); // 3 بايت
  const version = 1;                   // 1 بايت
  const filetypeBytes = encoder.encode(filetype);
  const filetypeLen = filetypeBytes.length & 0xFF;

  const filesize = bytes.length >>> 0; // 4 بايت
  const timestamp = Math.floor(Date.now() / 1000) >>> 0; // 4 بايت

  const keyStr = String(userKey || "");
  const keyBytes = encoder.encode(keyStr);
  const keyLen = keyBytes.length & 0xFF;

  const crc = crc32(bytes); // 4 بايت

  const headerLen =
    3 + 1 + 1 + filetypeBytes.length + 4 + 4 + 1 + keyBytes.length + 4;

  const totalLen = headerLen + bytes.length;
  const out = new Uint8Array(totalLen);
  let offset = 0;

  // magic
  out.set(magic, offset);
  offset += 3;

  // version
  out[offset++] = version & 0xFF;

  // filetypeLen + filetype
  out[offset++] = filetypeLen;
  out.set(filetypeBytes, offset);
  offset += filetypeBytes.length;

  // filesize (4 بايت big-endian)
  out[offset++] = (filesize >>> 24) & 0xFF;
  out[offset++] = (filesize >>> 16) & 0xFF;
  out[offset++] = (filesize >>> 8) & 0xFF;
  out[offset++] = (filesize) & 0xFF;

  // timestamp (4 بايت big-endian)
  out[offset++] = (timestamp >>> 24) & 0xFF;
  out[offset++] = (timestamp >>> 16) & 0xFF;
  out[offset++] = (timestamp >>> 8) & 0xFF;
  out[offset++] = (timestamp) & 0xFF;

  // keyLen + key
  out[offset++] = keyLen;
  out.set(keyBytes, offset);
  offset += keyBytes.length;

  // crc32 (4 بايت big-endian)
  out[offset++] = (crc >>> 24) & 0xFF;
  out[offset++] = (crc >>> 16) & 0xFF;
  out[offset++] = (crc >>> 8) & 0xFF;
  out[offset++] = (crc) & 0xFF;

  // data
  out.set(bytes, offset);

  return out;
}

// فك ALM Stream واسترجاع البيانات + Metadata
function parseALMStream(stream) {
  const decoder = new TextDecoder();
  let offset = 0;

  if (stream.length < 3) {
    return { ok: false, error: "Stream قصير جداً." };
  }

  const magic = decoder.decode(stream.slice(0, 3));
  if (magic !== "ALM") {
    return { ok: false, error: "ترويسة ALM غير صحيحة." };
  }
  offset += 3;

  const version = stream[offset++];

  const filetypeLen = stream[offset++];
  if (offset + filetypeLen > stream.length) {
    return { ok: false, error: "طول نوع الملف غير صالح." };
  }
  const filetype = decoder.decode(stream.slice(offset, offset + filetypeLen));
  offset += filetypeLen;

  if (offset + 4 > stream.length) {
    return { ok: false, error: "لا يوجد مساحة كافية لطول الملف." };
  }
  const filesize =
    (stream[offset++] << 24) |
    (stream[offset++] << 16) |
    (stream[offset++] << 8) |
    (stream[offset++]);

  if (offset + 4 > stream.length) {
    return { ok: false, error: "لا يوجد مساحة كافية للتوقيت." };
  }
  const timestamp =
    (stream[offset++] << 24) |
    (stream[offset++] << 16) |
    (stream[offset++] << 8) |
    (stream[offset++]);

  const keyLen = stream[offset++];
  if (offset + keyLen > stream.length) {
    return { ok: false, error: "طول المفتاح غير صالح." };
  }
  const key = decoder.decode(stream.slice(offset, offset + keyLen));
  offset += keyLen;

  if (offset + 4 > stream.length) {
    return { ok: false, error: "لا يوجد مساحة كافية لـ CRC." };
  }
  const crcStored =
    ((stream[offset++] << 24) |
     (stream[offset++] << 16) |
     (stream[offset++] << 8) |
     (stream[offset++])) >>> 0;

  const bytes = stream.slice(offset);
  const crcCalc = crc32(bytes);
  const crcOk = crcCalc === crcStored;

  return {
    ok: true,
    bytes,
    key,
    crcOk,
    meta: {
      version,
      filetype,
      filesize,
      timestamp,
      key,
      crcStored,
      crcCalc
    }
  };
}

// رسم ALM Stream داخل Canvas كصورة
function drawALMStreamToCanvas(almStream) {
  const ctx = canvas.getContext("2d");

  const totalBytes = almStream.length;
  const size = Math.ceil(Math.sqrt(totalBytes));

  canvas.width = size;
  canvas.height = size;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let i = 0; i < size * size; i++) {
    const byte = i < totalBytes ? almStream[i] : 0;
    const idx = i * 4;
    data[idx]     = byte;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}
