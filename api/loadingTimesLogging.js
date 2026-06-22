import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }

    try {
        const { timeMs, version, title } = req.body;

        if (typeof timeMs !== 'number') {
            return res.status(400).json({ success: false, error: 'Invalid load time data type.' });
        }

        // Define a clean structured entry
        const logEntry = {
            timestamp: new Date().toISOString(),
            timeMs,
            version,
            title
        };

        // Standard Vercel Serverless deployments operate on read-only environments.
        // Therefore, writing directly to the source folder inside Vercel lambdas is blocked.
        // During local development (vercel dev), we can write directly to local JSON files.
        const isLocalDev = process.env.VERCEL_ENV === undefined || process.env.NODE_ENV === 'development';
        
        let localWritePath = '';
        if (isLocalDev) {
            // Write directly to your local file system during vercel dev runtimes
            localWritePath = path.join(process.cwd(), 'loading-times-log.json');
            
            let currentLogs = [];
            try {
                if (fs.existsSync(localWritePath)) {
                    const existingData = fs.readFileSync(localWritePath, 'utf-8');
                    currentLogs = JSON.parse(existingData);
                }
            } catch (readErr) {
                console.warn('Error reading log file, initializing empty array.', readErr);
            }

            currentLogs.push(logEntry);
            
            try {
                fs.writeFileSync(localWritePath, JSON.stringify(currentLogs, null, 2), 'utf-8');
                console.log(`[Metric Logged Locally] Written to: ${localWritePath}`);
            } catch (writeErr) {
                console.error('Failed to write JSON locally:', writeErr);
            }
        } else {
            // In Production, Vercel captures all console.log output.
            // These entries are safely logged under your Vercel Dashboard logs.
            console.log(JSON.stringify({ event: 'performance_log', data: logEntry }));
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Performance metric saved successfully.',
            destination: isLocalDev ? 'Local filesystem JSON' : 'Vercel Console Logs'
        });

    } catch (error) {
        console.error('Error logging performance metric:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}