(function(){
    var STORAGE_KEY = 'tornApiKey';
    var STORAGE_MODE_KEY = 'tornApiKeyStorageMode';
    var FFSCOUTER_STORAGE_KEY = 'ffscouterApiKey';

    function readApiKeyFromStorage(storageKey, modeKey) {
        var sessionKey = sessionStorage.getItem(storageKey);
        if (sessionKey) {
            return {
                key: sessionKey,
                mode: 'session'
            };
        }

        var rememberedKey = localStorage.getItem(storageKey);
        if (rememberedKey) {
            return {
                key: rememberedKey,
                mode: 'remember'
            };
        }

        var rememberedMode = localStorage.getItem(modeKey);
        return {
            key: '',
            mode: rememberedMode === 'remember' ? 'remember' : 'session'
        };
    }

    function setButtonMessage(button, label) {
        button.textContent = label;
        window.setTimeout(function(){
            button.textContent = 'Save';
        }, 1200);
    }

    function initializeKeySetting(options) {
        var input = document.getElementById(options.inputId);
        var saveButton = document.getElementById(options.saveButtonId);
        var clearButton = document.getElementById(options.clearButtonId);
        var storageModeSelect = document.getElementById(options.storageModeId);
        var storageNote = document.getElementById(options.noteId);

        if (!input || !saveButton || !clearButton) {
            return;
        }

        try {
            var existing = readApiKeyFromStorage(options.storageKey, options.modeKey);
            input.value = existing.key;
            if (storageModeSelect) {
                storageModeSelect.value = existing.mode;
            }

            if (storageNote && storageModeSelect) {
                storageNote.textContent = storageModeSelect.value === 'remember'
                    ? 'Remember mode stores your key in local browser storage.'
                    : 'Session mode is safer on shared devices.';
            }
        } catch (error) {
            return;
        }

        if (storageModeSelect && storageNote) {
            storageModeSelect.addEventListener('change', function(){
                storageNote.textContent = storageModeSelect.value === 'remember'
                    ? 'Remember mode stores your key in local browser storage.'
                    : 'Session mode is safer on shared devices.';
            });
        }

        saveButton.addEventListener('click', function(){
            var apiKey = input.value.trim();
            var storageMode = storageModeSelect ? storageModeSelect.value : 'session';

            try {
                if (storageMode === 'remember') {
                    localStorage.setItem(options.storageKey, apiKey);
                    localStorage.setItem(options.modeKey, 'remember');
                    sessionStorage.removeItem(options.storageKey);
                } else {
                    sessionStorage.setItem(options.storageKey, apiKey);
                    localStorage.removeItem(options.storageKey);
                    localStorage.setItem(options.modeKey, 'session');
                }

                setButtonMessage(saveButton, 'Saved');
            } catch (error) {
                setButtonMessage(saveButton, 'Failed');
            }
        });

        clearButton.addEventListener('click', function(){
            try {
                sessionStorage.removeItem(options.storageKey);
                localStorage.removeItem(options.storageKey);
                input.value = '';
                if (storageModeSelect) {
                    storageModeSelect.value = 'session';
                }
                localStorage.setItem(options.modeKey, 'session');
                if (storageNote) {
                    storageNote.textContent = 'Session mode is safer on shared devices.';
                }
            } catch (error) {
                return;
            }
        });
    }

    initializeKeySetting({
        inputId: 'api-key-input',
        saveButtonId: 'api-key-save-button',
        clearButtonId: 'api-key-clear-button',
        storageModeId: 'api-key-storage-mode',
        noteId: 'api-key-storage-note',
        storageKey: STORAGE_KEY,
        modeKey: STORAGE_MODE_KEY
    });

    initializeKeySetting({
        inputId: 'ffscouter-api-key-input',
        saveButtonId: 'ffscouter-api-key-save-button',
        clearButtonId: 'ffscouter-api-key-clear-button',
        storageModeId: 'ffscouter-api-key-storage-mode',
        noteId: 'ffscouter-api-key-storage-note',
        storageKey: FFSCOUTER_STORAGE_KEY,
        modeKey: 'ffscouterApiKeyStorageMode'
    });
})();
