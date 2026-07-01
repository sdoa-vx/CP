import { Request, Response } from 'express';

export const handleProposalValidation = (req: Request, res: Response) => {
    const { proposal } = req.body;

    if (!proposal) {
        return res.status(400).json({ error: 'proposal object is required' });
    }

    console.log(`[FISP] Validating external innovation proposal: ${proposal.title || 'Unknown'}`);

    // SDOA FISP v1.1 Rules
    const errors: string[] = [];
    if (!proposal.title) errors.push('Missing proposal title');
    if (!proposal.capabilities) errors.push('Missing capability claims');
    if (!proposal.runtime) errors.push('Missing runtime declaration');

    if (errors.length > 0) {
        return res.json({
            status: 'rejected',
            errors,
            message: 'Proposal failed FISP schema validation'
        });
    }

    res.json({
        status: 'approved',
        message: 'Innovation proposal is valid and ready for submission'
    });
};
