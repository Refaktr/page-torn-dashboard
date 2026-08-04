(function(){
    var STORAGE_KEY = 'tornApiKey';

    function initializeApiKeySettings() {
        var apiCardTitle = document.querySelector('.settingList .card h3');
        if (!apiCardTitle || apiCardTitle.textContent.trim().toLowerCase() !== 'api key') {
            return;
        }

        var apiInput = apiCardTitle.parentElement.querySelector('input[type="text"]');
        var saveButton = apiCardTitle.parentElement.querySelector('button');

        if (!apiInput || !saveButton) {
            return;
        }

        try {
            var existingApiKey = localStorage.getItem(STORAGE_KEY);
            if (existingApiKey) {
                apiInput.value = existingApiKey;
            }
        } catch (error) {
            return;
        }

        saveButton.addEventListener('click', function(){
            var apiKey = apiInput.value.trim();

            try {
                localStorage.setItem(STORAGE_KEY, apiKey);
                saveButton.textContent = 'Saved';

                window.setTimeout(function(){
                    saveButton.textContent = 'Save';
                }, 1200);
            } catch (error) {
                saveButton.textContent = 'Failed';

                window.setTimeout(function(){
                    saveButton.textContent = 'Save';
                }, 1200);
            }
        });
    }

    initializeApiKeySettings();
})();
