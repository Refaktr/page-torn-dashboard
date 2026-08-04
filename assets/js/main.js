(function(){
    var STORAGE_KEY = 'tornApiKey';

    function setActiveNavLink() {
        var path = window.location.pathname.toLowerCase();
        var links = document.querySelectorAll('.sidebar a');

        links.forEach(function(link){
            var href = link.getAttribute('href');
            if (!href) {
                return;
            }

            var normalizedHref = href.replace('./', '').toLowerCase();
            if (
                path.endsWith(normalizedHref) ||
                (path.endsWith('/') && normalizedHref === 'index.html')
            ) {
                link.classList.add('is-active');
            }
        });
    }

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

    setActiveNavLink();
    initializeApiKeySettings();
})();
