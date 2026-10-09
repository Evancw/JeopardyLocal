const zlib = require('node:zlib');
const { decodeBase85 } = require('../scratch/payload.js');
function payloadMetadata(html) {
  const match = html.match(/<script id="payload" type="application\/octet-stream" data-bytes="(\d+)" data-encoding="(base85|base64)">([^<]*)<\/script>/);
  if (!match) throw new Error('Packaged payload not found.');
  const bytes = match[2] === 'base85' ? Buffer.from(decodeBase85(match[3], Number(match[1]))) : Buffer.from(match[3], 'base64');
  return { bytes, text: match[3], length: Number(match[1]), encoding: match[2] };
}
function unpackPackage(html) { return zlib.gunzipSync(payloadMetadata(html).bytes).toString('utf8'); }
module.exports = { payloadMetadata, unpackPackage };
