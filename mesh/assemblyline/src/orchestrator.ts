import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const handleBuildRequest = async (req: Request, res: Response) => {
    const { target, path, runtime } = req.body;

    if (!target || !path || !runtime) {
        return res.status(400).json({ error: 'target, path, and runtime are required.' });
    }

    console.log(`[AssemblyLine] Initiating polyglot build for runtime: ${runtime} at ${path}`);

    try {
        let command = '';
        switch (runtime.toLowerCase()) {
            case 'rust':
                command = `cd ${path} && cargo build --release`;
                break;
            case 'go':
                command = `cd ${path} && go build -o ${target}`;
                break;
            case 'python':
                // For Python we might just freeze requirements or package
                command = `cd ${path} && pip freeze > requirements.txt`;
                break;
            case 'c++':
                command = `cd ${path} && make ${target}`;
                break;
            case 'wasm':
                command = `cd ${path} && wasm-pack build --target web`;
                break;
            default:
                return res.status(400).json({ error: `Unsupported runtime: ${runtime}` });
        }

        console.log(`[AssemblyLine] Executing: ${command}`);
        const { stdout, stderr } = await execAsync(command);

        res.json({
            status: 'success',
            runtime,
            stdout,
            stderr
        });
    } catch (error: any) {
        console.error(`[AssemblyLine] Build failed:`, error);
        res.status(500).json({
            status: 'failed',
            error: error.message || 'Unknown error occurred during build'
        });
    }
};
