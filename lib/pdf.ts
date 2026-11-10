import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { dataDir, getSetting } from './db';
import { safeConfig } from './types';
import type { ConfigKey, TemplateConfig } from './types';

export type EditorData = { registration: string; file: string; date: string; logo: string | null; markLabel: string };
const WIDTH = 595.28, HEIGHT = 841.89; // A4
const sanitize = (input: unknown, max = 100) => String(input || '').slice(0, max).replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E]/g,'?');
const color = rgb(0.08, 0.13, 0.22);
const fieldKeys: ConfigKey[] = ['registration', 'file', 'date'];
function stripDataUri(data: string) {
  const m = /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/=]+)$/.exec(data);
  if (!m || m[2].length > 7_000_000) throw new Error('Logo must be PNG/JPG under 4 MB');
  return { type: m[1], bytes: Buffer.from(m[2], 'base64') };
}
function rectangleFor(slot: TemplateConfig[ConfigKey]) {
  const width = (slot.width / 100) * WIDTH;
  const height = (slot.height / 100) * HEIGHT;
  return { x: ((slot.x / 100) * WIDTH) - width / 2,
    y: HEIGHT - ((slot.y / 100) * HEIGHT) - height / 2,
    width, height };
}
export async function createDemoPdf(data: EditorData): Promise<Uint8Array> {
  const fileName = getSetting('template_file');
  const mime = getSetting('template_mime');
  if (!fileName || !mime) throw new Error('Admin must upload a JPG/PNG template first');
  const imageBuffer = fs.readFileSync(path.join(dataDir(), path.basename(fileName)));
  const document = await PDFDocument.create();
  const page = document.addPage([WIDTH, HEIGHT]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const background = mime === 'image/png'
    ? await document.embedPng(imageBuffer) : await document.embedJpg(imageBuffer);
  // Entire image remains visible, without stretching. Matching A4 scans fill the page.
  const scale = Math.min(WIDTH / background.width, HEIGHT / background.height);
  const bw = background.width * scale, bh = background.height * scale;
  page.drawRectangle({ x:0, y:0, width:WIDTH, height:HEIGHT, color:rgb(1,1,1) });
  page.drawImage(background, { x:(WIDTH-bw)/2, y:(HEIGHT-bh)/2, width:bw, height:bh });
  const conf = safeConfig(JSON.parse(getSetting('template_config') || '{}'));
  for (const key of fieldKeys) {
    const value = sanitize(data[key], 70);
    const slot = conf[key]; const box = rectangleFor(slot);
    // White mask panels are sample overlays, not modifications to the source document.
    page.drawRectangle({ x:box.x,y:box.y,width:box.width,height:box.height,color:rgb(1,1,1),opacity:0.97 });
    const sz = slot.fontSize;
    const fit = Math.min(sz, (box.width - 8) * sz / Math.max(bold.widthOfTextAtSize(value || ' ', sz), 1));
    page.drawText(value, { x:box.x+3,y:box.y+Math.max(2,(box.height-fit)/2),font:bold,size:fit,color });
  }
  if (data.logo) {
    const parsed = stripDataUri(data.logo);
    const img = parsed.type === 'png' ? await document.embedPng(parsed.bytes) : await document.embedJpg(parsed.bytes);
    const box = rectangleFor(conf.logo);
    page.drawRectangle({x:box.x,y:box.y,width:box.width,height:box.height,color:rgb(1,1,1),opacity:0.97});
    const k = Math.min(box.width / img.width, box.height / img.height);
    page.drawImage(img,{x:box.x+(box.width-img.width*k)/2,y:box.y+(box.height-img.height*k)/2,width:img.width*k,height:img.height*k});
  }
  // Inescapable, highly visible markings for an altered official-document reference.
  page.drawRectangle({x:0,y:HEIGHT-54,width:WIDTH,height:54,color:rgb(0.08,0.16,0.3),opacity:0.94});
  page.drawText('DEMO / SAMPLE - NOT A VALID REGISTRATION', {x:20,y:HEIGHT-34,font:bold,size:16,color:rgb(1,1,1)});
  for (let i=0; i<3; i++) {
    page.drawText('SAMPLE  -  NOT VALID', {
      x:60, y:160+i*260, size:46, font:bold,
      color:rgb(0.76,0.12,0.16),opacity:0.27,rotate:degrees(32)
    });
  }
  page.drawRectangle({x:0,y:0,width:WIDTH,height:50,color:rgb(0.99,0.94,0.92),opacity:0.97});
  page.drawText('UNOFFICIAL DEMONSTRATION | Not issued or approved by CIPO or any government.',
    {x:18,y:21,font,size:10,color:rgb(0.48,0.12,0.16)});
  const label = sanitize(data.markLabel || 'HAYA GAMING', 70);
  document.setTitle(`Shinzo - ${label} - Sample`);
  document.setSubject('Unofficial demonstration, not a government trademark registration.');
  document.setAuthor('Shinzo Sample Panel');
  return await document.save();
}
