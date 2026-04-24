/****************************************************
 * script.js — Xx16 + ALM‑64bit + UserKey + DOCX + PDF
 ****************************************************/

/****************************************************
 * تحميل مكتبات PDF.js و JSZip
 ****************************************************/
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';

async function loadJSZip() {
    if (!window.JSZip) {
        await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    }
}
loadJSZip();

/****************************************************
 * عناصر الواجهة
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

const userKeyInput = document.getElementById("userKey");

/****************************************************
 * 1) استخراج النص من TXT / DOCX / PDF
 ****************************************************/
extractFromFileBtn.addEventListener("click", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
        alert("اختر ملفاً أولاً.");
        return;
    }

    const name = file.name.toLowerCase();

    if (name.endsWith(".txt")) {
        const text = await file.text();
        inputText.value = text;
        return;
    }

    if (name.endsWith(".docx")) {
        const text = await extractDocx(file);
        inputText.value = text;
        return;
    }

    if (name.endsWith(".pdf")) {
        const text = await extractPDF(file);
        inputText.value = text;
        return;
    }

    alert("الملف غير مدعوم. استخدم TXT أو DOCX أو PDF.");
});

/****************************************************
 * DOCX → نص
 ****************************************************/
async function extractDocx(file) {
    await loadJSZip();
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml").async("string");

    // استخراج النص من XML
    const text = xml
        .replace(/<w:p[^>]*>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();

    return text;
}

/****************************************************
 * PDF → نص
 ****************************************************/
async function extractPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        text += strings.join(" ") + "\n";
    }

    return text;
}

/****************************************************
 * 2) تحويل النص إلى ALM‑64bit → صورة Xx16
 ****************************************************/
encodeToImageBtn.addEventListener("click", () => {
    const text = inputText.value.trim();
    const userKey = userKeyInput.value.trim();

    if (!text) {
        alert("أدخل نصاً أولاً.");
        return;
    }
    if (!userKey) {
        alert("أدخل رمز المستخدم (User Key).");
        return;
    }

    const words = text.split(" ");
    const allBytes = [];

    for (const w of words) {
        const bi = encodeWordToBigInt(w, userKey);
        const bytes = bigIntToBytes(bi);

        if (bytes.length > 255) {
            alert("كلمة نتج عنها أكثر من 255 بايت. غير مسموح.");
            return;
        }

        allBytes.push(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            allBytes.push(bytes[i]);
        }
    }

    const data = new Uint8Array(allBytes);
    bytesToImage(data);

    alert("تم تحويل النص إلى صورة بنظام ALM‑64bit.");
});

/****************************************************
 * Xx16: تخزين البايتات في القناة R لصورة 1024×1024
 ****************************************************/
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function bytesToImage(data) {
    const size = 1024;
    const imgData = ctx.createImageData(size, size);
    const total = size * size;

    for (let i = 0; i < total; i++) {
        const b = i < data.length ? data[i] : 0;
        const idx = i * 4;
        imgData.data[idx + 0] = b;
        imgData.data[idx + 1] = 0;
        imgData.data[idx + 2] = 0;
        imgData.data[idx + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);
}

function imageToBytes() {
    const size = 1024;
    const imgData = ctx.getImageData(0, 0, size, size);
    const total = size * size;
    const out = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
        out[i] = imgData.data[i * 4];
    }

    return out;
}

/****************************************************
 * 3) استرجاع النص الحقيقي من الصورة
 ****************************************************/
decodeFromImageBtn.addEventListener("click", () => {
    const userKey = userKeyInput.value.trim();
    if (!userKey) {
        alert("أدخل رمز المستخدم (User Key) لفك التشفير.");
        return;
    }

    const bytes = imageToBytes();
    const words = [];
    let i = 0;

    while (i < bytes.length) {
        const len = bytes[i++];
        if (len === 0 || i + len > bytes.length) break;

        const slice = bytes.slice(i, i + len);
        i += len;

        const bi = bytesToBigInt(slice);
        const word = decodeBigIntToWord(bi, userKey);
        words.push(word);
    }

    outputText.value = words.join(" ");
});

/****************************************************
 * 4) تحميل الصورة
 ****************************************************/
downloadImageBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "alm64.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
});

/****************************************************
 * 5) حفظ النص المسترجع
 ****************************************************/
downloadRecoveredTxtBtn.addEventListener("click", () => {
    const text = outputText.value;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.download = "recovered.txt";
    link.href = URL.createObjectURL(blob);
    link.click();
});

/****************************************************
 * 6) تحميل صورة للاسترجاع
 ****************************************************/
imageInput.addEventListener("change", () => {
    const file = imageInput.files && fileInput.files[0];
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
