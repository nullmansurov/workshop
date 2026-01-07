// If the updateFloatingControls function is not defined, create a stub
if (typeof updateFloatingControls === 'undefined') {
    function updateFloatingControls() {}
}

document.addEventListener('DOMContentLoaded', function(){
    var pomidoroBtn = document.getElementById('pomidoro');
    if (pomidoroBtn) {
        pomidoroBtn.addEventListener('click', showPomidoroModal);
    }
});

var pollInterval = null;
var lastPhase = null;
var notificationAudio = null; // for storing the audio element

function showPomidoroModal(){
    if (document.getElementById('pomidoroModal')) return;

    var modal = document.createElement('div');
    modal.id = 'pomidoroModal';
    modal.className = 'pomidoro-modal';

    // Header: title, settings button, and close button
    var header = document.createElement('div');
    header.id = 'pomidoroHeader';
    header.className = 'pomidoro-header';
    header.innerHTML = '<span>Pomodoro</span>' +
                       '<div class="pomidoro-header-buttons">' +
                           '<button id="pomidoroSettingsBtn" class="pomidoro-btn-settings">⚙</button>' +
                           '<button id="pomidoroClose" class="pomidoro-btn-close">×</button>' +
                       '</div>';
    modal.appendChild(header);

    var content = document.createElement('div');
    content.id = 'pomidoroContent';
    content.className = 'pomidoro-content';

    // Status and remaining time display
    var display = document.createElement('div');
    display.id = 'pomidoroDisplay';
    display.className = 'pomidoro-display';
    display.textContent = 'Ready to start';
    content.appendChild(display);

    // Control buttons container
    var controls = document.createElement('div');
    controls.id = 'pomidoroControls';
    controls.className = 'pomidoro-controls';

    var startBtn = document.createElement('button');
    startBtn.id = 'pomidoroStart';
    startBtn.textContent = 'Start';
    controls.appendChild(startBtn);

    var stopBtn = document.createElement('button');
    stopBtn.id = 'pomidoroStop';
    stopBtn.textContent = 'Stop';
    controls.appendChild(stopBtn);

    // Button to accept sound notification (will be visible when confirmation is required)
    var acceptBtn = document.createElement('button');
    acceptBtn.id = 'pomidoroAccept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.style.display = 'none';
    controls.appendChild(acceptBtn);

    content.appendChild(controls);

    // Compact settings panel (without ringtone selection)
    var settingsPanel = document.createElement('div');
    settingsPanel.id = 'pomidoroSettings';
    settingsPanel.className = 'pomidoro-settings';
    settingsPanel.style.display = 'none';
    settingsPanel.innerHTML = `
        <label>Work (min): <input type="number" id="pomidoroWork" value="25"></label>
        <label>Short break (min): <input type="number" id="pomidoroShortBreak" value="5"></label>
        <label>Long break (min): <input type="number" id="pomidoroLongBreak" value="15"></label>
        <label>Cycles: <input type="number" id="pomidoroCycles" value="4"></label>
        <button id="pomidoroSaveSettings">Save Settings</button>
    `;
    content.appendChild(settingsPanel);

    modal.appendChild(content);
    document.body.appendChild(modal);

    makeDraggable(modal, header);
    loadPomidoroSettings();

    // Close button handler
    document.getElementById('pomidoroClose').addEventListener('click', function(){
        stopPomidoro();
        stopNotificationSound();
        modal.parentNode.removeChild(modal);
    });

    // Settings button handler (toggles panel display)
    document.getElementById('pomidoroSettingsBtn').addEventListener('click', function(){
        var settingsPanel = document.getElementById('pomidoroSettings');
        settingsPanel.style.display = (settingsPanel.style.display === 'none') ? 'block' : 'none';
    });

    document.getElementById('pomidoroStart').addEventListener('click', startPomidoro);
    document.getElementById('pomidoroStop').addEventListener('click', stopPomidoro);
    document.getElementById('pomidoroSaveSettings').addEventListener('click', savePomidoroSettings);
    document.getElementById('pomidoroAccept').addEventListener('click', acceptTimer);
}

