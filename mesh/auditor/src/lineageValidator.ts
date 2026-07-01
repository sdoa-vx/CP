import { Request, Response } from 'express';

export const handleLineageValidation = (req: Request, res: Response) => {
    const { lineage } = req.body;

    if (!lineage) {
        return res.status(400).json({ error: 'lineage string is required' });
    }

    console.log(`[Auditor] Validating lineage string: ${lineage}`);

    // SDOA Lineage Format: "parent: <Name>"
    if (!lineage.startsWith('parent: ')) {
        return res.json({
            status: 'rejected',
            errors: ['Lineage must declare a parent using "parent: <Name>" syntax'],
        });
    }

    res.json({
        status: 'approved',
        message: 'Lineage string is SDOA compliant'
    });
};
