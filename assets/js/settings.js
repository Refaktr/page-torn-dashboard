(function(){
    var STORAGE_KEY = 'tornApiKey';
    var STORAGE_MODE_KEY = 'tornApiKeyStorageMode';

    function readApiKeyFromStorage() {
        var sessionKey = sessionStorage.getItem(STORAGE_KEY);
        if (sessionKey) {
            return {
                key: sessionKey,
                mode: 'session'
            };
        }

        var rememberedKey = localStorage.getItem(STORAGE_KEY);
        if (rememberedKey) {
            return {
                key: rememberedKey,
                mode: 'remember'
            };
        }

        var rememberedMode = localStorage.getItem(STORAGE_MODE_KEY);
        return {
            key: '',
            mode: rememberedMode === 'remember' ? 'remember' : 'session'
        };
    }

    function setButtonMessage(button, message) {
        button.textContent = message;
        window.setTimeout(function(){
            button.textContent = 'Save';
        }, 1200);
    }

    function initializeApiKeySettings() {
        var apiInput = document.getElementById('api-key-input');
        var saveButton = document.getElementById('api-key-save-button');
        var clearButton = document.getElementById('api-key-clear-button');
        var storageModeSelect = document.getElementById('api-key-storage-mode');
        var storageNote = document.getElementById('api-key-storage-note');

        if (!apiInput || !saveButton || !clearButton || !storageModeSelect || !storageNote) {
            return;
        }

        try {
            var existing = readApiKeyFromStorage();
            apiInput.value = existing.key;
            storageModeSelect.value = existing.mode;

            storageNote.textContent = storageModeSelect.value === 'remember'
                ? 'Remember mode stores your key in local browser storage.'
                : 'Session mode is safer on shared devices.';
        } catch (error) {
            return;
        }

        storageModeSelect.addEventListener('change', function(){
            storageNote.textContent = storageModeSelect.value === 'remember'
                ? 'Remember mode stores your key in local browser storage.'
                : 'Session mode is safer on shared devices.';
        });

        saveButton.addEventListener('click', function(){
            var apiKey = apiInput.value.trim();
            var storageMode = storageModeSelect.value;

            try {
                if (storageMode === 'remember') {
                    localStorage.setItem(STORAGE_KEY, apiKey);
                    localStorage.setItem(STORAGE_MODE_KEY, 'remember');
                    sessionStorage.removeItem(STORAGE_KEY);
                } else {
                    sessionStorage.setItem(STORAGE_KEY, apiKey);
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.setItem(STORAGE_MODE_KEY, 'session');
                }

                setButtonMessage(saveButton, 'Saved');
            } catch (error) {
                setButtonMessage(saveButton, 'Failed');
            }
        });

        clearButton.addEventListener('click', function(){
            try {
                sessionStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(STORAGE_KEY);
                apiInput.value = '';
                storageModeSelect.value = 'session';
                localStorage.setItem(STORAGE_MODE_KEY, 'session');
                storageNote.textContent = 'Session mode is safer on shared devices.';
            } catch (error) {
                return;
            }
        });
    }

    initializeApiKeySettings();
})();
