// ================= ALM COMMANDS =================
const ALM_CMD_ENCODE = 101;   // ترميز ملف → صورة
const ALM_CMD_DECODE = 102;   // فك صورة → ملف
const ALM_CMD_EXPORT = 103;   // تصدير الملف المسترجع

// ================= UI BINDINGS =================
const docInput     = document.getElementById("docInput");
const imageInput   = document.getElementById("imageInput");
const userKeyEl    = document.getElementById("userKey");
const exportModeEl = document.getElementById("exportMode");
const canvas       = document.getElementById("canvas");
const statusEncode = document.getElementById("statusEncode");
const statusDecode = document.getElementById("statusDecode");
const outputText   = document.getElementById("outputText");

// تخزين عالمي للبيانات المسترجعة للتصدير
window._decodedBytes = null;

document.getElementById("btnEncode").onclick = () => {
  const file    = docInput.files[0];
  const userKey = userKeyEl.value;
  runALM(ALM_CMD_ENCODE, { file, userKey });
};

document.getElementById("btnDecode").onclick = () => {
  const image   = imageInput.files[0];
  const userKey = userKeyEl.value;
  runALM(ALM_CMD_DECODE, { image, userKey });
};

document.getElementById("btnExport").onclick = () => {
  const mode = exportModeEl.value;
  runALM(ALM_CMD_EXPORT, { mode });
};

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

    const almStream = buildSimpleALMStream(bytes, userKey);

    drawALMStreamToCanvas(almStream);
    statusEncode.textContent = "تم الترميز داخل الصورة.";
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

    const { bytes, key, crcOk } = result;

    if (!crcOk) {
      statusDecode.textContent = "تحذير: CRC غير مطابق. قد تكون البيانات تالفة.";
    } else {
      statusDecode.textContent = "تم فك الترميز بنجاح.";
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
  a.download = "xx16_output." + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ================= HELPERS =================

// بناء ALM Stream بسيط (رأس + CRC + مفتاح + بيانات)
function buildSimpleALMStream(bytes, userKey) {
  const keyStr = String(userKey || "0");

  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc + bytes[i]) & 0xFF;
  }

  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(keyStr);

  const totalLen = 4 + 1 + 1 + keyBytes.length + bytes.length;
  const out = new Uint8Array(totalLen);
  let offset = 0;

  const len = bytes.length;
  out[offset++] = (len >>> 24) & 0xFF;
  out[offset++] = (len >>> 16) & 0xFF;
  out[offset++] = (len >>> 8)  & 0xFF;
  out[offset++] = (len)        & 0xFF;

  out[offset++] = crc & 0xFF;

  out[offset++] = keyBytes.length & 0xFF;

  out.set(keyBytes, offset);
  offset += keyBytes.length;

  out.set(bytes, offset);

  return out;
}

// فك ALM Stream واسترجاع البيانات
function parseALMStream(stream) {
  let offset = 0;

  const len =
    (stream[offset++] << 24) |
    (stream[offset++] << 16) |
    (stream[offset++] << 8)  |
    (stream[offset++]);

  if (len <= 0 || len > stream.length) {
    return { ok: false, error: "طول البيانات غير صالح." };
  }

  const crcStored = stream[offset++];

  const keyLen = stream[offset++];
  if (keyLen < 0 || keyLen > 64) {
    return { ok: false, error: "طول المفتاح غير صالح." };
  }

  const keyBytes = stream.slice(offset, offset + keyLen);
  offset += keyLen;

  const decoder = new TextDecoder();
  const key = decoder.decode(keyBytes);

  const bytes = stream.slice(offset, offset + len);

  let crcCalc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crcCalc = (crcCalc + bytes[i]) & 0xFF;
  }

  return {
    ok: true,
    bytes,
    key,
    crcOk: crcCalc === crcStored
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
