import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import XLSX from 'xlsx';
import mime from 'mime-types';

export const config = {
  api: {
    bodyParser: false, // required for formidable
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use a unique temporary file name to avoid conflicts
  const tempDir = '/tmp';
  const form = formidable({
    uploadDir: tempDir,
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB limit (adjust as needed)
  });

  let file;
  try {
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    file = files.file;
    if (!file) {
      return res.status(400).send('No file uploaded');
    }

    const originalName = file.originalFilename || 'unknown';
    const filePath = file.filepath;
    const mimeType = mime.lookup(originalName) || 'application/octet-stream';

    const markdown = await convertToMarkdown(filePath, originalName, mimeType);

    // Sanitize filename for Content-Disposition header (no invalid chars)
    let baseName = originalName.replace(/\.[^.]*$/, '');
    baseName = baseName.replace(/[^\w\s.-]/g, ''); // remove any non-alphanumeric except space, dot, dash
    if (!baseName) baseName = 'converted';
    const safeFilename = `${baseName}.md`;

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.status(200).send(markdown);
  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).send(`Conversion failed: ${err.message}`);
  } finally {
    // Clean up temporary file if it exists
    if (file && file.filepath && fs.existsSync(file.filepath)) {
      fs.unlink(file.filepath, () => {});
    }
  }
}

async function convertToMarkdown(filePath, originalName, mimeType) {
  const stats = fs.statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  // PDF
  if (mimeType === 'application/pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return `# ${originalName}\n\n## Extracted Text\n\n${pdfData.text}`;
  }

  // DOCX
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ path: filePath });
    return `# ${originalName}\n\n## Extracted Text\n\n${result.value}`;
  }

  // XLSX
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const workbook = XLSX.readFile(filePath);
    let markdown = `# ${originalName}\n\n## Sheets\n\n`;
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!data || data.length === 0) return;
      markdown += `### ${sheetName}\n\n`;
      const headers = data[0];
      markdown += '| ' + headers.map(h => String(h || '')).join(' | ') + ' |\n';
      markdown += '|' + headers.map(() => '---').join('|') + '|\n';
      for (let i = 1; i < Math.min(data.length, 101); i++) {
        const row = data[i];
        markdown += '| ' + row.map(cell => String(cell || '')).join(' | ') + ' |\n';
      }
      if (data.length > 100) markdown += `\n*... and ${data.length - 100} more rows*\n\n`;
    });
    return markdown;
  }

  // Text and code files
  const textMimePrefixes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
  const isText = textMimePrefixes.some(prefix => mimeType.startsWith(prefix)) ||
                 /\.(txt|md|markdown|json|js|py|java|cpp|c|html|css|xml|csv|sql|sh|yaml|yml)$/i.test(originalName);
  if (isText) {
    let content = fs.readFileSync(filePath, 'utf-8');
    if (/\.(md|markdown)$/i.test(originalName)) {
      return `# ${originalName} (original Markdown)\n\n${content}`;
    }
    const ext = originalName.split('.').pop();
    const lang = ext || 'text';
    return `# ${originalName}\n\n\`\`\`${lang}\n${content}\n\`\`\``;
  }

  // Binary fallback: Base64
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const chunkSize = 80;
  const lines = base64.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];
  return `# ${originalName}\n\n**File type:** ${mimeType}\n**File size:** ${fileSizeMB} MB\n\n\`\`\`base64\n${lines.join('\n')}\n\`\`\``;
}