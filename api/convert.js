import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import mime from 'mime-types';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new formidable.IncomingForm();
  form.uploadDir = '/tmp'; // Vercel writable temp
  form.keepExtensions = true;

  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = files.file;
    if (!file) return res.status(400).send('No file uploaded');

    const originalName = file.originalFilename || 'unknown';
    const filePath = file.filepath;
    const mimeType = mime.lookup(originalName) || 'application/octet-stream';

    const markdown = await convertToMarkdown(filePath, originalName, mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${originalName.replace(/\.[^.]*$/, '')}.md"`);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.status(200).send(markdown);
  } catch (err) {
    console.error(err);
    res.status(500).send('Conversion failed: ' + err.message);
  } finally {
    // Cleanup
    if (file?.filepath && fs.existsSync(file.filepath)) {
      fs.unlink(file.filepath, () => {});
    }
  }
}

async function convertToMarkdown(filePath, originalName, mimeType) {
  // ... (same conversion logic as previously provided – PDF, DOCX, XLSX, text, binary)
  // Make sure to use fs.readFileSync and the libraries correctly.
  // Reuse the exact code from my earlier serverless answer.
}

const rawName = originalName.replace(/\.[^.]*$/, '') + '.md';
// Encode UTF-8 as per RFC 5987
const encodedName = encodeURIComponent(rawName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);