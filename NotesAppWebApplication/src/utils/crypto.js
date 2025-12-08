//
// PUBLIC_INTERFACE
export async function generateSalt(length = 16) {
  /** Generate a cryptographically secure random salt as a Uint8Array. */
  const l = Math.max(8, Number(length) || 16);
  const arr = new Uint8Array(l);
  crypto.getRandomValues(arr);
  return arr;
}

// PUBLIC_INTERFACE
export function bytesToBase64(bytes) {
  /** Convert a Uint8Array or ArrayBuffer to base64 string. */
  const bin = Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(bin);
}

// PUBLIC_INTERFACE
export function base64ToBytes(b64) {
  /** Convert a base64 string to Uint8Array. */
  const binStr = atob(b64);
  const arr = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
  return arr;
}

async function importPinToKeyMaterial(pin) {
  // Normalize to string and ensure it’s only 4 digits client-side (caller should validate)
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(String(pin)), { name: "PBKDF2" }, false, ["deriveKey"]);
}

// PUBLIC_INTERFACE
export async function deriveKeyFromPin(pin, salt, iterations = 150_000) {
  /** Derive an AES-GCM CryptoKey from a 4-digit PIN and salt using PBKDF2-HMAC-SHA-256. */
  const keyMaterial = await importPinToKeyMaterial(pin);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt instanceof Uint8Array ? salt : base64ToBytes(String(salt)),
      iterations: Math.max(50_000, Number(iterations) || 150_000),
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// PUBLIC_INTERFACE
export async function encrypt(text, key) {
  /** Encrypt UTF-8 text with AES-GCM. Returns { cipher: base64, iv: base64 } */
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(String(text || ""));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    cipher: bytesToBase64(new Uint8Array(cipherBuf)),
    iv: bytesToBase64(iv),
  };
}

// PUBLIC_INTERFACE
export async function decrypt({ cipher, iv }, key) {
  /** Decrypt AES-GCM payload back into a UTF-8 string. */
  const cipherBytes = base64ToBytes(String(cipher));
  const ivBytes = base64ToBytes(String(iv));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, cipherBytes);
  return new TextDecoder().decode(plainBuf);
}
