// A function to get the api key from local storage
function getApiKey() {
    try {
        var sessionApiKey = sessionStorage.getItem('tornApiKey');
        if (sessionApiKey) {
            return sessionApiKey;
        }

        return localStorage.getItem('tornApiKey');
    } catch (error) {
        console.error('Error retrieving API key from local storage:', error);
        return null;
    }
}

var apiKey = getApiKey();
var marketItems = [];
var activeSort = 'market-desc';
var activeTypeFilter = 'all';

var typeAliases = {
    primary: ['primary'],
    secondary: ['secondary'],
    melee: ['melee'],
    temporary: ['temporary'],
    armor: ['armor', 'defensive'],
    ammunition: ['ammunition', 'ammo'],
    attachments: ['attachments', 'attachment', 'mod', 'mods'],
    medical: ['medical', 'medicine', 'medical item'],
    drugs: ['drugs', 'drug'],
    boosters: ['boosters', 'booster'],
    plushies: ['plushies', 'plushie'],
    flowers: ['flowers', 'flower'],
    cars: ['cars', 'car', 'vehicle', 'vehicles'],
    collectibles: ['collectibles', 'collectible']
};

function getNumericValue(value) {
    return typeof value === 'number' ? value : 0;
}

function formatMoney(value) {
    if (typeof value !== 'number') {
        return 'N/A';
    }

    return '$' + value.toLocaleString();
}

function getItemsArray(rawItems) {
    if (Array.isArray(rawItems)) {
        return rawItems;
    }

    if (rawItems && typeof rawItems === 'object') {
        return Object.values(rawItems);
    }

    return [];
}

function createValueBlock(label, value, numberClassName, blockClassName) {
    var block = document.createElement('div');
    block.className = 'market-value-block';
    if (blockClassName) {
        block.classList.add(blockClassName);
    }

    var blockLabel = document.createElement('div');
    blockLabel.className = 'market-value-label';
    blockLabel.textContent = label;

    var blockValue = document.createElement('div');
    blockValue.className = 'market-value-number';
    if (numberClassName) {
        blockValue.classList.add(numberClassName);
    }
    blockValue.textContent = formatMoney(value);
    blockValue.title = formatMoney(value);

    block.appendChild(blockLabel);
    block.appendChild(blockValue);
    return block;
}

function createItemCard(item) {
    var card = document.createElement('div');
    card.className = 'card market-item-card';

    var header = document.createElement('div');
    header.className = 'market-item-head';

    var image = document.createElement('img');
    image.className = 'market-item-image';
    image.src = item.image || '';
    image.alt = item.name ? item.name + ' image' : 'Item image';

    var titleWrap = document.createElement('div');
    titleWrap.className = 'market-item-title-wrap';

    var title = document.createElement('h3');
    title.className = 'market-item-name';
    title.textContent = item.name || 'Unknown Item';

    var tags = document.createElement('div');
    tags.className = 'market-item-tags';

    var typeTag = document.createElement('span');
    typeTag.className = 'market-item-tag';
    typeTag.textContent = item.type || 'Unknown Type';

    var subtypeTag = document.createElement('span');
    subtypeTag.className = 'market-item-tag';
    subtypeTag.textContent = item.sub_type || 'No Sub-type';

    tags.appendChild(typeTag);
    tags.appendChild(subtypeTag);

    titleWrap.appendChild(title);
    titleWrap.appendChild(tags);

    header.appendChild(image);
    header.appendChild(titleWrap);

    var values = document.createElement('div');
    values.className = 'market-item-values';

    var vendorBuyPrice = item.value && item.value.buy_price;
    var vendorSellPrice = item.value && item.value.sell_price;
    var marketPrice = item.value && item.value.market_price;

    var marketComparisonClass = 'is-neutral';
    if (typeof marketPrice === 'number' && typeof vendorBuyPrice === 'number') {
        if (marketPrice < vendorBuyPrice) {
            marketComparisonClass = 'is-good';
        } else if (marketPrice > vendorBuyPrice) {
            marketComparisonClass = 'is-bad';
        }
    }

    values.appendChild(createValueBlock('Vendor Buy', vendorBuyPrice, 'is-vendor-buy'));
    values.appendChild(createValueBlock('Vendor Sell', vendorSellPrice, 'is-vendor-sell'));
    values.appendChild(createValueBlock('Market Value', marketPrice, marketComparisonClass, 'market-value-block--market'));

    var meta = document.createElement('div');
    meta.className = 'market-item-meta';

    var vendor = document.createElement('span');
    var vendorLabel = document.createElement('strong');
    vendorLabel.textContent = 'Vendor:';
    vendor.appendChild(vendorLabel);
    vendor.appendChild(document.createTextNode(' ' + ((item.value && item.value.vendor && item.value.vendor.name) || 'Unknown')));

    var circulation = document.createElement('span');
    var circulationLabel = document.createElement('strong');
    circulationLabel.textContent = 'Circulation:';
    circulation.appendChild(circulationLabel);
    circulation.appendChild(document.createTextNode(' ' + (typeof item.circulation === 'number' ? item.circulation.toLocaleString() : 'N/A')));

    meta.appendChild(vendor);
    meta.appendChild(circulation);

    card.appendChild(header);
    // card.appendChild(description);
    card.appendChild(values);
    card.appendChild(meta);

    return card;
}

