// Replace the hard-coded avatar ID with a function to get it from URL parameters
// const AKOOL_AVATAR_ID = "dvp_Tristan_cloth2_1080P";
// Add default avatars object for fallback and descriptions
const AKOOL_AVATARS = {
    "dvp_Tristan_cloth2_1080P": { name: "Tristan", gender: "male" },
    "dvp_Emma_cloth2_1080P": { name: "Emma", gender: "female" },
    "dvp_Sarah_cloth2_1080P": { name: "Sarah", gender: "female" },
    "dvp_Michael_cloth2_1080P": { name: "Michael", gender: "male" }
};

// CSS variables for styling
const CSS_VARS = {
    primaryColor: '#4a6cf7',
    primaryDark: '#3a56d4'
};

// Get avatar ID from URL parameters with fallback to default
function getAvatarIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const avatarId = urlParams.get('avatar_id');
    return avatarId && AKOOL_AVATARS[avatarId] ? avatarId : "dvp_Tristan_cloth2_1080P";
}

const GREETING_DELAY_MS = 3000; // 3s before sending greeting
const RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000; // 2s between reconnect attempts
const REQUEST_TIMEOUT = 15000; // 15s API timeout

// State Management
let akoolSessionId = null;
let agoraClient = null;
let remoteUser = null;
let wsConnection = null;
let reconnectAttempts = 0;
let isInitialized = false;
let isConnected = false;

// DOM References
const state = {
    avatarContainer: null,
    loadingContainer: null,
    avatarPlaceholder: null,
    statusElement: null,
    statusText: null,
    actionButtons: null,
    logEntries: null
};

// Toast notification system 
const toast = {
    container: null,
    queue: [],
    timeouts: [],
    
    init() {
        // Create toast container if it doesn't exist
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
            
            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                .toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-width: 350px;
                }
                .toast {
                    padding: 12px 16px;
                    border-radius: 8px;
                    color: white;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    animation: toast-in 0.3s ease forwards;
                    opacity: 0;
                    transform: translateY(-20px);
                }
                .toast-success {
                    background-color: #10b981;
                }
                .toast-error {
                    background-color: #ef4444;
                }
                .toast-info {
                    background-color: ${CSS_VARS.primaryColor};
                }
                .toast-close {
                    background: transparent;
                    border: none;
                    color: white;
                    cursor: pointer;
                    margin-left: 10px;
                    opacity: 0.7;
                    font-size: 18px;
                }
                .toast-close:hover {
                    opacity: 1;
                }
                @keyframes toast-in {
                    0% {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                @keyframes toast-out {
                    0% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    },
    
    show(message, type = 'info', duration = 5000) {
        this.init();
        
        // Create toast element
        const toastEl = document.createElement('div');
        toastEl.className = `toast toast-${type}`;
        
        // Create message
        const msgEl = document.createElement('span');
        msgEl.textContent = message;
        toastEl.appendChild(msgEl);
        
        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.dismiss(toastEl));
        toastEl.appendChild(closeBtn);
        
        // Add to container
        this.container.appendChild(toastEl);
        
        // Set auto dismiss
        const timeout = setTimeout(() => {
            this.dismiss(toastEl);
        }, duration);
        
        // Track for cleanup
        this.queue.push(toastEl);
        this.timeouts.push(timeout);
        
        return toastEl;
    },
    
    dismiss(toastEl) {
        // Animate out
        toastEl.style.animation = 'toast-out 0.3s ease forwards';
        
        // Remove after animation
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.parentNode.removeChild(toastEl);
            }
            
            // Clean up tracked references
            const index = this.queue.indexOf(toastEl);
            if (index > -1) {
                this.queue.splice(index, 1);
                clearTimeout(this.timeouts[index]);
                this.timeouts.splice(index, 1);
            }
        }, 300);
    },
    
    // Clear all toasts
    clear() {
        this.queue.forEach(toast => this.dismiss(toast));
    }
};

// UI State Management
const showLoadingState = (message) => {
    if (state.loadingContainer) state.loadingContainer.style.display = 'flex';
    if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'none';
    if (state.statusElement) {
        state.statusElement.classList.remove('error', 'success');
        state.statusElement.classList.add('loading');
        state.statusText.textContent = message;
    }
    // Set listening indicator based on message content
    setListeningIndicator(message.toLowerCase().includes('listening'));
    addLog(message, 'info');
};

const showSuccessState = (message) => {
    if (state.loadingContainer) state.loadingContainer.style.display = 'none';
    if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'flex';
    if (state.statusElement) {
        state.statusElement.classList.remove('loading', 'error');
        state.statusElement.classList.add('success');
        state.statusText.textContent = message;
    }
    if (state.actionButtons) state.actionButtons.style.display = 'flex';
    addLog(message, 'success');
};

