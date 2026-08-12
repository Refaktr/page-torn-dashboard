(function(){
    var PAGE_SIZE = 10;
    var LOGS_API_URL = 'https://api.torn.com/v2/user/log?log=1225%2C1226%2C4200%2C1113%2C4210%2C1112%2C5510%2C5511';
    var NETWORTH_API_URL = 'https://api.torn.com/v2/user/networth';

    var state = {
        entries: [],
        currentPage: 1
    };

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function formatNumber(value) {
        return Number.isFinite(value) ? value.toLocaleString() : '-';
    }

    function formatTimestamp(timestamp) {
        if (!Number.isFinite(timestamp)) {
            return '-';
        }

        return new Date(timestamp * 1000).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    function getNumber(value) {
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    function getApiKey() {
        try {
            var sessionApiKey = sessionStorage.getItem('tornApiKey');
            if (sessionApiKey) {
                return sessionApiKey;
            }

            return localStorage.getItem('tornApiKey');
        } catch (error) {
            return null;
        }
    }

    function buildApiUrl(baseUrl, apiKey) {
        var url = new URL(baseUrl);
        url.searchParams.set('key', apiKey);
        return url.toString();
    }

    function normalizeLogsUrl(urlText, apiKey) {
        var url = new URL(urlText, window.location.href);
        url.searchParams.set('key', apiKey);
        return url.toString();
    }

    function getActionType(details) {
        var title = details && typeof details.title === 'string' ? details.title.toLowerCase() : '';
        if (title.indexOf('buy') !== -1) {
            return 'buy';
        }

        if (title.indexOf('sell') !== -1) {
            return 'sell';
        }

        return 'other';
    }

    function getPrimaryMoneyValue(data) {
        var candidates = [
            getNumber(data.cost_total),
            getNumber(data.total_value),
            getNumber(data.worth),
            getNumber(data.value),
            getNumber(data.cost_each),
            getNumber(data.value_each)
        ];

        for (var i = 0; i < candidates.length; i += 1) {
            if (candidates[i] !== null) {
                return candidates[i];
            }
        }

        return null;
    }

    function formatMoneyCell(details, data) {
        var action = getActionType(details);
        var amount = getPrimaryMoneyValue(data || {});

        if (amount === null) {
            return '<span class="financials-money financials-money-neutral">-</span>';
        }

        var className = 'financials-money-neutral';
        if (action === 'buy') {
            className = 'financials-money-buy';
        } else if (action === 'sell') {
            className = 'financials-money-sell';
        }

        return '<span class="financials-money ' + className + '">$' + escapeHtml(formatNumber(amount)) + '</span>';
    }

    function formatCurrency(value) {
        var numeric = getNumber(value);
        if (numeric === null) {
            return '-';
        }

        if (numeric < 0) {
            return '-$' + formatNumber(Math.abs(numeric));
        }

        return '$' + formatNumber(numeric);
    }

    function networthCard(label, value, className) {
        return (
            '<div class="card financials-networth-card">' +
                '<h3>' + escapeHtml(label) + '</h3>' +
                '<div class="value ' + (className || '') + '">' + escapeHtml(value) + '</div>' +
            '</div>'
        );
    }

    function renderNetworth(networthResult) {
        var node = document.getElementById('financials-networth-cards');
        if (!node) {
            return;
        }

        if (!networthResult || !networthResult.ok || !networthResult.data) {
            var message = networthResult && networthResult.error ? networthResult.error : 'Networth data unavailable';
            node.innerHTML = '<div class="card financials-networth-card"><h3>Networth</h3><div class="value financials-networth-muted">' + escapeHtml(message) + '</div></div>';
            return;
        }

        var networth = networthResult.data;
        var money = networth.money || {};
        var items = networth.items || {};
        var assets = networth.assets || {};

        node.innerHTML = [
            networthCard('Total Networth', formatCurrency(networth.total)),
            networthCard('Wallet', formatCurrency(money.wallet)),
            networthCard('City Bank', formatCurrency(money.city_bank)),
            networthCard('Stock Market', formatCurrency(assets.stock_market)),
            networthCard('Inventory', formatCurrency(items.inventory)),
            networthCard('Unpaid Fees', formatCurrency(money.unpaid_fees), 'financials-networth-negative'),
            networthCard('Snapshot', formatTimestamp(networth.timestamp), 'financials-summary-text')
        ].join('');
    }

    function getCounterpartyText(details, data) {
        if (getNumber(data.seller) !== null) {
            return 'Seller #' + formatNumber(data.seller);
        }

        if (getNumber(data.buyer) !== null) {
            return 'Buyer #' + formatNumber(data.buyer);
        }

        if (typeof data.area === 'string' && data.area) {
            return data.area;
        }

        if (getNumber(data.stock) !== null) {
            return 'Stock #' + formatNumber(data.stock);
        }

        if (getNumber(data.item) !== null) {
            return 'Item #' + formatNumber(data.item);
        }

        return details && details.id ? 'Log Type #' + details.id : '-';
    }

    function buildRow(entry) {
        var details = entry.details || {};
        var data = entry.data || {};
        var eventText = (details.title || 'Unknown event') + ' (' + (details.category || 'Unknown category') + ')';
        var categoryText = details.category || 'Unknown';
        var counterpartyText = getCounterpartyText(details, data);
        var moneyCell = formatMoneyCell(details, data);

        return (
            '<tr>' +
                '<td class="financials-col-time">' + escapeHtml(formatTimestamp(entry.timestamp)) + '</td>' +
                '<td class="financials-col-event"><span class="financials-single-line" title="' + escapeHtml(eventText) + '">' + escapeHtml(eventText) + '</span></td>' +
                '<td class="financials-col-category"><span class="financials-single-line" title="' + escapeHtml(categoryText) + '">' + escapeHtml(categoryText) + '</span></td>' +
                '<td class="financials-col-counterparty"><span class="financials-single-line" title="' + escapeHtml(counterpartyText) + '">' + escapeHtml(counterpartyText) + '</span></td>' +
                '<td class="financials-col-money">' + moneyCell + '</td>' +
            '</tr>'
        );
    }

    function renderSummary() {
        var summaryNode = document.getElementById('financials-summary');
        if (!summaryNode) {
            return;
        }

        var entryCount = state.entries.length;
        var categoryCount = state.entries.reduce(function(map, entry){
            var category = entry && entry.details && entry.details.category ? String(entry.details.category) : 'Unknown';
            map[category] = true;
            return map;
        }, {});

        var latestTimestamp = entryCount ? state.entries[0].timestamp : null;
        var oldestTimestamp = entryCount ? state.entries[state.entries.length - 1].timestamp : null;

        summaryNode.innerHTML = [
            '<div class="card"><h3>Entries</h3><div class="value">' + escapeHtml(formatNumber(entryCount)) + '</div></div>',
            '<div class="card"><h3>Categories</h3><div class="value">' + escapeHtml(formatNumber(Object.keys(categoryCount).length)) + '</div></div>',
            '<div class="card"><h3>Newest</h3><div class="value financials-summary-text">' + escapeHtml(formatTimestamp(latestTimestamp)) + '</div></div>',
            '<div class="card"><h3>Oldest</h3><div class="value financials-summary-text">' + escapeHtml(formatTimestamp(oldestTimestamp)) + '</div></div>'
        ].join('');
    }

    function renderPagination(totalPages) {
        var paginationNode = document.getElementById('financials-pagination');
        var statusNode = document.getElementById('financials-status');
        if (!paginationNode) {
            return;
        }

        var currentPage = state.currentPage;
        var startPage = Math.max(1, currentPage - 2);
        var endPage = Math.min(totalPages, startPage + 4);
        startPage = Math.max(1, endPage - 4);

        if (statusNode) {
            statusNode.textContent = state.entries.length ? ('Loaded ' + state.entries.length + ' entries') : 'No logs found';
        }

        var buttons = [];
        buttons.push('<button type="button" class="financials-page-button" data-page="' + (currentPage - 1) + '"' + (currentPage === 1 ? ' disabled' : '') + '>Prev</button>');

        for (var page = startPage; page <= endPage; page += 1) {
            buttons.push(
                '<button type="button" class="financials-page-button' + (page === currentPage ? ' is-active' : '') + '" data-page="' + page + '">' + page + '</button>'
            );
        }

        buttons.push('<button type="button" class="financials-page-button" data-page="' + (currentPage + 1) + '"' + (currentPage === totalPages ? ' disabled' : '') + '>Next</button>');

        paginationNode.innerHTML = [
            '<div class="financials-pagination-info">Page ' + currentPage + ' of ' + totalPages + '</div>',
            '<div class="financials-pagination-buttons">' + buttons.join('') + '</div>'
        ].join('');
    }

    function renderTable() {
        var tableWrap = document.getElementById('financials-table-wrap');
        if (!tableWrap) {
            return;
        }

        var totalPages = Math.max(1, Math.ceil(state.entries.length / PAGE_SIZE));
        state.currentPage = Math.min(Math.max(state.currentPage, 1), totalPages);

        var startIndex = (state.currentPage - 1) * PAGE_SIZE;
        var visibleEntries = state.entries.slice(startIndex, startIndex + PAGE_SIZE);

        tableWrap.innerHTML = [
            '<div class="financials-table-meta">Showing ' +
                escapeHtml(formatNumber(visibleEntries.length)) +
                ' of ' +
                escapeHtml(formatNumber(state.entries.length)) +
                ' entries</div>',
            '<div class="financials-table-scroll">',
                '<table class="financials-table">',
                    '<thead>',
                        '<tr>',
                            '<th>Timestamp</th>',
                            '<th>Event</th>',
                            '<th>Category</th>',
                            '<th>Counterparty</th>',
                            '<th>Money</th>',
                        '</tr>',
                    '</thead>',
                    '<tbody>',
                        visibleEntries.map(buildRow).join(''),
                    '</tbody>',
                '</table>',
            '</div>'
        ].join('');

        renderPagination(totalPages);
    }

    async function fetchJson(url) {
        try {
            var response = await fetch(url);
            var data = await response.json();

            if (!response.ok) {
                return {
                    ok: false,
                    error: data && data.error ? data.error : 'HTTP ' + response.status,
                    data: data
                };
            }

            if (data && data.error) {
                return {
                    ok: false,
                    error: data.error.error || 'API error',
                    data: data
                };
            }

            return {
                ok: true,
                data: data
            };
        } catch (error) {
            return {
                ok: false,
                error: 'Network error while loading data.'
            };
        }
    }

    function extractEntries(payload) {
        if (!payload || !payload.data || !Array.isArray(payload.data.log)) {
            return [];
        }

        return payload.data.log;
    }

    function getNextUrl(payload) {
        if (!payload || !payload.data || !payload.data._metadata || !payload.data._metadata.links) {
            return null;
        }

        return payload.data._metadata.links.next || null;
    }

    async function loadLogs(apiKey) {
        var entries = [];
        var nextUrl = buildApiUrl(LOGS_API_URL, apiKey);

        while (nextUrl) {
            var payload = await fetchJson(nextUrl);
            if (!payload.ok) {
                return payload;
            }

            entries = entries.concat(extractEntries(payload));
            nextUrl = getNextUrl(payload);

            if (nextUrl) {
                nextUrl = normalizeLogsUrl(nextUrl, apiKey);
            }
        }

        return {
            ok: true,
            data: entries
        };
    }

    function extractNetworth(payload) {
        if (!payload || !payload.data || !payload.data.networth || !isPlainObject(payload.data.networth)) {
            return null;
        }

        return payload.data.networth;
    }

    async function loadNetworth(apiKey) {
        var payload = await fetchJson(buildApiUrl(NETWORTH_API_URL, apiKey));
        if (!payload.ok) {
            return payload;
        }

        var networth = extractNetworth(payload);
        if (!networth) {
            return {
                ok: false,
                error: 'Networth payload missing.'
            };
        }

        return {
            ok: true,
            data: networth
        };
    }

    async function initializeFinancials() {
        var statusNode = document.getElementById('financials-status');
        if (statusNode) {
            statusNode.textContent = 'Loading financial data...';
        }

        var apiKey = getApiKey();
        if (!apiKey) {
            state.entries = [];
            renderNetworth({
                ok: false,
                error: 'Add your API key in Settings to load networth.'
            });
            renderSummary();
            renderTable();

            if (statusNode) {
                statusNode.textContent = 'Add your API key in Settings to load financial logs.';
            }

            return;
        }

        var results = await Promise.all([
            loadNetworth(apiKey),
            loadLogs(apiKey)
        ]);
        var networthResult = results[0];
        var logsResult = results[1];

        renderNetworth(networthResult);

        if (!logsResult.ok) {
            state.entries = [];
            renderSummary();
            renderTable();

            if (statusNode) {
                statusNode.textContent = logsResult.error || 'Failed to load logs';
            }

            return;
        }

        state.entries = logsResult.data || [];
        state.currentPage = 1;

        renderSummary();
        renderTable();

        var paginationNode = document.getElementById('financials-pagination');
        if (paginationNode) {
            paginationNode.addEventListener('click', function(event){
                var button = event.target.closest('button[data-page]');
                if (!button || button.disabled) {
                    return;
                }

                var page = Number(button.getAttribute('data-page'));
                if (!Number.isFinite(page)) {
                    return;
                }

                var totalPages = Math.max(1, Math.ceil(state.entries.length / PAGE_SIZE));
                state.currentPage = Math.min(Math.max(page, 1), totalPages);
                renderTable();
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        }

        if (statusNode && !state.entries.length) {
            statusNode.textContent = 'No logs found';
        }
    }

    document.addEventListener('DOMContentLoaded', initializeFinancials);
})();