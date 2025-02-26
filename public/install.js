let deferredPrompt;

function logMessage(message) {
    const logContainer = document.getElementById('log-container');
    const logEntry = document.createElement('div');
    logEntry.textContent = message;
    logContainer.appendChild(logEntry);
    console.log(message); // Also log to the console for debugging
}

window.addEventListener('beforeinstallprompt', (e) => {
    logMessage('beforeinstallprompt event fired');
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    logMessage('Deferred prompt saved');
    // Update UI notify the user they can install the PWA
    const installButton = document.getElementById('install-button');
    installButton.style.display = 'block';
    logMessage('Install button displayed');

    installButton.addEventListener('click', () => {
        logMessage('Install button clicked');
        // Hide the install button
        installButton.style.display = 'none';
        // Show the install prompt
        deferredPrompt.prompt();
        logMessage('Install prompt shown');
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                logMessage('User accepted the install prompt');
            } else {
                logMessage('User dismissed the install prompt');
            }
            deferredPrompt = null;
        }).catch((error) => {
            logMessage('Error during userChoice: ' + error);
        });
    });
});

window.addEventListener('appinstalled', () => {
    logMessage('PWA was installed');
});

// Show custom install prompt if beforeinstallprompt is not triggered
window.addEventListener('load', () => {
    setTimeout(() => {
        if (!deferredPrompt) {
            const customInstallPrompt = document.getElementById('custom-install-prompt');
            customInstallPrompt.style.display = 'block';
            logMessage('Custom install prompt displayed');
        }
    }, 3000); // Wait for 3 seconds before showing the custom prompt
});