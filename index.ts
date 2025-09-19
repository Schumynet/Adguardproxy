const express = require('express');
const axios = require('axios');
const dns = require('dns');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione AdGuard DNS
const ADGUARD_DNS = '94.140.14.14'; // Server DNS predefinito di AdGuard :cite[4]

// Middleware per il logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Rotta per il proxy video
app.get('/proxy/video', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: 'Parametro URL mancante' });
        }

        // Risoluzione DNS utilizzando AdGuard DNS
        const parsedUrl = new URL(videoUrl);
        const hostname = parsedUrl.hostname;

        // Sostituisci con l'IP risolto via AdGuard DNS
        const resolvedIp = await new Promise((resolve, reject) => {
            dns.setServers([ADGUARD_DNS]);
            dns.resolve4(hostname, (err, addresses) => {
                if (err) reject(err);
                else resolve(addresses[0]);
            });
        });

        parsedUrl.hostname = resolvedIp;
        const resolvedUrl = parsedUrl.toString();

        // Fetch del video tramite Axios
        const response = await axios.get(resolvedUrl, {
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Inoltro dello stream video
        response.data.pipe(res);
    } catch (error) {
        console.error('Errore nel fetching del video:', error);
        res.status(500).json({ error: 'Impossibile recuperare il video' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});