const showErrorState = (message, recoverable = true) => {
    if (state.loadingContainer) state.loadingContainer.style.display = 'none';
    if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'flex';
    if (state.statusElement) {
        state.statusElement.classList.remove('loading', 'success');
        state.statusElement.classList.add('error');
        state.statusText.textContent = message;
    }
    if (state.actionButtons) state.actionButtons.style.display = 'flex';
    addLog(message, 'error');
    
    // Show toast notification for errors
    toast.show(message, 'error');

    if (recoverable && reconnectAttempts < RECONNECT_ATTEMPTS) {
        toast.show(`Reconnecting (${reconnectAttempts + 1}/${RECONNECT_ATTEMPTS})...`, 'info');
        setTimeout(() => {
            reconnectAttempts++;
            initializeAvatarGreeting(getGreetingFromUrl());
        }, RECONNECT_DELAY);
    }
};

// Show loading animation in avatar container
function showAvatarLoading() {
    if (!state.avatarContainer) return;
    
    // Create or update loading animation
    let loader = state.avatarContainer.querySelector('.avatar-loader');
    
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'avatar-loader';
        loader.innerHTML = `
            <div class="avatar-spinner"></div>
            <p class="avatar-loading-text">Loading avatar...</p>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .avatar-loader {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                width: 100%;
                background-color: rgba(0, 0, 0, 0.05);
                border-radius: 8px;
            }
            .avatar-spinner {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                border: 4px solid rgba(74, 108, 247, 0.2);
                border-top: 4px solid var(--primary-color, #4a6cf7);
                animation: avatar-spin 1s linear infinite;
            }
            .avatar-loading-text {
                margin-top: 12px;
                font-weight: 500;
                color: var(--primary-color, #4a6cf7);
            }
            @keyframes avatar-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        state.avatarContainer.innerHTML = '';
        state.avatarContainer.appendChild(loader);
    }
    
    loader.style.display = 'flex';
}

function hideAvatarLoading() {
    if (!state.avatarContainer) return;
    
    const loader = state.avatarContainer.querySelector('.avatar-loader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Initialize the avatar greeting functionality
async function initializeAvatarGreeting(greetingText) {
    try {
        // Show loading animations
        showLoadingState("Initializing avatar session...");
        showAvatarLoading();
        
        // Get avatar ID from URL
        const avatarId = getAvatarIdFromUrl();
        
        // Create avatar session
        const credentials = await createAvatarSession(greetingText, avatarId);
        if (!credentials) {
            throw new Error("Failed to create avatar session");
        }
        
        // Initialize Agora
        const agoraInitialized = await initializeAgora(credentials);
        if (!agoraInitialized) {
            throw new Error("Failed to initialize Agora");
        }
        
        // The greeting will be sent automatically after the video starts playing
        // via the user-published event handler in initializeAgora
    } catch (error) {
        console.error("Error initializing avatar greeting:", error);
        hideAvatarLoading();
        showErrorState(`Error: ${error.message}`, true);
        
        // Show retry button
        const retryButton = document.createElement('button');
        retryButton.className = 'btn';
        retryButton.innerHTML = '<i class="fas fa-sync-alt"></i> Try Again';
        retryButton.onclick = () => window.location.reload();
        
        const statusContainer = document.getElementById('status-messages');
        statusContainer.appendChild(document.createElement('br'));
        statusContainer.appendChild(retryButton);
    }
}

async function createAvatarSession(greetingText, avatarId) {
    showLoadingState("Creating avatar session...");
    try {
        const response = await fetch("/.netlify/functions/create-avatar-with-socket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                avatar_id: avatarId,
                greetingText: greetingText || "Hello! Welcome to our service."
            })
        });
        
        const data = await response.json();
        
        addLog("Response from create-avatar-with-socket:", data);

        if (!response.ok) {
            throw new Error(`Netlify function error (HTTP ${response.status}): ${data.error || data.msg || response.statusText || "Unknown error from function"}`);
        }

        // Akool specific success check (code 1000)
        if (data.code !== 1000) {
            throw new Error(`Akool API Error (code ${data.code}): ${data.msg || "Unknown Akool API error"}`);
        }

        if (!data.data || !data.data._id || !data.data.credentials) {
            throw new Error("Akool API response missing expected data structure (session ID or credentials).");
        }

        // Store session ID for reference
        akoolSessionId = data.data._id;
        addLog("Avatar session created successfully with ID: " + akoolSessionId);
        
        return data.data.credentials;

    } catch (error) {
        console.error("Error creating avatar session:", error);
        showErrorState(`Error: Could not create avatar session. ${error.message}`, true);
        return null;
    }
}

async function initializeAgora(credentials) {
    if (!credentials || !credentials.agora_app_id || !credentials.agora_token || !credentials.agora_channel || !credentials.agora_uid) {
        showErrorState("Error: Agora credentials missing or incomplete.", true);
        return false;
    }
    
    showLoadingState("Initializing Agora...");
    
    try {
        // Create Agora client
        agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        
        // Enable stream messages for avatar communication
        if (typeof agoraClient.enableStreamMessage === 'function') {
            await agoraClient.enableStreamMessage(true);
            addLog("Agora stream messaging enabled.");
        }
        
        // Join the Agora channel
        const uid = await agoraClient.join(
            credentials.agora_app_id,
            credentials.agora_channel,
            credentials.agora_token,
            credentials.agora_uid
        );
        
        addLog(`Successfully joined Agora channel with UID: ${uid}`);
        showLoadingState("Avatar connected. Waiting for stream...");
        
        // Handle remote user published event
        agoraClient.on("user-published", async (user, mediaType) => {
            addLog(`Remote user ${user.uid} published: ${mediaType}`);
            
            try {
                await agoraClient.subscribe(user, mediaType);
                
                if (mediaType === "video") {
                    remoteUser = user;
                    const remoteVideoTrack = user.videoTrack;
                    const playerContainer = state.avatarContainer;
                    
                    if (playerContainer) {
                        // Hide loading animation
                        hideAvatarLoading();
                        
                        playerContainer.innerHTML = ""; // Clear previous content
                        remoteVideoTrack.play(playerContainer);
                        addLog("Avatar video stream playing.");
                        showSuccessState("Avatar is live! Preparing your greeting...");
                        toast.show("Avatar connected successfully!", "success");
                        
                        // Wait before sending greeting
                        setTimeout(() => {
                            const greetingText = getGreetingFromUrl();
                            if (greetingText) {
                                pushMessageToAvatar(greetingText);
                            }
                        }, GREETING_DELAY_MS);
                    }
                } else if (mediaType === "audio") {
                    const remoteAudioTrack = user.audioTrack;
                    remoteAudioTrack.play();
                    addLog("Avatar audio stream playing.");
                }
            } catch (error) {
                console.error("Error handling published stream:", error);
                showErrorState(`Error: ${error.message}`, true);
            }
        });
        
        return true;
        
    } catch (error) {
        console.error("Error initializing Agora:", error);
        showErrorState(`Error initializing Agora: ${error.message}`, true);
        return false;
    }
}

async function pushMessageToAvatar(text) {
    if (!akoolSessionId) {
        showErrorState("Error: No active avatar session.", true);
        return;
    }
    
    if (!text) {
        showErrorState("No greeting text provided.", true);
        return;
    }
    
    showLoadingState(`Sending greeting: "${text}"`);
    
    try {
        // Try WebSocket first if available
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            const message = {
                type: "text",
                text: text,
                interrupt: false
            };
            wsConnection.send(JSON.stringify(message));
            addLog("Message sent via WebSocket");
        } 
        // Fallback to HTTP if WebSocket is not available
        else {
            addLog("WebSocket not available, falling back to HTTP");
            const response = await fetch("/.netlify/functions/push-avatar-message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    session_id: akoolSessionId, 
                    text: text, 
                    type: "text", 
                    interrupt: false 
                })
            });
            
            if (!response.ok) {
                const data = await response.json();
                addLog("Push response:", data);
                throw new Error(`HTTP Error ${response.status}: ${data.error || response.statusText}`);
            }
            
            addLog("Message sent through fallback method.");
        }
        
        showSuccessState("Greeting sent to avatar. Waiting for response...");
    } catch (error) {
        console.error("Error sending message to avatar:", error);
        showErrorState(`Error: Could not send greeting. ${error.message}`, true);
    }
}

function getGreetingFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const name = urlParams.get('name') || 'there';
    const details = urlParams.get('details') || '';
    const avatarId = getAvatarIdFromUrl();
    const avatarInfo = AKOOL_AVATARS[avatarId] || AKOOL_AVATARS["dvp_Tristan_cloth2_1080P"];
    
    // Create a more personalized greeting with the avatar's name
    let greetingText = `Hello ${name}! I'm ${avatarInfo.name}.`;
    
    if (details) {
        greetingText += ` I see you're interested in ${details}.`;
    }
    
    greetingText += ` Welcome to our service. How can I assist you today?`;
    
    return greetingText;
}

