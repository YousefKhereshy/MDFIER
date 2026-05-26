User uploads file → Serverless function detects MIME type / extension
       ↓
PDF / DOCX → text extraction (pdf-parse, mammoth)
XLSX → table to Markdown conversion
Text / code → wrapped in ``` fences
Other (binary) → Base64 encoded
       ↓
Markdown file is sent as a download
       ↓
Temporary file is deleted