// Function to make the modal draggable
function makeDraggable(modal, handle) {
    var offsetX = 0, offsetY = 0, isDown = false;
    handle.addEventListener('mousedown', function(e){
        isDown = true;
        offsetX = modal.offsetLeft - e.clientX;
        offsetY = modal.offsetTop - e.clientY;
    }, true);
    document.addEventListener('mouseup', function(){
        isDown = false;
    }, true);
    document.addEventListener('mousemove', function(e){
        e.preventDefault();
        if (isDown) {
            modal.style.left = (e.clientX + offsetX) + 'px';
            modal.style.top  = (e.clientY + offsetY) + 'px';
        }
    }, true);
}

// Load settings from localStorage
function loadPomidoroSettings(){
    var settings = localStorage.getItem('pomidoroSettings');
    if (settings) {
        settings = JSON.parse(settings);
        document.getElementById('pomidoroWork').value = settings.work || 25;
        document.getElementById('pomidoroShortBreak').value = settings.short_break || 5;
        document.getElementById('pomidoroLongBreak').value = settings.long_break || 15;
        document.getElementById('pomidoroCycles').value = settings.cycles || 4;
    }
}

// Save settings and send to the server
function savePomidoroSettings(){
    var settings = {
        work: parseInt(document.getElementById('pomidoroWork').value, 10),
        short_break: parseInt(document.getElementById('pomidoroShortBreak').value, 10),
        long_break: parseInt(document.getElementById('pomidoroLongBreak').value, 10),
        cycles: parseInt(document.getElementById('pomidoroCycles').value, 10)
    };
    localStorage.setItem('pomidoroSettings', JSON.stringify(settings));

    fetch('/pomidoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settings })
    })
    .then(response => response.json())
    .then(data => console.log('Settings saved', data))
    .catch(error => console.error('Error saving settings:', error));
}

// Start the timer: send the start command and begin polling
function startPomidoro(){
    var settings = {
        work: parseInt(document.getElementById('pomidoroWork').value, 10),
        short_break: parseInt(document.getElementById('pomidoroShortBreak').value, 10),
        long_break: parseInt(document.getElementById('pomidoroLongBreak').value, 10),
        cycles: parseInt(document.getElementById('pomidoroCycles').value, 10)
    };
    localStorage.setItem('pomidoroSettings', JSON.stringify(settings));
    fetch('/pomidoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', settings: settings })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Timer started', data);
        lastPhase = null;
        pollInterval = setInterval(pollPomidoroStatus, 1000);
    })
    .catch(error => console.error('Error starting timer:', error));
}

// Stop the timer: send the stop command and end polling
function stopPomidoro(){
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    fetch('/pomidoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Timer stopped', data);
        document.getElementById('pomidoroDisplay').textContent = 'Stopped';
    })
    .catch(error => console.error('Error stopping timer:', error));
}

// Poll timer status and update the display
function pollPomidoroStatus(){
    fetch('/pomidoro')
    .then(response => response.json())
    .then(data => {
        if (data.timer) {
            var phase = data.timer.phase;
            var remaining = data.timer.remaining;
            updateDisplay(phase, remaining);
            if (data.timer.waiting) {
                // If the server is waiting for confirmation, play the notification sound
                playNotificationSound();
                document.getElementById('pomidoroAccept').style.display = 'inline-block';
            }
            lastPhase = phase;
        } else if (data.settings) {
            document.getElementById('pomidoroDisplay').textContent = 'Ready to start';
        }
    })
    .catch(error => console.error('Error getting timer status:', error));
}

// Update the display with the remaining time
function updateDisplay(phase, seconds){
    var display = document.getElementById('pomidoroDisplay');
    var minutes = Math.floor(seconds / 60);
    var secs = seconds % 60;
    var phaseText = phase === 'work' ? 'Work' : (phase === 'short_break' ? 'Short break' : 'Long break');
    display.textContent = phaseText + ' - ' + minutes.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
}

// Play notification sound (looped)
function playNotificationSound(){
    if (!notificationAudio) {
        notificationAudio = new Audio('/files/melodia.mp3');
        notificationAudio.loop = true;
    }
    notificationAudio.play().catch(function(err){
        console.error("Error playing sound:", err);
    });
}

// Stop the notification sound and hide the "Accept" button
function stopNotificationSound(){
    if (notificationAudio) {
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
    }
    document.getElementById('pomidoroAccept').style.display = 'none';
}

// On "Accept" click, send a request with the "accept" action
function acceptTimer(){
    fetch('/pomidoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Timer resumed', data);
        stopNotificationSound();
    })
    .catch(error => console.error('Error confirming timer:', error));
}