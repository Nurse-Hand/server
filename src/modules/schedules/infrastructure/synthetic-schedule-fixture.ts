import { deflateSync } from 'node:zlib';

export { SYNTHETIC_SCHEDULE_FIXTURE_SHA256 } from '../domain/synthetic-schedule-fixture-registry';

// 실제 정보 없이 격자와 색상 블록만 포함한 저장소 소유 합성 fixture다.
export function createSyntheticScheduleFixture(
  width = 640,
  height = 480,
): Buffer {
  const scanlines = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 3 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3;
      if (x % 80 < 2 || y % 48 < 2) {
        scanlines.fill(40, pixelOffset, pixelOffset + 3);
      } else if (y > 120 && y < 155 && x > 80 && x < 560) {
        const tokenIndex = Math.floor(x / 40) % 4;
        scanlines[pixelOffset] = tokenIndex === 0 ? 40 : 220;
        scanlines[pixelOffset + 1] = tokenIndex === 1 ? 40 : 220;
        scanlines[pixelOffset + 2] = tokenIndex === 2 ? 40 : 220;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    8 + data.length,
  );
  return output;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
