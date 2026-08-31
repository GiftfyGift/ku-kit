// Text extraction for the three source formats this project's Drive material
// comes in. Kept dependency-light and format-specific rather than reaching
// for one do-everything library, since each format needs different handling
// to get clean, chunkable text out.

const fs = require('fs');
const path = require('path');

async function extractPdf(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer = fs.readFileSync(filePath);
  const { text } = await pdfParse(buffer);
  return text;
}

function extractPptx(filePath) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);
  const slideEntries = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    // Slide filenames sort lexicographically wrong past slide9 (slide10 < slide2)
    // without this numeric extraction — matters for reading order.
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)\.xml/)[1], 10);
      const nb = parseInt(b.entryName.match(/slide(\d+)\.xml/)[1], 10);
      return na - nb;
    });
  return slideEntries.map((entry, i) => {
    const xml = entry.getData().toString('utf8');
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]);
    return `--- Slide ${i + 1} ---\n${runs.join(' ')}`;
  }).join('\n\n');
}

function extractXlsx(filePath) {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);
  return workbook.SheetNames.map(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    const body = rows.map(row => row.filter(cell => cell !== undefined && cell !== '').join(' | ')).join('\n');
    return `--- Sheet: ${sheetName} ---\n${body}`;
  }).join('\n\n');
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.pptx') return extractPptx(filePath);
  if (ext === '.xlsx') return extractXlsx(filePath);
  throw new Error(`No extractor for ${ext} (${filePath})`);
}

module.exports = { extractText, extractPdf, extractPptx, extractXlsx };
