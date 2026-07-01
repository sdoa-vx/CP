import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleProposalValidation } from './validator';

dotenv.config();

const app = express();
const PORT = process.env.FISP_PORT || 3024;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        authority: 'FISPPipeline',
        role: 'FISP Contribution Pipeline Engine'
    });
});

app.post('/fisp/validate', handleProposalValidation);

app.post('/fisp/submit', (req, res) => {
    console.log(`[FISP] Handing off approved proposal to AssemblyLine...`);
    res.json({
        status: 'submitted',
        message: 'Innovation proposal submitted to AssemblyLine'
    });
});

app.listen(PORT, () => {
    console.log(`[FISP] Sovereign authority online at http://localhost:${PORT}`);
    console.log(`[FISP] Ready to ingest v1.1 external innovations...`);
});
