// Make an API call to fetch user data from the Torn API

const getApiKey = () => {
    // Prefer session key, then fallback to remembered local key.
    const sessionApiKey = sessionStorage.getItem('tornApiKey');
    if (sessionApiKey) {
        return sessionApiKey;
    }

    const storedApiKey = localStorage.getItem('tornApiKey');
    return storedApiKey ? storedApiKey : '';
}

// Check if the API key is set, if not, prompt the user to set it in settings.
const apiKey = getApiKey();

if (!apiKey) {
    alert('API key is not set. Please go to settings and set your Torn API key.');
    window.location.href = 'pages/settings.html'; // Redirect to settings page
}

const setText = (id, text) => {
    const node = document.getElementById(id);
    if (node) {
        node.textContent = text;
    }
};

const formatBar = (bar) => {
    if (!bar) {
        return '0 / 0';
    }

    const current = typeof bar.current === 'number' ? bar.current.toLocaleString() : '0';
    const maximum = typeof bar.maximum === 'number'
        ? bar.maximum.toLocaleString()
        : (typeof bar.max === 'number' ? bar.max.toLocaleString() : '0');
    return `${current} / ${maximum}`;
};

const fetchUserData = () => {
    const apiKey = getApiKey(); // Retrieve the API key from local storage
    const basicUrl = `https://api.torn.com/user/?selections=basic&key=${apiKey}`;
    console.log('API endpoint:', basicUrl);
    
    fetch(basicUrl)
        .then(response => response.json())
        .then(data => {
            // Handle the user data here
            console.log(data);

            const userName = data.name;
            const userLevel = data.level;

            // Update the DOM with the user data
            document.getElementById('user-name').textContent = userName;
            document.getElementById('user-level').textContent = `Level: ${userLevel}`;
        })
        .catch(error => {
            console.error('Error fetching user data:', error);
        });

    const factionUrl = `https://api.torn.com/v2/user/faction?key=${apiKey}`;
    console.log('API endpoint:', factionUrl);

    fetch(factionUrl)
        .then(response => response.json())
        .then(data => {
            console.log(data);

            const userFaction = data.faction ? data.faction.name : 'No Faction';
            document.getElementById('user-faction').textContent = userFaction;
        })
        .catch(error => {
            console.error('Error fetching user faction:', error);
        });
}

const getUserNetworth = () => {
    const apiKey = getApiKey(); // Retrieve the API key from local storage
    const moneyUrl = `https://api.torn.com/v2/user/money?key=${apiKey}`;
    console.log('API endpoint:', moneyUrl);

    fetch(moneyUrl)
        .then(response => response.json())
        .then(data => {
            // Handle the user networth data here
             console.log(data.money.daily_networth);

            // Get the user networth from the data and update the DOM
            const userNetworth = data.money.daily_networth; // Assuming the networth is in the 'money' field
            document.getElementById('user-networth').textContent = `$${userNetworth.toLocaleString()}`;
            })
        .catch(error => {
            console.error('Error fetching user networth:', error);
        });
}

const fetchUserBars = () => {
    const apiKey = getApiKey();
    const barsUrl = `https://api.torn.com/v2/user/bars?key=${apiKey}`;
    console.log('API endpoint:', barsUrl);

    fetch(barsUrl)
        .then(response => response.json())
        .then(data => {
            if (data && data.error) {
                console.error('Error fetching user bars:', data.error);
                return;
            }

            const bars = data && data.bars ? data.bars : {};
            setText('user-energy', formatBar(bars.energy));
            setText('user-nerve', formatBar(bars.nerve));
            setText('user-happy', formatBar(bars.happy));
            setText('user-life', formatBar(bars.life));
        })
        .catch(error => {
            console.error('Error fetching user bars:', error);
        });
}


// Call the fetchUserData function to initiate the API call
fetchUserData();
getUserNetworth();
fetchUserBars();