function renderItems(items) {
    var marketContainer = document.querySelector('.cards');
    var countElement = document.getElementById('market-item-count');
    if (!marketContainer) {
        return;
    }

    marketContainer.innerHTML = '';

    if (!items.length) {
        if (countElement) {
            countElement.textContent = '0 matching items';
        }

        var emptyCard = document.createElement('div');
        emptyCard.className = 'card market-empty-state';
        emptyCard.textContent = 'No items match the current filters.';
        marketContainer.appendChild(emptyCard);
        return;
    }

    if (countElement) {
        countElement.textContent = items.length.toLocaleString() + ' matching items';
    }

    items.forEach(function(item){
        marketContainer.appendChild(createItemCard(item));
    });
}

function sortItems(items, sortValue) {
    var sorted = items.slice();

    sorted.sort(function(a, b){
        var aName = (a.name || '').toLowerCase();
        var bName = (b.name || '').toLowerCase();
        var aMarket = getNumericValue(a.value && a.value.market_price);
        var bMarket = getNumericValue(b.value && b.value.market_price);
        var aVendorBuy = getNumericValue(a.value && a.value.buy_price);
        var bVendorBuy = getNumericValue(b.value && b.value.buy_price);
        var aCirculation = getNumericValue(a.circulation);
        var bCirculation = getNumericValue(b.circulation);

        switch (sortValue) {
            case 'market-asc':
                return aMarket - bMarket;
            case 'market-desc':
                return bMarket - aMarket;
            case 'vendor-buy-asc':
                return aVendorBuy - bVendorBuy;
            case 'vendor-buy-desc':
                return bVendorBuy - aVendorBuy;
            case 'circulation-asc':
                return aCirculation - bCirculation;
            case 'circulation-desc':
                return bCirculation - aCirculation;
            case 'name-desc':
                return bName.localeCompare(aName);
            case 'name-asc':
            default:
                return aName.localeCompare(bName);
        }
    });

    return sorted;
}

function renderSortedItems() {
    var filteredItems = filterItemsByType(marketItems, activeTypeFilter);
    renderItems(sortItems(filteredItems, activeSort));
}

function isItemInType(item, selectedType) {
    if (selectedType === 'all') {
        return true;
    }

    var selectedKey = String(selectedType).toLowerCase();
    var matchValues = typeAliases[selectedKey] || [selectedKey];
    var itemType = item && item.type ? String(item.type).toLowerCase() : '';
    var itemSubType = item && item.sub_type ? String(item.sub_type).toLowerCase() : '';

    return matchValues.some(function(matchValue){
        return itemType === matchValue || itemSubType === matchValue;
    });
}

function filterItemsByType(items, selectedType) {
    return items.filter(function(item){
        return isItemInType(item, selectedType);
    });
}

function initializeSortControls() {
    var sortSelect = document.getElementById('market-sort-select');
    var typeFilterSelect = document.getElementById('market-type-filter');

    if (!sortSelect) {
        return;
    }

    sortSelect.value = activeSort;
    sortSelect.addEventListener('change', function(event){
        activeSort = event.target.value;
        renderSortedItems();
    });

    if (!typeFilterSelect) {
        return;
    }

    typeFilterSelect.value = activeTypeFilter;
    typeFilterSelect.addEventListener('change', function(event){
        activeTypeFilter = event.target.value;
        renderSortedItems();
    });
}

function fetchMarketData() {
    if (!apiKey) {
        console.error('API key is not set. Please enter your Torn API key in the settings.');
        marketItems = [];
        renderItems([]);
        return;
    }

    // Example API endpoint for market data (replace with actual endpoint)
    var apiUrl = `https://api.torn.com/v2/torn/items?cat=All&key=${encodeURIComponent(apiKey)}`;
    console.log('API endpoint:', apiUrl);

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            console.log('Market Data:', data);
            marketItems = getItemsArray(data.items);
            renderSortedItems();

        })
        .catch(error => {
            console.error('Error fetching market data:', error);
            marketItems = [];
            renderItems([]);
        });
}

// Call the function to fetch market data when the page loads
document.addEventListener('DOMContentLoaded', function(){
    initializeSortControls();
    fetchMarketData();
});

