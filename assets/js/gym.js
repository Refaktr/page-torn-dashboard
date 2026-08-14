(function(){
    var STORAGE_KEY = 'tornApiKey';
    var LOG_IDS = [5300, 5301, 5302, 5303];

    var STAT_META = {
        5300: { label: 'Strength', afterKey: 'strength_after', color: '#ff6b6b' },
        5301: { label: 'Defense', afterKey: 'defense_after', color: '#6bc2ff' },
        5302: { label: 'Speed', afterKey: 'speed_after', color: '#ffd166' },
        5303: { label: 'Dexterity', afterKey: 'dexterity_after', color: '#7ee081' }
    };

    var state = {
        chart: null,
        rawEntries: [],
        datasets: [],
        earliestTimestampMs: null,
        latestTimestampMs: null
    };

    function getApiKey() {
        var sessionApiKey = sessionStorage.getItem(STORAGE_KEY);
        if (sessionApiKey) {
            return sessionApiKey;
        }

        var storedApiKey = localStorage.getItem(STORAGE_KEY);
        return storedApiKey ? storedApiKey : '';
    }

    function setStatus(message, isError) {
        var node = document.getElementById('gym-status-text');
        var card = document.getElementById('gym-summary-card');
        if (!node) {
            return;
        }

        node.textContent = message;
        node.style.color = isError ? 'var(--bad)' : 'var(--muted)';

        if (card) {
            card.style.borderColor = isError ? 'rgba(231, 76, 60, 0.45)' : 'var(--panel-border)';
        }
    }

    function setText(id, value) {
        var node = document.getElementById(id);
        if (node) {
            node.textContent = String(value);
        }
    }

    function formatDate(value) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toISOString().slice(0, 10);
    }

    function normalizeLogEntries(payload) {
        if (!payload || !payload.log) {
            return [];
        }

        if (Array.isArray(payload.log)) {
            return payload.log;
        }

        if (typeof payload.log === 'object') {
            return Object.keys(payload.log).map(function(key){
                return payload.log[key];
            });
        }

        return [];
    }

    function buildDatasets(entries) {
        var byCategory = {
            5300: [],
            5301: [],
            5302: [],
            5303: []
        };

        entries.forEach(function(entry){
            var details = entry && entry.details ? entry.details : null;
            var data = entry && entry.data ? entry.data : null;
            if (!details || !data) {
                return;
            }

            var categoryId = details.id;
            if (!STAT_META[categoryId]) {
                return;
            }

            byCategory[categoryId].push(entry);
        });

        return LOG_IDS.map(function(categoryId){
            var meta = STAT_META[categoryId];
            var rows = byCategory[categoryId].slice().sort(function(a, b){
                return (a.timestamp || 0) - (b.timestamp || 0);
            });

            var latestByDate = {};
            rows.forEach(function(entry){
                var ts = entry.timestamp;
                var value = entry.data ? entry.data[meta.afterKey] : null;
                if (!ts || value == null) {
                    return;
                }

                var day = formatDate(ts * 1000);
                if (!day) {
                    return;
                }

                latestByDate[day] = Number(value);
            });

            var points = Object.keys(latestByDate).sort().map(function(day){
                return {
                    x: day,
                    y: latestByDate[day]
                };
            });

            return {
                key: String(categoryId),
                label: meta.label,
                color: meta.color,
                points: points,
                hidden: false
            };
        });
    }

    function getLatestPoint(points) {
        if (!points.length) {
            return null;
        }
        return points[points.length - 1];
    }

    function updateVisiblePointsCount() {
        if (!state.chart) {
            setText('gym-visible-points', 0);
            return;
        }

        var xScale = state.chart.scales && state.chart.scales.x ? state.chart.scales.x : null;
        var minBound = xScale && Number.isFinite(xScale.min) ? xScale.min : null;
        var maxBound = xScale && Number.isFinite(xScale.max) ? xScale.max : null;

        var visible = state.chart.data.datasets.filter(function(ds){
            return !ds.hidden;
        });

        var total = visible.reduce(function(sum, ds){
            var inRange = ds.data.filter(function(point){
                var pointMs = new Date(point.x).getTime();
                if (!Number.isFinite(pointMs)) {
                    return false;
                }

                if (minBound !== null && pointMs < minBound) {
                    return false;
                }

                if (maxBound !== null && pointMs > maxBound) {
                    return false;
                }

                return true;
            });

            return sum + inRange.length;
        }, 0);

        setText('gym-visible-points', total);
    }

    function sliderCutoffDate() {
        var slider = document.getElementById('gym-range-slider');
        if (!slider) {
            return null;
        }

        var days = Number(slider.value);
        if (!Number.isFinite(days) || days <= 0) {
            return null;
        }

        var anchorMs = Number.isFinite(state.latestTimestampMs) ? state.latestTimestampMs : Date.now();
        var cutoff = new Date(anchorMs);
        cutoff.setDate(cutoff.getDate() - days);
        return cutoff;
    }

    function getChartDatasets() {
        return state.datasets.map(function(ds){
            return {
                label: ds.label,
                data: ds.points,
                borderColor: ds.color,
                backgroundColor: ds.color,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0.16,
                hidden: ds.hidden
            };
        });
    }

    function applyRangeFilter() {
        if (!state.chart) {
            return;
        }

        var slider = document.getElementById('gym-range-slider');
        var cutoff = sliderCutoffDate();
        var daysValue = slider ? Number(slider.value) : 365;
        var maxMs = Number.isFinite(state.latestTimestampMs) ? state.latestTimestampMs : Date.now();
        var minMs = cutoff ? cutoff.getTime() : null;

        state.chart.options.scales.x.max = maxMs;

        if (Number.isFinite(state.earliestTimestampMs) && Number.isFinite(minMs)) {
            state.chart.options.scales.x.min = Math.max(minMs, state.earliestTimestampMs);
        } else {
            state.chart.options.scales.x.min = minMs;
        }

        if (Number.isFinite(state.earliestTimestampMs) && Number.isFinite(state.latestTimestampMs)) {
            var spanDays = Math.ceil((state.latestTimestampMs - state.earliestTimestampMs) / 86400000);
            if (Number.isFinite(daysValue) && daysValue >= spanDays) {
                state.chart.options.scales.x.min = state.earliestTimestampMs;
            }
        }

        state.chart.data.datasets = getChartDatasets();

        setText('gym-range-label', (Number.isFinite(daysValue) ? daysValue : 365) + ' days');
        state.chart.update();
        updateVisiblePointsCount();
    }

    function createToggle(meta) {
        var wrap = document.createElement('label');
        wrap.className = 'gym-series-toggle';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !meta.hidden;
        checkbox.dataset.seriesKey = meta.key;

        var chip = document.createElement('span');
        chip.className = 'gym-color-chip';
        chip.style.backgroundColor = meta.color;

        var text = document.createElement('span');
        var latest = getLatestPoint(meta.points);
        if (latest && Number.isFinite(latest.y)) {
            text.textContent = meta.label + ' (' + Math.round(latest.y).toLocaleString() + ')';
        } else {
            text.textContent = meta.label;
        }

        wrap.appendChild(checkbox);
        wrap.appendChild(chip);
        wrap.appendChild(text);
        return wrap;
    }

    function renderSeriesToggles() {
        var root = document.getElementById('gym-series-toggles');
        if (!root) {
            return;
        }

        root.innerHTML = '';
        state.datasets.forEach(function(ds){
            root.appendChild(createToggle(ds));
        });

        root.addEventListener('change', function(event){
            var target = event.target;
            if (!target || target.type !== 'checkbox') {
                return;
            }

            var key = target.dataset.seriesKey;
            state.datasets = state.datasets.map(function(ds){
                if (ds.key !== key) {
                    return ds;
                }

                return {
                    key: ds.key,
                    label: ds.label,
                    color: ds.color,
                    points: ds.points,
                    hidden: !target.checked
                };
            });

            applyRangeFilter();
        });
    }

    function makeChart() {
        var canvas = document.getElementById('gym-stat-chart');
        if (!canvas || typeof Chart === 'undefined') {
            setStatus('Chart library did not load. Check internet access and retry.', true);
            return;
        }

        var ctx = canvas.getContext('2d');
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month'
                        },
                        min: Number.isFinite(state.earliestTimestampMs) ? state.earliestTimestampMs : undefined,
                        max: Number.isFinite(state.latestTimestampMs) ? state.latestTimestampMs : undefined,
                        ticks: {
                            color: '#9fb0bf'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.06)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#9fb0bf',
                            callback: function(value){
                                return Number(value).toLocaleString();
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.06)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context){
                                var value = context.parsed && Number.isFinite(context.parsed.y)
                                    ? context.parsed.y.toLocaleString()
                                    : '0';
                                return context.dataset.label + ': ' + value;
                            }
                        }
                    },
                    zoom: {
                        limits: {
                            x: {
                                min: 'original',
                                max: 'original',
                                minRange: 7 * 24 * 60 * 60 * 1000
                            }
                        },
                        pan: {
                            enabled: true,
                            mode: 'x'
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.03
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x'
                        }
                    }
                }
            }
        });

        applyRangeFilter();
    }

    function bindControls() {
        var slider = document.getElementById('gym-range-slider');
        if (slider) {
            slider.addEventListener('input', applyRangeFilter);
        }

        var resetZoomButton = document.getElementById('gym-reset-zoom');
        if (resetZoomButton) {
            resetZoomButton.addEventListener('click', function(){
                if (state.chart) {
                    state.chart.resetZoom();
                    applyRangeFilter();
                }
            });
        }

        var showFullRangeButton = document.getElementById('gym-show-all-range');
        if (showFullRangeButton) {
            showFullRangeButton.addEventListener('click', function(){
                if (slider) {
                    slider.value = slider.max;
                }
                applyRangeFilter();
            });
        }
    }

    function buildApiUrlWithCursor(apiKey, beforeTimestamp) {
        var logQuery = LOG_IDS.join('%2C');
        var url = 'https://api.torn.com/v2/user/log?log=' + logQuery + '&limit=100&key=' + encodeURIComponent(apiKey);
        if (Number.isFinite(beforeTimestamp) && beforeTimestamp > 0) {
            url += '&to=' + Math.floor(beforeTimestamp);
        }
        return url;
    }

    function entryUniqueKey(entry) {
        var detailsId = entry && entry.details && entry.details.id ? entry.details.id : 'x';
        var timestamp = entry && entry.timestamp ? entry.timestamp : 'x';
        var dataString = '';
        try {
            dataString = JSON.stringify(entry && entry.data ? entry.data : {});
        } catch (error) {
            dataString = '';
        }

        return String(timestamp) + '|' + String(detailsId) + '|' + dataString;
    }

    async function fetchAllGymLogs(apiKey) {
        var allEntries = [];
        var seen = Object.create(null);
        var beforeTimestamp = null;
        var previousOldest = null;
        var maxPages = 30;

        for (var page = 1; page <= maxPages; page += 1) {
            var response = await fetch(buildApiUrlWithCursor(apiKey, beforeTimestamp));
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            var payload = await response.json();
            if (payload && payload.error) {
                throw new Error(payload.error.error || 'Torn API returned an error');
            }

            var pageEntries = normalizeLogEntries(payload).filter(function(entry){
                return entry && entry.data && entry.details;
            });

            if (!pageEntries.length) {
                break;
            }

            var oldestTimestamp = null;
            pageEntries.forEach(function(entry){
                var key = entryUniqueKey(entry);
                if (!seen[key]) {
                    seen[key] = true;
                    allEntries.push(entry);
                }

                if (typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)) {
                    if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
                        oldestTimestamp = entry.timestamp;
                    }
                }
            });

            if (!Number.isFinite(oldestTimestamp)) {
                break;
            }

            if (previousOldest !== null && oldestTimestamp >= previousOldest) {
                break;
            }

            previousOldest = oldestTimestamp;
            beforeTimestamp = oldestTimestamp - 1;

            if (beforeTimestamp <= 0) {
                break;
            }

            if (page === maxPages) {
                setStatus('Loaded partial history (pagination cap reached).', false);
            }
        }

        return allEntries;
    }

    function configureSliderFromData() {
        var slider = document.getElementById('gym-range-slider');
        if (!slider) {
            return;
        }

        var fallbackDays = 365;
        if (!Number.isFinite(state.earliestTimestampMs) || !Number.isFinite(state.latestTimestampMs)) {
            slider.min = '30';
            slider.max = '3650';
            slider.step = '30';
            slider.value = String(fallbackDays);
            return;
        }

        var spanDays = Math.max(30, Math.ceil((state.latestTimestampMs - state.earliestTimestampMs) / 86400000));
        var maxDays = Math.max(365, Math.ceil(spanDays / 30) * 30);
        var defaultDays = Math.min(fallbackDays, maxDays);

        slider.min = '30';
        slider.max = String(maxDays);
        slider.step = '30';
        slider.value = String(defaultDays);
    }

    function fetchGymLogs() {
        var apiKey = getApiKey();
        if (!apiKey) {
            setStatus('API key is not set. Go to Settings to add your Torn API key.', true);
            return;
        }

        fetchAllGymLogs(apiKey)
            .then(function(allEntries){
                state.rawEntries = allEntries;

                state.datasets = buildDatasets(state.rawEntries);
                setText('gym-total-entries', state.rawEntries.length.toLocaleString());

                var allPoints = state.datasets.reduce(function(list, ds){
                    return list.concat(ds.points.map(function(point){
                        return new Date(point.x).getTime();
                    }));
                }, []).filter(function(ts){
                    return Number.isFinite(ts);
                });

                state.earliestTimestampMs = allPoints.length ? Math.min.apply(null, allPoints) : null;
                state.latestTimestampMs = allPoints.length ? Math.max.apply(null, allPoints) : null;

                configureSliderFromData();

                var pointsCount = state.datasets.reduce(function(sum, ds){
                    return sum + ds.points.length;
                }, 0);

                if (!pointsCount) {
                    setStatus('No gym stat log entries were found for the selected categories.', true);
                    renderSeriesToggles();
                    makeChart();
                    return;
                }

                setStatus('Loaded ' + pointsCount.toLocaleString() + ' points across ' + state.datasets.length + ' stat lines.', false);
                renderSeriesToggles();
                makeChart();
            })
            .catch(function(error){
                setStatus('Failed to load gym stat logs: ' + error.message, true);
            });
    }

    bindControls();
    fetchGymLogs();
})();
