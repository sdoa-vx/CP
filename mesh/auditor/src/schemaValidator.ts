import { Request, Response } from 'express';

export const handleManifestValidation = (req: Request, res: Response) => {
    const { manifest } = req.body;

    if (!manifest) {
        return res.status(400).json({ error: 'manifest object is required for validation' });
    }

    console.log(`[Auditor] Validating manifest for: ${manifest.authority || 'Unknown'}`);

    // SDOA Manifest Validation Rules
    const errors: string[] = [];
    if (!manifest.authority) errors.push('Missing "authority" field');
    if (!manifest.version) errors.push('Missing "version" field');
    if (!manifest.capabilities) errors.push('Missing "capabilities" block');
    if (!manifest.governance) errors.push('Missing "governance" block');

    if (errors.length > 0) {
        return res.json({
            status: 'rejected',
            errors,
            message: 'Manifest failed SDOA schema validation'
        });
    }

    res.json({
        status: 'approved',
        message: 'Manifest is SDOA compliant'
    });
};
