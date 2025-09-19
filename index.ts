require('dotenv').config();
const express = require('express');
const axios = require('axios');
const dns = require('dns');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione AdGuard DNS dalle variabili d'ambiente
const ADGUARD_DNS = process.env.ADGUARD_DNS_PRIMARY || '94.140.14.14';
const ADGUARD_DNS_SECONDARY = process.env.ADGUARD_DNS_SECONDARY || '94.140.15.15';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(',') : ['vixsrc.to'];

// Middleware per il logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Validazione dominio
function isDomainAllowed(domain) {
    return ALLOWED_DOMAINS.some(allowed => domain.endsWith(allowed));
}

// Rotta per il proxy video
app.get('/proxy/video', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: 'Parametro URL mancante' });
        }

        const parsedUrl = new URL(videoUrl);
        const hostname = parsedUrl.hostname;

        // Verifica se il dominio è consentito
        if (!isDomainAllowed(hostname)) {
            return res.status(403).json({ error: 'Dominio non consentito' });
        }

        // Risoluzione DNS utilizzando AdGuard DNS
        const resolvedIp = await new Promise((resolve, reject) => {
            dns.setServers([ADGUARD_DNS, ADGUARD_DNS_SECONDARY]);
            dns.resolve4(hostname, (err, addresses) => {
                if (err) {
                    console.error(`DNS resolution error for ${hostname}:`, err);
                    reject(err);
                } else {
                    resolve(addresses[0]);
                }
            });
        });

        parsedUrl.hostname = resolvedIp;
        const resolvedUrl = parsedUrl.toString();

        console.log(`Proxying request to: ${resolvedUrl}`);

        // Fetch del video tramite Axios con timeout
        const response = await axios.get(resolvedUrl, {
            responseType: 'stream',
            timeout: REQUEST_TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/*',
                'Referer': `https://${hostname}/`
            }
        });

        // Inoltro degli headers del video
        res.set({
            'Content-Type': response.headers['content-type'],
            'Content-Length': response.headers['content-length'],
            'Cache-Control': 'public, max-age=3600'
        });

        // Inoltro dello stream video
        response.data.pipe(res);

    } catch (error) {
        console.error('Errore nel fetching del video:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            return res.status(404).json({ error: 'Video non trovato' });
        }
        if (error.response) {
            return res.status(error.response.status).json({ error: 'Errore dal server remoto' });
        }
        
        res.status(500).json({ error: 'Impossibile recuperare il video' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        dns_servers: [ADGUARD_DNS, ADGUARD_DNS_SECONDARY]
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Video Proxy Server with AdGuard DNS',
        endpoints: {
            health: '/health',
            proxy: '/proxy/video?url=URL_VIDEO'
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
    console.log(`AdGuard DNS servers: ${ADGUARD_DNS}, ${ADGUARD_DNS_SECONDARY}`);
});