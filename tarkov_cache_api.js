/**
 * Vercel Serverless Function: api/tarkov-data.js
 * Proxies, filters, and caches Tarkov data globally on Vercel's CDN.
 */

export default async function handler(req, res) {
    const API_URL = 'https://api.tarkov.dev/graphql';
    
    const query = `
    query {
        pvp: items(lang: en, gameMode: regular) {
            id name shortName wikiLink iconLink basePrice weight avg24hPrice types
            category { name }
            properties { __typename
                ... on ItemPropertiesWeapon { caliber fireRate ergonomics recoilVertical }
                ... on ItemPropertiesArmor { class durability }
            }
        }
        pve: items(lang: en, gameMode: pve) { id avg24hPrice }
    }`;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            throw new Error(`Tarkov.dev returned status: ${response.status}`);
        }

        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
            throw new Error(data.errors[0].message);
        }

        // Configure Vercel Edge CDN Caching
        // - s-maxage=86400: Cache on Edge nodes globally for up to 24 hours.
        // - stale-while-revalidate=3600: If accessed after 24 hours, serve stale, refresh in background.
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=3600');
        res.setHeader('Content-Type', 'application/json');
        
        return res.status(200).json(data);
    } catch (error) {
        console.error('Cache API Server Error:', error);
        return res.status(500).json({ 
            error: 'Failed to fetch and cache Tarkov data',
            details: error.message 
        });
    }
}