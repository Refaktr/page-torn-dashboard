(function(){
    var STORAGE_KEY = 'discordWebhookUrl';
    var statusNode = document.getElementById('webhook-status');
    var resendButton = document.getElementById('webhook-resend-button');

    function getSavedWebhookUrl() {
        try {
            var sessionWebhookUrl = sessionStorage.getItem(STORAGE_KEY);
            if (sessionWebhookUrl) {
                return sessionWebhookUrl;
            }

            var rememberedWebhookUrl = localStorage.getItem(STORAGE_KEY);
            return rememberedWebhookUrl || '';
        } catch (error) {
            return '';
        }
    }

    function setStatus(text, isError) {
        if (!statusNode) {
            return;
        }

        statusNode.textContent = text;
        statusNode.className = isError ? 'webhook-status-send is-error' : 'webhook-status-send';
    }

    function buildPayload() {
        var pageUrl = window.location.href;
        var pageTitle = document.title;

        return {
            username: 'Torn Dashboard',
            embeds: [
                {
                    title: 'Webhook Page Test Embed',
                    description: 'This is a test embed sent from the Torn Dashboard webhook page.',
                    color: 0x5ac8fa,
                    fields: [
                        {
                            name: 'Page',
                            value: pageTitle,
                            inline: true
                        },
                        {
                            name: 'URL',
                            value: pageUrl,
                            inline: false
                        },
                        {
                            name: 'Type',
                            value: 'Visit ping',
                            inline: true
                        }
                    ],
                    footer: {
                        text: 'Torn Dashboard Webhook Test'
                    },
                    timestamp: new Date().toISOString()
                }
            ],
            allowed_mentions: {
                parse: []
            }
        };
    }

    function sendViaBeacon(webhookUrl, payload) {
        if (!navigator.sendBeacon) {
            return false;
        }

        try {
            var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            return navigator.sendBeacon(webhookUrl, blob);
        } catch (error) {
            return false;
        }
    }

    function sendViaFetch(webhookUrl, payload) {
        return fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload),
            keepalive: true
        });
    }

    async function sendVisitPing() {
        var webhookUrl = getSavedWebhookUrl();
        if (!webhookUrl) {
            setStatus('No webhook URL saved. Set one in Settings first.', true);
            return;
        }

        var payload = buildPayload();

        if (sendViaBeacon(webhookUrl, payload)) {
            setStatus('Visit ping sent to Discord webhook.', false);
            return;
        }

        try {
            await sendViaFetch(webhookUrl, payload);
            setStatus('Visit ping sent to Discord webhook.', false);
        } catch (error) {
            console.error('Webhook send failed', error);
            setStatus('Failed to send webhook ping.', true);
        }
    }

    if (resendButton) {
        resendButton.addEventListener('click', function(){
            sendVisitPing();
        });
    }

    sendVisitPing();
})();