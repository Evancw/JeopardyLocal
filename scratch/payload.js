// Printable data avoids HTML delimiters and JavaScript string escapes.
const BASE85_ALPHABET = Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(char => !['"', "'", '\\', '<', '>', '`', '&'].includes(char)).slice(0, 85).join('');

function encodeBase85(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected bytes.');
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 4) {
    let value = 0, block = '';
    for (let i = 0; i < 4; i++) value = value * 256 + (bytes[offset + i] || 0);
    for (let i = 0; i < 5; i++) {
      block = BASE85_ALPHABET[value % 85] + block;
      value = Math.floor(value / 85);
    }
    text += block;
  }
  return text;
}

// Also embedded in the loader; keep it independent of Node and build tools.
function decodeBase85(text, byteLength, alphabet = BASE85_ALPHABET) {
  const invalid = () => { throw new Error('Invalid packaged data.'); };
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || text.length !== Math.ceil(byteLength / 4) * 5) invalid();
  const bytes = new Uint8Array(byteLength);
  for (let offset = 0, output = 0; offset < text.length; offset += 5) {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const digit = alphabet.indexOf(text[offset + i]);
      if (digit < 0) invalid();
      value = value * 85 + digit;
    }
    if (value > 0xffffffff) invalid();
    for (let i = 0; i < 4; i++, output++) {
      const byte = (value >>> (24 - i * 8)) & 255;
      if (output < byteLength) bytes[output] = byte;
      else if (byte !== 0) invalid();
    }
  }
  return bytes;
}

module.exports = { BASE85_ALPHABET, encodeBase85, decodeBase85 };
