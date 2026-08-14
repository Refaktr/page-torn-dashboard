(function(){
    var STORAGE_KEY = 'tornApiKey';
    var LOG_IDS = [5300, 5301, 5302, 5303];
    var GYM_LOG_LIMIT = 100;
    var SPECIALTY_GYMS = [
        {
            name: 'Balboas Gym',
            requirementText: "Cha Cha's Unlocked; Defense + Dexterity 25% higher than Strength + Speed."
        },
        {
            name: 'Frontline Fitness',
            requirementText: "Cha Cha's Unlocked; Strength + Speed 25% higher than Dexterity + Defense."
        },
        {
            name: 'Gym 3000',
            requirementText: "George's unlocked; Strength 25% higher than your second highest stat."
        },
        {
            name: 'Mr. Isoyamas',
            requirementText: "George's unlocked; Defense 25% higher than your second highest stat."
        },
        {
            name: 'Total Rebound',
            requirementText: "George's unlocked; Speed 25% higher than your second highest stat."
        },
        {
            name: 'Elites',
            requirementText: "George's unlocked; Dexterity 25% higher than your second highest stat."
        }
    ];

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
        latestTimestampMs: null,
        latestStats: null
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

    function setSpecialtyStatus(message, isError) {
        var node = document.getElementById('gym-specialty-status');
        if (!node) {
            return;
        }

        node.textContent = message;
        node.style.color = isError ? 'var(--bad)' : 'var(--muted)';
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

    function getStatsFromLatestDatasets() {
        var stats = {
            strength: 0,
            defense: 0,
            speed: 0,
            dexterity: 0
        };

        state.datasets.forEach(function(ds){
            var latest = getLatestPoint(ds.points);
            if (!latest || !Number.isFinite(latest.y)) {
                return;
            }

            if (ds.label === 'Strength') {
                stats.strength = latest.y;
            }

            if (ds.label === 'Defense') {
                stats.defense = latest.y;
            }

            if (ds.label === 'Speed') {
                stats.speed = latest.y;
            }

            if (ds.label === 'Dexterity') {
                stats.dexterity = latest.y;
            }
        });

        return stats;
    }

    function extractBattleStats(payload) {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        var candidates = [
            payload.battlestats,
            payload.battle_stats,
            payload.stats,
            payload.userstats
        ];

        for (var i = 0; i < candidates.length; i += 1) {
            var candidate = candidates[i];
            if (!candidate || typeof candidate !== 'object') {
                continue;
            }

            var strength = Number(candidate.strength);
            var defense = Number(candidate.defense);
            var speed = Number(candidate.speed);
            var dexterity = Number(candidate.dexterity);

            if ([strength, defense, speed, dexterity].every(Number.isFinite)) {
                return {
                    strength: strength,
                    defense: defense,
                    speed: speed,
                    dexterity: dexterity
                };
            }
        }

        return null;
    }

    function fetchLiveBattleStats(apiKey) {
        var urls = [
            'https://api.torn.com/v2/user/battlestats?key=' + encodeURIComponent(apiKey),
            'https://api.torn.com/user/?selections=battlestats&key=' + encodeURIComponent(apiKey)
        ];

        return urls.reduce(function(chain, url){
            return chain.then(function(found){
                if (found) {
                    return found;
                }

                console.log('API endpoint:', url);
                return fetch(url)
                    .then(function(response){
                        if (!response.ok) {
                            return null;
                        }
                        return response.json();
                    })
                    .then(function(payload){
                        if (!payload || payload.error) {
                            return null;
                        }

                        return extractBattleStats(payload);
                    })
                    .catch(function(){
                        return null;
                    });
            });
        }, Promise.resolve(null));
    }

    function ratioCheckTwoSide(stats, leftA, leftB, rightA, rightB, factor) {
        var left = stats[leftA] + stats[leftB];
        var right = factor * (stats[rightA] + stats[rightB]);
        var ratio = right > 0 ? left / right : (left > 0 ? 1 : 0);
        return {
            pass: left >= right,
            progress: ratio,
            details: Math.round(left).toLocaleString() + ' / ' + Math.round(right).toLocaleString()
        };
    }

    function ratioCheckSingleVsSecondHighest(stats, key, factor) {
        var all = ['strength', 'defense', 'speed', 'dexterity'];
        var others = all.filter(function(name){
            return name !== key;
        }).map(function(name){
            return stats[name];
        });

        var secondHighestProxy = Math.max.apply(null, others);
        var needed = factor * secondHighestProxy;
        var have = stats[key];
        var ratio = needed > 0 ? have / needed : (have > 0 ? 1 : 0);

        return {
            pass: have >= needed,
            progress: ratio,
            details: Math.round(have).toLocaleString() + ' / ' + Math.round(needed).toLocaleString()
        };
    }

    function evaluateSpecialtyGym(gym, stats) {
        var text = gym.requirementText.toLowerCase();

        if (text.indexOf('defense + dexterity 25% higher than strength + speed') !== -1) {
            var balboas = ratioCheckTwoSide(stats, 'defense', 'dexterity', 'strength', 'speed', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: balboas.pass,
                progress: balboas.progress,
                hint: 'Need (Defense + Dexterity) >= 1.25 x (Strength + Speed). Currently: ' + balboas.details
            };
        }

        if (text.indexOf('strength + speed 25% higher than dexterity + defense') !== -1) {
            var frontline = ratioCheckTwoSide(stats, 'strength', 'speed', 'dexterity', 'defense', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: frontline.pass,
                progress: frontline.progress,
                hint: 'Need (Strength + Speed) >= 1.25 x (Dexterity + Defense). Currently: ' + frontline.details
            };
        }

        if (text.indexOf('strength 25% higher than your second highest stat') !== -1) {
            var strCheck = ratioCheckSingleVsSecondHighest(stats, 'strength', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: strCheck.pass,
                progress: strCheck.progress,
                hint: 'Need Strength >= 1.25 x next highest stat. Currently: ' + strCheck.details
            };
        }

        if (text.indexOf('defense 25% higher than your second highest stat') !== -1) {
            var defCheck = ratioCheckSingleVsSecondHighest(stats, 'defense', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: defCheck.pass,
                progress: defCheck.progress,
                hint: 'Need Defense >= 1.25 x next highest stat. Currently: ' + defCheck.details
            };
        }

        if (text.indexOf('speed 25% higher than your second highest stat') !== -1) {
            var speedCheck = ratioCheckSingleVsSecondHighest(stats, 'speed', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: speedCheck.pass,
                progress: speedCheck.progress,
                hint: 'Need Speed >= 1.25 x next highest stat. Currently: ' + speedCheck.details
            };
        }

        if (text.indexOf('dexterity 25% higher than your second highest stat') !== -1) {
            var dexCheck = ratioCheckSingleVsSecondHighest(stats, 'dexterity', 1.25);
            return {
                gymName: gym.name,
                requirementText: gym.requirementText,
                pass: dexCheck.pass,
                progress: dexCheck.progress,
                hint: 'Need Dexterity >= 1.25 x next highest stat. Currently: ' + dexCheck.details
            };
        }

        return null;
    }

    function renderSpecialtyAdvisor(evaluations, stats) {
        var summaryNode = document.getElementById('gym-specialty-summary');
        var listNode = document.getElementById('gym-specialty-list');
        if (!summaryNode || !listNode) {
            return;
        }

        var ratioGyms = evaluations.filter(Boolean);
        if (!ratioGyms.length) {
            summaryNode.innerHTML = '<strong>No ratio rules found</strong><div>Check text formatting in assets/text/specialty_gyms.txt.</div>';
            listNode.innerHTML = '';
            return;
        }

        var bestTarget = ratioGyms.slice().sort(function(a, b){
            return (b.progress || 0) - (a.progress || 0);
        })[0];

        var recommendation = bestTarget
            ? (bestTarget.pass
                ? 'You currently meet the ratio for ' + bestTarget.gymName + '.'
                : 'Closest ratio target: ' + bestTarget.gymName + '.')
            : 'No recommendation available yet.';

        summaryNode.innerHTML = [
            '<strong>Recommendation</strong>',
            '<div>' + recommendation + '</div>',
            '<div>Strength: ' + Math.round(stats.strength).toLocaleString() +
            ' | Defense: ' + Math.round(stats.defense).toLocaleString() +
            ' | Speed: ' + Math.round(stats.speed).toLocaleString() +
            ' | Dexterity: ' + Math.round(stats.dexterity).toLocaleString() + '</div>'
        ].join('');

        listNode.innerHTML = ratioGyms.map(function(item){
            var badgeClass = item.pass ? 'is-ready' : 'is-progress';
            var badgeText = item.pass ? 'Ready' : 'In Progress';
            return [
                '<section class="gym-specialty-item">',
                '<div class="gym-specialty-head">',
                '<span class="gym-specialty-title">' + item.gymName + '</span>',
                '<span class="gym-specialty-badge ' + badgeClass + '">' + badgeText + '</span>',
                '</div>',
                '<div class="gym-specialty-content">',
                '<p>' + item.hint + '</p>',
                '</div>',
                '</section>'
            ].join('');
        }).join('');
    }

    function loadSpecialtyAdvisor(apiKey) {
        setSpecialtyStatus('Loading specialty gym ratios...', false);

        fetchLiveBattleStats(apiKey)
            .then(function(liveStats){
                var fallbackStats = getStatsFromLatestDatasets();
                state.latestStats = liveStats || fallbackStats;

                var statValues = state.latestStats;
                if (!statValues || !Number.isFinite(statValues.strength) || !Number.isFinite(statValues.defense) || !Number.isFinite(statValues.speed) || !Number.isFinite(statValues.dexterity)) {
                    setSpecialtyStatus('Could not determine current stats for ratio comparison.', true);
                    return;
                }

                var evaluations = SPECIALTY_GYMS.map(function(gym){
                    return evaluateSpecialtyGym(gym, statValues);
                }).filter(Boolean);

                renderSpecialtyAdvisor(evaluations, statValues);

                if (liveStats) {
                    setSpecialtyStatus('Specialty ratios loaded (hardcoded) and compared against live battlestats.', false);
                } else {
                    setSpecialtyStatus('Specialty ratios loaded (hardcoded). Comparison uses latest log-derived stats.', false);
                }
            })
            .catch(function(error){
                setSpecialtyStatus('Failed to load specialty ratio data: ' + error.message, true);
            });
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

    function buildGymLogsApiUrl(apiKey, beforeTimestamp) {
        var logQuery = LOG_IDS.join('%2C');
        var url = 'https://api.torn.com/v2/user/log?log=' + logQuery + '&limit=' + GYM_LOG_LIMIT + '&key=' + encodeURIComponent(apiKey);
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
            var logsUrl = buildGymLogsApiUrl(apiKey, beforeTimestamp);
            console.log('API endpoint:', logsUrl);
            var response = await fetch(logsUrl);
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
                loadSpecialtyAdvisor(apiKey);
            })
            .catch(function(error){
                setStatus('Failed to load gym stat logs: ' + error.message, true);
                loadSpecialtyAdvisor(apiKey);
            });
    }

    bindControls();
    fetchGymLogs();
})();
