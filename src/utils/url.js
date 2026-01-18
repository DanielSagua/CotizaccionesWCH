function buildQueryString(baseParams = {}, overrides = {}) {
    const merged = { ...baseParams, ...overrides };

    // elimina null/undefined/'' (pero mantiene 0)
    Object.keys(merged).forEach(k => {
        const v = merged[k];
        if (v === undefined || v === null || v === '') delete merged[k];
    });

    const parts = [];
    for (const [k, v] of Object.entries(merged)) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
}

module.exports = { buildQueryString };
