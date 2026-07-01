import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleManifestValidation } from './schemaValidator';
import { handleSurfaceValidation } from './surfaceValidator';
import { handleLineageValidation } from './lineageValidator';

dotenv.config();

const app = express();
const PORT = process.env.AUDITOR_PORT || 3017;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        authority: 'Auditor',
        role: 'SDOA Compliance & Governance Validator'
    });
});

app.post('/validate/manifest', handleManifestValidation);
app.post('/validate/surface', handleSurfaceValidation);
app.post('/validate/lineage', handleLineageValidation);

app.listen(PORT, () => {
    console.log(`[Auditor] Sovereign authority online at http://localhost:${PORT}`);
    console.log(`[Auditor] Standing by for compliance validation...`);
});
