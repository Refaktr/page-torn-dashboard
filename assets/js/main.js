(function(){
    var API_CALL_LIMIT = 100;
    var API_CALL_WINDOW_MS = 65000;
    var API_CALL_STORAGE_KEY = 'tornApiCallTimestamps';

    function setActiveNavLink() {
        var path = window.location.pathname.toLowerCase();
        var links = document.querySelectorAll('.sidebar a');

        links.forEach(function(link){
            var href = link.getAttribute('href');
            if (!href) {
                return;
            }

            var normalizedHref = href.replace('./', '').toLowerCase();
            if (
                path.endsWith(normalizedHref) ||
                (path.endsWith('/') && normalizedHref === 'index.html')
            ) {
                link.classList.add('is-active');
            }
        });
    }

    function initializeSidebarToggle() {
        var sidebar = document.querySelector('.sidebar');
        if (!sidebar || sidebar.querySelector('.sidebar-toggle')) {
            return;
        }

        var title = sidebar.querySelector('h2');
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Menu';

        if (title) {
            title.insertAdjacentElement('afterend', toggle);
        } else {
            sidebar.insertBefore(toggle, sidebar.firstChild);
        }

        toggle.addEventListener('click', function(){
            var isOpen = sidebar.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        sidebar.querySelectorAll('a').forEach(function(link){
            link.addEventListener('click', function(){
                sidebar.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function loadCallTimestamps() {
        try {
            var raw = localStorage.getItem(API_CALL_STORAGE_KEY);
            var parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.filter(function(ts){
                return typeof ts === 'number' && Number.isFinite(ts);
            });
        } catch (error) {
            return [];
        }
    }

    function saveCallTimestamps(timestamps) {
        try {
            localStorage.setItem(API_CALL_STORAGE_KEY, JSON.stringify(timestamps));
        } catch (error) {
            return;
        }
    }

    function pruneCallTimestamps(timestamps) {
        var now = Date.now();
        return timestamps.filter(function(ts){
            return now - ts < API_CALL_WINDOW_MS;
        });
    }

    function formatDuration(ms) {
        var totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        var hours = Math.floor(totalSeconds / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        return [hours, minutes, seconds].map(function(value){
            return String(value).padStart(2, '0');
        }).join(':');
    }

    function createApiTicker() {
        var existing = document.getElementById('api-call-ticker');
        if (existing) {
            return existing;
        }

        var ticker = document.createElement('aside');
        ticker.id = 'api-call-ticker';
        ticker.className = 'api-call-ticker';
        ticker.innerHTML = [
            '<div class="api-call-ticker-title">Torn API</div>',
            '<div class="api-call-ticker-count"><span id="api-call-count">0</span> / ' + API_CALL_LIMIT + ' calls</div>',
            '<div class="api-call-ticker-window">Window: ' + formatDuration(API_CALL_WINDOW_MS) + '</div>',
            '<div class="api-call-ticker-reset">Next expiry: <span id="api-call-next-expiry">00:00:00</span></div>'
        ].join('');

        var sidebar = document.querySelector('.sidebar');
        var sidebarTitle = sidebar ? sidebar.querySelector('h2') : null;

        if (sidebar && sidebarTitle) {
            sidebar.insertBefore(ticker, sidebarTitle.nextSibling);
        } else if (sidebar) {
            sidebar.insertBefore(ticker, sidebar.firstChild);
        } else {
            document.body.appendChild(ticker);
        }

        return ticker;
    }

    function refreshApiTicker() {
        createApiTicker();

        var countNode = document.getElementById('api-call-count');
        var expiryNode = document.getElementById('api-call-next-expiry');
        if (!countNode || !expiryNode) {
            return;
        }

        var timestamps = pruneCallTimestamps(loadCallTimestamps());
        saveCallTimestamps(timestamps);

        countNode.textContent = String(timestamps.length);
        if (!timestamps.length) {
            expiryNode.textContent = '00:00:00';
            return;
        }

        var elapsedForOldest = Date.now() - timestamps[0];
        var msUntilOldestExpires = API_CALL_WINDOW_MS - elapsedForOldest;
        expiryNode.textContent = formatDuration(msUntilOldestExpires);
    }

    function extractUrlFromFetchInput(input) {
        if (typeof input === 'string') {
            return input;
        }

        if (input && typeof input.url === 'string') {
            return input.url;
        }

        return '';
    }

    function isTornApiUrl(urlText) {
        try {
            var resolved = new URL(urlText, window.location.href);
            return resolved.hostname === 'api.torn.com';
        } catch (error) {
            return false;
        }
    }

    function recordApiCall() {
        var timestamps = pruneCallTimestamps(loadCallTimestamps());
        timestamps.push(Date.now());
        saveCallTimestamps(timestamps);
        refreshApiTicker();
    }

    function installApiCallTracker() {
        if (!window.fetch || window.__tornApiTrackerInstalled) {
            return;
        }

        var originalFetch = window.fetch.bind(window);
        window.fetch = function(input, init) {
            var url = extractUrlFromFetchInput(input);
            if (isTornApiUrl(url)) {
                recordApiCall();
            }

            return originalFetch(input, init);
        };

        window.__tornApiTrackerInstalled = true;
    }

    function initializeApiTicker() {
        refreshApiTicker();
        installApiCallTracker();

        window.setInterval(function(){
            refreshApiTicker();
        }, 1000);
    }

    setActiveNavLink();
    initializeSidebarToggle();
    initializeApiTicker();
})();

