// ================= UI ELEMENTS =================
const docInput = document.getElementById("docInput");
const imageInput = document.getElementById("imageInput");
const userKeyEl = document.getElementById("userKey");
const exportModeEl = document.getElementById("exportMode");
const canvas = document.getElementById("canvas");
const statusEncode = document.getElementById("statusEncode");
const statusDecode = document.getElementById("statusDecode");
const outputText = document.getElementById("outputText");

window._decodedBytes = null;

// ================= CRC32 =================
function crc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    let c = (crc ^ bytes[i]) & 0xff;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ (-1)) >>> 0;
}

// ================= BUILD ALM STREAM =================
function buildALM(bytes, userKey, filename) {
  const enc = new TextEncoder();

  let filetype = "bin";
  const dot = filename.lastIndexOf(".");
  if (dot !== -1) filetype = filename.slice(dot + 1).toLowerCase();

  const magic = enc.encode("ALM");
  const version = 1;
  const filetypeBytes = enc.encode(filetype);
  const filetypeLen = filetypeBytes.length;

  const filesize = bytes.length >>> 0;
  const timestamp = Math.floor(Date.now() / 1000) >>> 0;

  const keyBytes = enc.encode(userKey || "");
  const keyLen = keyBytes.length;

  const crc = crc32(bytes);

  const headerLen =
    3 + 1 + 1 + filetypeLen + 4 + 4 + 1 + keyLen + 4;

  const out = new Uint8Array(headerLen + bytes.length);
  let o = 0;

  out.set(magic, o); o += 3;
  out[o++] = version;
  out[o++] = filetypeLen;
  out.set(filetypeBytes, o); o += filetypeLen;

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

  out.set(bytes, o);

  return out;
}

// ================= PARSE ALM STREAM =================
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

  const bytes = stream.slice(o);
  const crcCalc = crc32(bytes);

  return {
    ok: true,
    bytes,
    key,
    crcOk: crcCalc === crcStored
  };
}

// ================= ENCODE =================
document.getElementById("btnEncode").onclick = () => {
  const file = docInput.files[0];
  if (!file) return alert("اختر ملفاً أولاً");

  const reader = new FileReader();
  reader.onload = e => {
    const bytes = new Uint8Array(e.target.result);
    const alm = buildALM(bytes, userKeyEl.value, file.name);

    drawToCanvas(alm);
    statusEncode.textContent = "تم الترميز داخل الصورة.";
  };
  reader.readAsArrayBuffer(file);
};

// ================= DRAW TO CANVAS =================
function drawToCanvas(alm) {
  const ctx = canvas.getContext("2d");
  const size = Math.ceil(Math.sqrt(alm.length));

  canvas.width = size;
  canvas.height = size;

  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let i = 0; i < size * size; i++) {
    const b = alm[i] || 0;
    const p = i * 4;
    d[p] = b;
    d[p + 1] = 0;
    d[p + 2] = 0;
    d[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

// ================= SAVE IMAGE =================
document.getElementById("btnSaveImage").onclick = () => {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "alm_encoded.png";
  a.click();
};

// ================= DECODE =================
document.getElementById("btnDecode").onclick = () => {
  const file = imageInput.files[0];
  if (!file) return alert("اختر صورة أولاً");

  const img = new Image();
  img.onload = () => {
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const stream = new Uint8Array(img.width * img.height);

    for (let i = 0; i < stream.length; i++)
      stream[i] = data[i * 4];

    const result = parseALM(stream);
    if (!result.ok) {
      statusDecode.textContent = result.error;
      return;
    }

    window._decodedBytes = result.bytes;
// محاولة قراءة النص فقط إذا كان الملف نصيًا
let text = "";
let isText = false;

try {
  text = new TextDecoder().decode(result.bytes);

  // إذا لم يكن الملف Word أو PDF
  if (!text.startsWith("PK") && !text.startsWith("%PDF")) {
    outputText.value = text;
    isText = true;
  }
} catch {}

if (!isText) {
  outputText.value =
    "تم استخراج ملف غير نصي.\nيمكنك تنزيله من زر (تنزيل الملف).";
    }

    statusDecode.textContent = result.crcOk
      ? "تم فك الترميز بنجاح."
      : "تحذير: CRC غير مطابق.";
  };

  img.src = URL.createObjectURL(file);
};

// ================= EXPORT =================
document.getElementById("btnExport").onclick = () => {
  if (!window._decodedBytes) return alert("لا يوجد ملف مسترجع");

  const mode = exportModeEl.value;
  let mime = "application/octet-stream";
  let ext = "bin";

  if (mode === "txt") {
    mime = "text/plain";
    ext = "txt";
  }

  const blob = new Blob([window._decodedBytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "output." + ext;
  a.click();
};
