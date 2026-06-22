const API_URL = 'https://api.tarkov.dev/graphql';

export async function fetchQuestsByTrader(traderName) {
    const query = `...`; // the same GraphQL query
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.errors) throw new Error(json.errors[0].message);
    // filter and build tree...
    return virtualRoot;
}