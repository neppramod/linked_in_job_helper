// Makes a simple PDF (US Letter, 1 inch margins, Times) from the filled cover letter text.
// Same rules as the letter page: blank line = new paragraph, **bold**, "# Name" = heading.
// No libraries: uses the PDF built-in fonts, so only Windows-1252 characters can be shown.

// Character widths (1/1000 of the font size) for ASCII 32..126.
const PDF_WIDTHS = {
  regular: [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,
    278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,
    722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,
    333,389,278,500,500,722,500,500,444,480,200,480,541],
  bold: [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,
    333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,
    722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,
    444,389,333,556,500,722,500,500,444,394,220,394,520]
};

// Unicode characters that Windows-1252 puts in 128..159, with [code, regular width, bold width].
const PDF_EXTRA = {
  '‘': [0x91, 333, 333], '’': [0x92, 333, 333], '“': [0x93, 444, 500], '”': [0x94, 444, 500],
  '•': [0x95, 350, 350], '–': [0x96, 500, 500], '—': [0x97, 1000, 1000], '…': [0x85, 1000, 1000],
  '€': [0x80, 500, 500], '™': [0x99, 980, 1000]
};

// Returns [byte, width] for one character, or a '?' when the font can't show it.
function pdfChar(ch, bold) {
  const c = ch.codePointAt(0);
  const w = PDF_WIDTHS[bold ? 'bold' : 'regular'];
  if (c >= 32 && c <= 126) return [c, w[c - 32]];
  if (PDF_EXTRA[ch]) return [PDF_EXTRA[ch][0], PDF_EXTRA[ch][bold ? 2 : 1]];
  if (c === 0xA0) return [32, 250];
  if (c >= 0xA1 && c <= 0xFF) {
    // Accented letters: use the width of the plain letter.
    const base = ch.normalize('NFD')[0];
    const b = base.codePointAt(0);
    return [c, b >= 32 && b <= 126 ? w[b - 32] : 500];
  }
  return [63, w[63 - 32]];
}

function pdfWidth(text, bold, size) {
  let w = 0;
  for (const ch of text) w += pdfChar(ch, bold)[1];
  return w * size / 1000;
}

function pdfHex(text, bold) {
  let h = '';
  for (const ch of text) h += pdfChar(ch, bold)[0].toString(16).padStart(2, '0');
  return '<' + h + '>';
}

// Splits "a **b** c" into [{text, bold}] words (spaces dropped, each word keeps its style).
function pdfWords(line, forceBold) {
  const words = [];
  line.split(/(\*\*.+?\*\*)/g).forEach(part => {
    const marked = /^\*\*.+\*\*$/.test(part);
    const bold = forceBold || marked;
    const text = marked ? part.slice(2, -2) : part;
    // Spaces are kept as markers, so "**Java**," stays one piece on the line.
    text.split(/(\s+)/).forEach(t => {
      if (!t) return;
      if (/^\s+$/.test(t)) { words.push({ space: true }); return; }
      words.push({ text: t, bold });
    });
  });
  return words;
}

function letterPdfBase64(filled) {
  const PAGE_W = 612, PAGE_H = 792, MARGIN = 72, WIDTH = PAGE_W - 2 * MARGIN;
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  const newPage = () => { pages.push(ops); ops = []; y = PAGE_H - MARGIN; };

  // Puts one line of words at the current y.
  const drawLine = (line, size, color) => {
    if (y - size < MARGIN) newPage();
    y -= size;
    let x = MARGIN;
    for (const w of line) {
      if (w.gap) { x += w.gap; continue; }
      ops.push(`BT /${w.bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfHex(w.text, w.bold)} Tj ET`);
      x += pdfWidth(w.text, w.bold, size);
    }
    y -= size * 0.4;
  };

  // Wraps one source line (no line breaks in it) to the page width.
  const drawWrapped = (src, size, bold, color) => {
    const spaceW = pdfWidth(' ', false, size);
    let line = [], lineW = 0, pendingSpace = false;
    const flush = () => { drawLine(line, size, color); line = []; lineW = 0; pendingSpace = false; };
    for (const w of pdfWords(src, bold)) {
      if (w.space) { pendingSpace = line.length > 0; continue; }
      // A word longer than a whole line (like a long link) is cut into pieces.
      let text = w.text;
      while (pdfWidth(text, w.bold, size) > WIDTH) {
        let n = text.length;
        while (n > 1 && pdfWidth(text.slice(0, n), w.bold, size) > WIDTH - (line.length ? lineW + spaceW : 0)) n--;
        if (line.length && n < 8) { flush(); continue; }
        if (pendingSpace) { line.push({ gap: spaceW }); lineW += spaceW; }
        line.push({ text: text.slice(0, n), bold: w.bold });
        flush();
        text = text.slice(n);
      }
      const ww = pdfWidth(text, w.bold, size);
      const extra = pendingSpace ? spaceW : 0;
      if (line.length && lineW + extra + ww > WIDTH) flush();
      else if (pendingSpace) { line.push({ gap: spaceW }); lineW += spaceW; }
      line.push({ text, bold: w.bold });
      lineW += ww;
      pendingSpace = false;
    }
    if (line.length) flush();
    else drawLine([], size, color);   // keep empty lines
  };

  const paragraphs = String(filled).replace(/\r\n/g, '\n').split(/\n\s*\n/).filter(p => p.trim());
  for (const par of paragraphs) {
    const h = par.trim().match(/^#{1,3}\s+(.+)$/s);
    if (h) {
      h[1].split('\n').forEach(l => drawWrapped(l.trim(), 17, true, '0.102 0.373 0.478'));
      y -= 8;
    } else {
      par.trim().split('\n').forEach(l => drawWrapped(l.replace(/\s+$/, ''), 11, false, '0.067 0.067 0.067'));
      y -= 10;
    }
  }
  pages.push(ops);

  // Assemble the file. Every character here is one byte, so string length = byte offset.
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const p of pages) {
    const content = p.join('\n');
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return btoa(out);
}
