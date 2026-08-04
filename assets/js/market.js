// A function to get the api key from local storage
function getApiKey() {
    try {
        return localStorage.getItem('tornApiKey');
    } catch (error) {
        console.error('Error retrieving API key from local storage:', error);
        return null;
    }
}

var apiKey = getApiKey();

function fetchMarketData() {
    if (!apiKey) {
        console.error('API key is not set. Please enter your Torn API key in the settings.');
        return;
    }

    // Example API endpoint for market data (replace with actual endpoint)
    var apiUrl = `https://api.torn.com/market/?selections=items&key=${apiKey}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            console.log('Market Data:', data);
            // Process and display the market data as needed
        })
        .catch(error => {
            console.error('Error fetching market data:', error);
        });
}

// Call the function to fetch market data when the page loads
document.addEventListener('DOMContentLoaded', fetchMarketData);

