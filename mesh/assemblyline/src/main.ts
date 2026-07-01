import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleBuildRequest } from './orchestrator';
import { handleProvisionRequest } from './v8manager';
import { handlePackageRequest } from './packaging';

dotenv.config();

const app = express();
const PORT = process.env.ASSEMBLYLINE_PORT || 3015;

app.use(cors());
app.use(express.json());

// AssemblyLine Sovereign Identity
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        authority: 'AssemblyLine',
        role: 'Polyglot Build Orchestrator & V8 Memory Provisioner'
    });
});

// Polyglot Build Orchestration
app.post('/build', handleBuildRequest);

// V8 Memory Provisioning
app.post('/provision', handleProvisionRequest);

// VSIX & Module Packaging
app.post('/package', handlePackageRequest);

app.listen(PORT, () => {
    console.log(`[AssemblyLine] Sovereign authority online at http://localhost:${PORT}`);
    console.log(`[AssemblyLine] Awaiting polyglot orchestration commands...`);
});
