// QR codes that link to the source page, drawn as SVG on this device.

import qrcode from "qrcode-generator";

/** The UTF-8 bytes of `text`, one per character, as the generator's byte mode expects. */
function utf8Binary(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join("");
}

/** An SVG QR code for `text`, with a quiet zone of four modules. */
export function sourceQrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(utf8Binary(text), "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
