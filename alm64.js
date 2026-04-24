/****************************************************
 * ALM‑WordEncoder v3.0
 * 64‑bit reversible blocks + UserKey encryption
 * كل بلوك يحمل حتى 12 حرفًا (12 × 5 = 60 بت)
 * 4 بت إضافية لتخزين طول البلوك
 ****************************************************/

// 32 رمزًا بالضبط
const ALM_ALPHABET = "ابتثجحخدذرزسشصضطظعغفقكلمنهويء ،.";

/****************************************************
 * 1) Normalize Arabic
 ****************************************************/
function normalizeArabic(str) {
    const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
    str = str.replace(TASHKEEL, "");
    str = str.replace(/[أإآٱ]/g, "ا");
    str = str.replace(/ى/g, "ي");
    str = str.replace(/ة/g, "ه");
    str = str.replace(/\s+/g, " ").trim();
    return str;
}

/****************************************************
 * 2) حرف → index (0..31)
 ****************************************************/
function charToIndex(ch) {
    const i = ALM_ALPHABET.indexOf(ch);
    return i === -1 ? ALM_ALPHABET.indexOf(" ") : i;
}

/****************************************************
 * 3) index → حرف
 ****************************************************/
function indexToChar(i) {
    return ALM_ALPHABET[i] || " ";
}

/****************************************************
 * 4) ترميز بلوك (حتى 12 حرفًا) إلى 64‑bit
 ****************************************************/
function encodeBlockTo64(block) {
    const len = block.length; // 1..12
    let value = 0n;

    for (let i = 0; i < len; i++) {
        const idx = BigInt(charToIndex(block[i])); // 0..31
        value = (value << 5n) | idx;               // 5 بت لكل حرف
    }

    // نضيف طول البلوك في أعلى 4 بت
    value |= (BigInt(len) & 0xfn) << 60n;

    return value & 0xFFFFFFFFFFFFFFFFn; // 64‑bit
}

/****************************************************
 * 5) فك بلوك 64‑bit إلى حروف
 ****************************************************/
function decodeBlockFrom64(value) {
    const len = Number((value >> 60n) & 0xfn); // 4 بت للطول
    let x = value & 0x0FFFFFFFFFFFFFFFn;       // 60 بت للحروف

    const chars = new Array(len);
    for (let i = len - 1; i >= 0; i--) {
        const idx = Number(x & 0x1Fn); // آخر 5 بت
        chars[i] = indexToChar(idx);
        x >>= 5n;
    }
    return chars.join("");
}

/****************************************************
 * 6) تقسيم الكلمة إلى بلوكات 12 حرف
 ****************************************************/
function splitToBlocks12(word) {
    const blocks = [];
    for (let i = 0; i < word.length; i += 12) {
        blocks.push(word.slice(i, i + 12));
    }
    return blocks;
}

/****************************************************
 * 7) UserKey → 64‑bit
 ****************************************************/
function userKeyTo64Bit(keyString) {
    let h = 0n;
    for (let i = 0; i < keyString.length; i++) {
        h = (h * 131n) ^ BigInt(keyString.charCodeAt(i));
        h &= 0xFFFFFFFFFFFFFFFFn;
    }
    return h;
}

/****************************************************
 * 8) تشفير بلوك 64‑bit باستخدام XOR
 ****************************************************/
function encryptBlock64(block64, userKey64) {
    return (block64 ^ userKey64) & 0xFFFFFFFFFFFFFFFFn;
}

/****************************************************
 * 9) فك تشفير بلوك 64‑bit
 ****************************************************/
function decryptBlock64(enc64, userKey64) {
    return (enc64 ^ userKey64) & 0xFFFFFFFFFFFFFFFFn;
}

/****************************************************
 * 10) الكلمة → BigInt (مع تشفير)
 ****************************************************/
function encodeWordToBigInt(wordRaw, userKey) {
    const word = normalizeArabic(wordRaw);
    if (!word) return 0n;

    const userKey64 = userKeyTo64Bit(userKey);
    const blocks = splitToBlocks12(word);

    let result = 0n;

    for (const block of blocks) {
        const b64 = encodeBlockTo64(block);
        const enc = encryptBlock64(b64, userKey64);
        result = (result << 64n) | enc;
    }

    return result;
}

/****************************************************
 * 11) BigInt → كلمة (مع فك التشفير)
 ****************************************************/
function decodeBigIntToWord(bigIntValue, userKey) {
    const userKey64 = userKeyTo64Bit(userKey);
    let x = bigIntValue;

    const blocks = [];

    while (x > 0n) {
        const enc = x & 0xFFFFFFFFFFFFFFFFn; // آخر 64‑bit
        x >>= 64n;

        const dec = decryptBlock64(enc, userKey64);
        const block = decodeBlockFrom64(dec);
        blocks.push(block);
    }

    blocks.reverse();
    return blocks.join("");
}

/****************************************************
 * 12) BigInt → بايتات
 ****************************************************/
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

/****************************************************
 * 13) بايتات → BigInt
 ****************************************************/
function bytesToBigInt(bytes) {
    let bi = 0n;
    for (let i = 0; i < bytes.length; i++) {
        bi = (bi << 8n) | BigInt(bytes[i]);
    }
    return bi;
}
