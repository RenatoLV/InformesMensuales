const { google } = require('googleapis');
const express = require('express');

// Credenciales por defecto del servicio (Cloud Run Service Account)
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth });

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  next();
});

// Health check — Cloud Run lo necesita para saber que el servidor arrancó
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'generar-pdf-honorarios' });
});

app.post('/generarPDF', async (req, res) => {
  try {
    const { docIdRemu, docIdTransp, folderIdRemu, folderIdTransp, nombrePdf } = req.body;

    if (!docIdRemu || !docIdTransp || !folderIdRemu || !folderIdTransp || !nombrePdf) {
      return res.status(400).json({ exito: false, error: 'Faltan parámetros requeridos.' });
    }

    // 1. Exportar ambos Docs a PDF en paralelo (stream directo)
    const [exportRemuStream, exportTranspStream] = await Promise.all([
      drive.files.export({ fileId: docIdRemu,   mimeType: 'application/pdf' }, { responseType: 'stream' }),
      drive.files.export({ fileId: docIdTransp, mimeType: 'application/pdf' }, { responseType: 'stream' })
    ]);

    // 2. Guardar PDFs en Drive en paralelo
    const [createRemuRes, createTranspRes] = await Promise.all([
      drive.files.create({
        requestBody: { name: nombrePdf, parents: [folderIdRemu] },
        media:       { mimeType: 'application/pdf', body: exportRemuStream.data },
        fields:      'id, webViewLink'
      }),
      drive.files.create({
        requestBody: { name: nombrePdf, parents: [folderIdTransp] },
        media:       { mimeType: 'application/pdf', body: exportTranspStream.data },
        fields:      'id, webViewLink'
      })
    ]);

    // 3. Dar permisos de lectura pública en paralelo
    await Promise.all([
      drive.permissions.create({ fileId: createRemuRes.data.id,   requestBody: { role: 'reader', type: 'anyone' } }),
      drive.permissions.create({ fileId: createTranspRes.data.id, requestBody: { role: 'reader', type: 'anyone' } })
    ]);

    return res.status(200).json({
      exito:     true,
      urlRemu:   createRemuRes.data.webViewLink,
      urlTransp: createTranspRes.data.webViewLink
    });

  } catch (error) {
    console.error('Error en /generarPDF:', error);
    return res.status(500).json({ exito: false, error: error.message });
  }
});

// ⚠️ Cloud Run REQUIERE escuchar en process.env.PORT (8080 por defecto)
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
});
