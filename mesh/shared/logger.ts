import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let sbClient: SupabaseClient | null = null;
let authorityName: string = 'Unknown';

export const initLogger = (authority: string) => {
    authorityName = authority;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (url && key) {
        sbClient = createClient(url, key);
        console.log(`[${authorityName} Logger] Connected to mesh_logs in Supabase`);
    } else {
        console.warn(`[${authorityName} Logger] WARNING: No Supabase keys. Logging to stdout only.`);
    }
};

const log = async (level: string, message: string) => {
    console.log(`[${authorityName}] ${level}: ${message}`);
    
    if (sbClient) {
        try {
            await sbClient.from('mesh_logs').insert({
                authority: authorityName,
                level,
                message,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            console.error(`[Logger Error] Failed to write to mesh_logs: ${err}`);
        }
    }
};

export const Logger = {
    info: (msg: string) => log('INFO', msg),
    warn: (msg: string) => log('WARN', msg),
    error: (msg: string) => log('ERROR', msg)
};
