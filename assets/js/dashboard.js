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

const fetchUserData = () => {
    const apiKey = getApiKey(); // Retrieve the API key from local storage
    
    fetch(`https://api.torn.com/user/?selections=basic&key=${apiKey}`)
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

    fetch(`https://api.torn.com/v2/user/faction?key=${apiKey}`)
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
    fetch(`https://api.torn.com/v2/user/money?key=${apiKey}`)
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


// Call the fetchUserData function to initiate the API call
fetchUserData();
getUserNetworth();