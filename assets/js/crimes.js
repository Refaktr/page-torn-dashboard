// Crimes page: fetch crime IDs 1-6 sequentially and render summary + details.
(function(){
	var MAX_CRIME_ID = 6;
	var MIN_CRIME_ID = 1;
	var TOTAL_CRIME_COUNT = (MAX_CRIME_ID - MIN_CRIME_ID) + 1;
	var CRIMES_JSON_BASES = [
		'../assets/json/Crimes/',
		'../assets/json/crimes/',
		'./assets/json/Crimes/',
		'/assets/json/Crimes/'
	];

	var crimeMetaById = {};
	var subcrimeMetaByCrimeId = {};
	var subcrimeMetaById = {};

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

	function getNumber(value) {
		return typeof value === 'number' ? value : 0;
	}

	function formatInt(value) {
		return getNumber(value).toLocaleString();
	}

	function formatPercent(success, total) {
		if (!total) {
			return '0%';
		}

		return ((success / total) * 100).toFixed(1) + '%';
	}

	function setStatus(text) {
		var statusNode = document.getElementById('crimes-status');
		if (statusNode) {
			statusNode.textContent = text;
		}
	}

	function setLoadedCount(count) {
		var loadedNode = document.getElementById('crimes-loaded-count');
		if (loadedNode) {
			loadedNode.textContent = count + ' / ' + TOTAL_CRIME_COUNT;
		}
	}

	function setRangeText() {
		var rangeNode = document.getElementById('crime-range-text');
		if (rangeNode) {
			rangeNode.textContent = MIN_CRIME_ID + '-' + MAX_CRIME_ID;
		}
	}

	function statBlock(label, value) {
		return (
			'<div class="crime-stat">' +
				'<span class="crime-stat-label">' + label + '</span>' +
				'<span class="crime-stat-value">' + value + '</span>' +
			'</div>'
		);
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function mapById(items) {
		return (items || []).reduce(function(map, item){
			if (item && typeof item.id === 'number') {
				map[item.id] = item;
			}

			return map;
		}, {});
	}

	async function fetchJson(url) {
		try {
			console.log('API endpoint:', url);
			var response = await fetch(url);
			if (!response.ok) {
				return null;
			}

			return await response.json();
		} catch (error) {
			return null;
		}
	}

	async function fetchJsonFromBases(fileName) {
		for (var i = 0; i < CRIMES_JSON_BASES.length; i += 1) {
			var base = CRIMES_JSON_BASES[i];
			var data = await fetchJson(base + fileName);
			if (data) {
				return data;
			}
		}

		return null;
	}

	async function loadCrimeMetadata() {
		var crimesData = await fetchJsonFromBases('crimes.json');
		if (crimesData && Array.isArray(crimesData.crimes)) {
			crimeMetaById = mapById(crimesData.crimes);
		} else {
			crimeMetaById = {};
		}

		var requests = [];
		for (var crimeId = MIN_CRIME_ID; crimeId <= MAX_CRIME_ID; crimeId += 1) {
			requests.push(fetchJsonFromBases('subcrimes-' + crimeId + '.json'));
		}

		var subcrimeFiles = await Promise.all(requests);
		subcrimeMetaByCrimeId = {};
		subcrimeMetaById = {};

		subcrimeFiles.forEach(function(fileData, index){
			var crimeId = MIN_CRIME_ID + index;
			var subcrimes = fileData && Array.isArray(fileData.subcrimes) ? fileData.subcrimes : [];
			var mapped = mapById(subcrimes);
			subcrimeMetaByCrimeId[crimeId] = mapped;

			Object.keys(mapped).forEach(function(subcrimeId){
				subcrimeMetaById[subcrimeId] = mapped[subcrimeId];
			});
		});

		return {
			crimeMapCount: Object.keys(crimeMetaById).length,
			subcrimeMapCount: Object.keys(subcrimeMetaById).length
		};
	}

	function extractCrimePayload(data) {
		if (!data || typeof data !== 'object') {
			return null;
		}

		if (data.crimes) {
			return data.crimes;
		}

		if (data.data && data.data.crimes) {
			return data.data.crimes;
		}

		return null;
	}

	async function requestCrimeData(url) {
		console.log('API endpoint:', url);
		var response = await fetch(url);
		var data = await response.json();

		if (!response.ok) {
			return {
				ok: false,
				error: data && data.error ? data.error : 'HTTP ' + response.status
			};
		}

		if (data && data.error) {
			return {
				ok: false,
				error: data.error.error || 'API error'
			};
		}

		return {
			ok: true,
			data: data
		};
	}

	function renderSummary(crimeEntries) {
		var summaryNode = document.getElementById('crimes-summary');
		if (!summaryNode) {
			return;
		}

		var totalAttempts = 0;
		var totalSuccess = 0;
		var totalFail = 0;
		var totalCriticalFail = 0;
		var totalNerveSpent = 0;
		var totalMoney = 0;
		var skillSum = 0;
		var skillCount = 0;

		crimeEntries.forEach(function(entry){
			if (!entry || entry.error || !entry.crimes) {
				return;
			}

			var crime = entry.crimes;
			var attempts = crime.attempts || {};
			totalAttempts += getNumber(attempts.total);
			totalSuccess += getNumber(attempts.success);
			totalFail += getNumber(attempts.fail);
			totalCriticalFail += getNumber(attempts.critical_fail);
			totalNerveSpent += getNumber(crime.nerve_spent);
			totalMoney += getNumber(crime.rewards && crime.rewards.money);

			if (typeof crime.skill === 'number') {
				skillSum += crime.skill;
				skillCount += 1;
			}
		});

		var avgSkill = skillCount ? (skillSum / skillCount).toFixed(1) : '0.0';

		summaryNode.innerHTML = [
			'<div class="card">',
			'<h3>Total Attempts</h3>',
			'<div class="value">' + formatInt(totalAttempts) + '</div>',
			'</div>',
			'<div class="card">',
			'<h3>Success Rate</h3>',
			'<div class="value">' + formatPercent(totalSuccess, totalAttempts) + '</div>',
			'</div>',
			'<div class="card">',
			'<h3>Nerve Spent</h3>',
			'<div class="value">' + formatInt(totalNerveSpent) + '</div>',
			'</div>',
			'<div class="card">',
			'<h3>Avg Skill</h3>',
			'<div class="value">' + avgSkill + '</div>',
			'</div>',
			'<div class="card">',
			'<h3>Total Money Rewards</h3>',
			'<div class="value">$' + formatInt(totalMoney) + '</div>',
			'</div>',
			'<div class="card">',
			'<h3>Critical Fails</h3>',
			'<div class="value">' + formatInt(totalCriticalFail) + '</div>',
			'</div>'
		].join('');
	}

	function renderSubcrimeTable(crimeId, subcrimes) {
		if (!Array.isArray(subcrimes) || !subcrimes.length) {
			return '<p class="subcrime-empty">No subcrimes found.</p>';
		}

		var crimeMap = subcrimeMetaByCrimeId[crimeId] || {};

		var rows = subcrimes.map(function(sub){
			var mapped = crimeMap[sub.id] || subcrimeMetaById[sub.id] || null;
			var subcrimeName = mapped && mapped.name ? mapped.name : 'Unknown';
			var nerveCost = mapped && typeof mapped.nerve_cost === 'number' ? mapped.nerve_cost : null;
			var subTotal = getNumber(sub.total);
			var subSuccess = getNumber(sub.success);
			var subFail = getNumber(sub.fail);
			var subRate = formatPercent(subSuccess, subTotal);

			return (
				'<tr>' +
					'<td>' + formatInt(sub.id) + '</td>' +
					'<td>' + escapeHtml(subcrimeName) + '</td>' +
					'<td>' + (nerveCost === null ? '-' : formatInt(nerveCost)) + '</td>' +
					'<td>' + formatInt(subTotal) + '</td>' +
					'<td>' + formatInt(subSuccess) + '</td>' +
					'<td>' + formatInt(subFail) + '</td>' +
					'<td>' + subRate + '</td>' +
				'</tr>'
			);
		}).join('');

		return (
			'<div class="subcrime-table-wrap">' +
				'<table class="subcrime-table">' +
					'<thead>' +
						'<tr>' +
							'<th>Subcrime ID</th>' +
							'<th>Name</th>' +
							'<th>Nerve</th>' +
							'<th>Total</th>' +
							'<th>Success</th>' +
							'<th>Fail</th>' +
							'<th>Rate</th>' +
						'</tr>' +
					'</thead>' +
					'<tbody>' + rows + '</tbody>' +
				'</table>' +
			'</div>'
		);
	}

	function renderCrimeCards(crimeEntries) {
		var listNode = document.getElementById('crimes-list');
		if (!listNode) {
			return;
		}

		listNode.innerHTML = '';

		crimeEntries.forEach(function(entry){
			var card = document.createElement('article');
			card.className = 'card crime-card';
			var crimeMeta = crimeMetaById[entry.id] || null;
			var crimeTitle = crimeMeta && crimeMeta.name
				? 'Crime ' + entry.id + ': ' + escapeHtml(crimeMeta.name)
				: 'Crime ID ' + entry.id;
			var crimeMetaLine = '';
			if (crimeMeta) {
				var category = crimeMeta.category_name ? escapeHtml(crimeMeta.category_name) : 'Unknown';
				var enhancer = crimeMeta.enhancer_name ? escapeHtml(crimeMeta.enhancer_name) : 'None';
				crimeMetaLine = '<div class="crime-meta-line">Category: ' + category + ' | Enhancer: ' + enhancer + '</div>';
			}

			if (entry.error) {
				card.classList.add('crime-error');
				card.innerHTML = [
					'<div class="crime-head">',
					'<div class="crime-id">' + crimeTitle + '</div>',
					'<div class="crime-rate">Fetch failed</div>',
					'</div>',
					crimeMetaLine,
					'<p>' + entry.error + '</p>'
				].join('');
				listNode.appendChild(card);
				return;
			}

			var crime = entry.crimes || {};
			var attempts = crime.attempts || {};
			var subcrimes = Array.isArray(attempts.subcrimes) ? attempts.subcrimes : [];
			var successRate = formatPercent(getNumber(attempts.success), getNumber(attempts.total));

			card.innerHTML = [
				'<div class="crime-head">',
				'<div class="crime-id">' + crimeTitle + '</div>',
				'<div class="crime-rate">Success Rate: ' + successRate + '</div>',
				'</div>',
				crimeMetaLine,
				'<div class="crime-stats">',
				statBlock('Skill', formatInt(crime.skill)),
				statBlock('Progression Bonus', formatInt(crime.progression_bonus)),
				statBlock('Nerve Spent', formatInt(crime.nerve_spent)),
				statBlock('Attempts', formatInt(attempts.total)),
				statBlock('Success', formatInt(attempts.success)),
				statBlock('Fail', formatInt(attempts.fail)),
				statBlock('Critical Fail', formatInt(attempts.critical_fail)),
				statBlock('Reward Money', '$' + formatInt(crime.rewards && crime.rewards.money)),
				statBlock('Unique Outcomes', formatInt(crimeMeta && crimeMeta.unique_outcomes_count)),
				'</div>',
				'<div class="subcrime-title">Subcrimes (' + subcrimes.length + ')</div>',
				renderSubcrimeTable(entry.id, subcrimes)
			].join('');

			listNode.appendChild(card);
		});
	}

	async function fetchCrimeById(apiKey, crimeId) {
		var encodedKey = encodeURIComponent(apiKey);
		var url = 'https://api.torn.com/v2/user/' + crimeId + '/crimes?key=' + encodedKey;


		try {
			var result = await requestCrimeData(url);
			if (!result.ok) {
				return {
					id: crimeId,
					error: 'Failed to fetch crime data.'
				};
			}

				var payload = extractCrimePayload(result.data);
				if (payload) {
					return {
						id: crimeId,
						crimes: payload
					};
				}
			return {
				id: crimeId,
				error: 'No crimes payload returned for this ID.'
			};
		} catch (error) {
			return {
				id: crimeId,
				error: 'Network error while loading crime data.'
			};
		}
	}

	async function loadCrimes() {
		setRangeText();
		setStatus('Loading mapping...');
		setLoadedCount(0);

		var metadataLoad = await loadCrimeMetadata();
		if (!metadataLoad || metadataLoad.crimeMapCount === 0) {
			setStatus('Loading API data... (name map missing)');
		} else {
			setStatus('Loading API data...');
		}

		var apiKey = getApiKey();
		if (!apiKey) {
			setStatus('Missing API Key');

			renderSummary([]);
			renderCrimeCards([
				{
					id: '-',
					error: 'Add your API key in Settings to load crimes data.'
				}
			]);
			return;
		}

		var results = [];

		for (var crimeId = MIN_CRIME_ID; crimeId <= MAX_CRIME_ID; crimeId += 1) {
			// Sequential requests keep call rate predictable and easier to debug.
			var entry = await fetchCrimeById(apiKey, crimeId);
			results.push(entry);
			setLoadedCount(results.length);
		}

		renderSummary(results);
		renderCrimeCards(results);

		var failed = results.filter(function(item){
			return !!item.error;
		}).length;

		var totalAttempts = results.reduce(function(sum, item){
			if (!item || item.error || !item.crimes || !item.crimes.attempts) {
				return sum;
			}

			return sum + getNumber(item.crimes.attempts.total);
		}, 0);

		if (failed) {
			setStatus('Loaded with ' + failed + ' errors');
		} else if (totalAttempts === 0) {
			setStatus('Loaded (no recorded attempts yet)');
		} else {
			setStatus('Loaded');
		}
	}

	document.addEventListener('DOMContentLoaded', function(){
		loadCrimes();
	});
})();
