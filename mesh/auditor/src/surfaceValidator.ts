import { Request, Response } from 'express';

export const handleSurfaceValidation = (req: Request, res: Response) => {
    const { endpoints, capabilities } = req.body;

    if (!endpoints || !capabilities) {
        return res.status(400).json({ error: 'endpoints and capabilities blocks are required' });
    }

    console.log(`[Auditor] Validating capability surface...`);

    // SDOA Surface Rules
    // 1. Must expose a /health endpoint
    if (!endpoints.health) {
        return res.json({
            status: 'rejected',
            errors: ['Capability surface must expose a /health endpoint'],
        });
    }

    // 2. Capability claims must not be empty
    if (Object.keys(capabilities).length === 0) {
        return res.json({
            status: 'rejected',
            errors: ['Module claims zero capabilities. SDOA requires at least one capability.'],
        });
    }

    res.json({
        status: 'approved',
        message: 'Capability surface is SDOA compliant'
    });
};
