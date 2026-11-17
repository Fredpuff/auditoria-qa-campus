import zlib from 'node:zlib';

const tabla = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let x = 0xffffffff;
  for (const b of buf) x = tabla[(x ^ b) & 0xff] ^ (x >>> 8);
  return (x ^ 0xffffffff) >>> 0;
};
const bloque = (tipo: string, datos: Buffer) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, c]);
};

/** PNG válido de 1x1 px. Con `bytesTotales` se rellena con un bloque de texto hasta pesar exactamente eso. */
export function png(bytesTotales?: number): Buffer {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = bloque('IDAT', zlib.deflateSync(Buffer.from([0, 200, 60, 40])));
  const fin = bloque('IEND', Buffer.alloc(0));
  const base = Buffer.concat([firma, bloque('IHDR', ihdr), idat, fin]);
  if (!bytesTotales) return base;
  const relleno = bytesTotales - base.length - 12;
  const texto = bloque('tEXt', Buffer.concat([Buffer.from('Comment\0'), Buffer.alloc(relleno - 8, 65)]));
  const out = Buffer.concat([firma, bloque('IHDR', ihdr), texto, idat, fin]);
  if (out.length !== bytesTotales) throw new Error(`PNG de ${out.length} bytes, se pedían ${bytesTotales}`);
  return out;
}

export const CINCO_MB = 5 * 1024 * 1024;
