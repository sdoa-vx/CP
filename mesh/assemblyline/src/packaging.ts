import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const handlePackageRequest = async (req: Request, res: Response) => {
    const { path, format } = req.body;

    if (!path || !format) {
        return res.status(400).json({ error: 'path and format (.vsix, npm, cargo) are required.' });
    }

    try {
        console.log(`[AssemblyLine] Initiating packaging for ${format} at ${path}`);
        
        let command = '';
        if (format === '.vsix') {
            command = `cd ${path} && npx vsce package`;
        } else if (format === 'npm') {
            command = `cd ${path} && npm pack`;
        } else if (format === 'cargo') {
            command = `cd ${path} && cargo package`;
        } else {
            return res.status(400).json({ error: `Unsupported packaging format: ${format}` });
        }

        console.log(`[AssemblyLine] Executing: ${command}`);
        const { stdout, stderr } = await execAsync(command);

        res.json({
            status: 'success',
            format,
            stdout,
            stderr,
            message: `Successfully packaged module at ${path}`
        });
    } catch (error: any) {
        console.error(`[AssemblyLine] Packaging failed:`, error);
        res.status(500).json({
            status: 'failed',
            error: error.message || 'Unknown packaging error'
        });
    }
};