// Helper functions for UI updates
function addLog(message, isError = false) {
    const logEntries = state.logEntries;
    if (!logEntries) return;
    
    const messageString = (typeof message === "object") ? JSON.stringify(message) : message;
    console.log(messageString);
    
    const logEntry = document.createElement("div");
    logEntry.className = 'log-entry' + (isError ? ' log-error' : '');
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${messageString}`;
    
    logEntries.appendChild(logEntry);
    logEntries.scrollTop = logEntries.scrollHeight;
    
    if (isError) {
        console.error(messageString);
    }
}

// Control listening indicator visibility
function setListeningIndicator(isListening) {
    const indicator = document.querySelector('.listening-indicator');
    if (!indicator) return;
    
    if (isListening) {
        indicator.classList.add('active');
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
        indicator.classList.remove('active');
    }
}

// Initialize when the greeting page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize toast system
    toast.init();
    
    // Cache DOM elements
    state.avatarContainer = document.getElementById('avatar-container');
    state.loadingContainer = document.getElementById('loading-container');
    state.avatarPlaceholder = document.getElementById('avatar-placeholder');
    state.statusElement = document.getElementById('status-messages');
    state.statusText = document.querySelector('.status-message-text');
    state.actionButtons = document.getElementById('action-buttons');
    state.logEntries = document.getElementById('log-entries');
    
    // Add voice input button for interactive speech
    if (state.actionButtons) {
        const speakBtn = document.createElement('button');
        speakBtn.id = 'speak-button';
        speakBtn.className = 'btn';
        speakBtn.innerHTML = '<i class="fas fa-microphone"></i> Speak';
        state.actionButtons.appendChild(speakBtn);

        // Web Speech API support
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            try {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.lang = 'en-US';
                recognition.interimResults = false;
                recognition.maxAlternatives = 1;

                // Start recognition immediately for a natural conversation
                recognition.start();
                showLoadingState("Listening for your voice...");
                setListeningIndicator(true);

                // Restart on end to keep listening continuously
                recognition.onend = () => recognition.start();

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript.trim();
                    addLog("Recognized speech: " + transcript);
                    setListeningIndicator(false);
                    showLoadingState("You said: " + transcript);
                    pushMessageToAvatar(transcript);
                };

                // Only show errors that aren't "no-speech" (which is a normal timeout)
                recognition.onerror = (event) => {
                    // Only show errors that aren't "no-speech" (which is a normal timeout)
                    if (event.error !== 'no-speech') {
                        // Log but don't display to user for technical errors
                        if (event.error === 'network' || event.error === 'aborted') {
                            addLog("Speech recognition issue: " + event.error, true);
                            // Restart recognition after network errors
                            setTimeout(() => recognition.start(), 1000);
                        } else {
                            // Show other errors to user
                            showErrorState("Speech recognition error: " + event.error, true);
                        }
                    } else {
                        // For no-speech, just log it and continue listening
                        addLog("No speech detected, continuing to listen...");
                        
                        // Visual feedback that we're still listening
                        const statusText = document.querySelector('.status-message-text');
                        if (statusText) {
                            statusText.textContent = "Listening...";
                            
                            // Briefly flash the status to indicate active listening
                            statusText.style.opacity = "0.7";
                            setTimeout(() => {
                                statusText.style.opacity = "1";
                            }, 500);
                        }
                    }
                };

                // Hide manual start button since recognition is auto-started
                speakBtn.style.display = 'none';
            } catch (error) {
                addLog(`Speech recognition initialization error: ${error.message}`, true);
                // Show the manual button as fallback if auto-start fails
                speakBtn.addEventListener('click', () => {
                    try {
                        const recognition = new SpeechRecognition();
                        recognition.start();
                        showLoadingState("Listening...");
                    } catch (err) {
                        showErrorState("Could not start speech recognition: " + err.message);
                    }
                });
            }
        } else {
            // Hide the button if not supported
            speakBtn.style.display = 'none';
        }
    }
    
    if (!state.avatarContainer) return;
    
    // Get greeting text from URL
    const greetingText = getGreetingFromUrl();
    const greetingElement = document.getElementById('greeting-text');
    if (greetingElement) {
        greetingElement.textContent = greetingText;
    }
    
    // Initialize connection
    initializeAvatarGreeting(greetingText);
    
    // Handle tab visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !isConnected) {
            addLog('Regaining visibility - attempting reconnect...');
            initializeAvatarGreeting(greetingText);
        }
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (akoolSessionId) {
        // Notify backend to end the Akool session
        const payload = JSON.stringify({ session_id: akoolSessionId });
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/.netlify/functions/end-avatar-session', payload);
        } else {
            fetch('/.netlify/functions/end-avatar-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
        }
        addLog("Requested session end for " + akoolSessionId);
    }
    if (agoraClient) {
        agoraClient.leave();
        addLog("Left Agora channel.");
    }
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
    }
});
