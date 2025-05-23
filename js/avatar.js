// Replace the hard-coded avatar ID with a function to get it from URL parameters
// const AKOOL_AVATAR_ID = "dvp_Tristan_cloth2_1080P";
// Add default avatars object for fallback and descriptions
const AKOOL_AVATARS = {
    "dvp_Tristan_cloth2_1080P": { name: "Tristan", gender: "male" },
    "dvp_Emma_cloth2_1080P": { name: "Emma", gender: "female" },
    "dvp_Sarah_cloth2_1080P": { name: "Sarah", gender: "female" },
    "dvp_Michael_cloth2_1080P": { name: "Michael", gender: "male" },
    "8dBR2uAlPd1vAg7GcQzKI": { name: "Bobby", gender: "male" }
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
    return avatarId && AKOOL_AVATARS[avatarId] ? avatarId : "8dBR2uAlPd1vAg7GcQzKI";
}

const GREETING_DELAY_MS = 3000; // 3s before sending greeting
const RECONNECT_ATTEMPTS = 5; // Increased from 3 to 5
const RECONNECT_DELAY = 3000; // Increased from 2000ms to 3000ms
const REQUEST_TIMEOUT = 20000; // Increased from 15000ms to 20000ms

// Function to create a fixed backoff delay based on attempt number
function getBackoffDelay(attempt) {
    return RECONNECT_DELAY * (attempt + 1); // Progressive backoff
}

// State Management
let akoolSessionId = null;
let agoraClient = null;
let remoteUser = null;
let wsConnection = null;
let reconnectAttempts = 0;
let isInitialized = false;
let isConnected = false;
let avatarFullyLoaded = false; // Track if avatar is fully loaded
let recognitionEnabled = false; // Track if speech recognition is enabled

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
    // Don't display loading container anymore
    // if (state.loadingContainer) state.loadingContainer.style.display = 'flex';
    // if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'none';
    
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
    // Don't display placeholders
    // if (state.loadingContainer) state.loadingContainer.style.display = 'none';
    // if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'flex';
    
    if (state.statusElement) {
        state.statusElement.classList.remove('loading', 'error');
        state.statusElement.classList.add('success');
        state.statusText.textContent = message;
    }
    if (state.actionButtons) state.actionButtons.style.display = 'flex';
    addLog(message, 'success');
};

const showErrorState = (message, recoverable = true) => {
    // Don't display placeholders
    // if (state.loadingContainer) state.loadingContainer.style.display = 'none';
    // if (state.avatarPlaceholder) state.avatarPlaceholder.style.display = 'flex';
    
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
                background-color: rgba(0, 0, 0, 0.7);
                border-radius: 8px;
                position: absolute;
                top: 0;
                left: 0;
                z-index: 100;
            }
            .avatar-spinner {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                border: 4px solid rgba(74, 108, 247, 0.3);
                border-top: 4px solid var(--primary-color, #4a6cf7);
                animation: avatar-spin 1s linear infinite;
            }
            .avatar-loading-text {
                margin-top: 16px;
                font-weight: 500;
                color: #fff;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            }
            @keyframes avatar-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes pulse {
                0% { opacity: 0.7; }
                50% { opacity: 1; }
                100% { opacity: 0.7; }
            }
            .avatar-container-wrapper {
                position: relative;
                width: 100%;
                height: 100%;
            }
            .avatar-ready-indicator {
                position: absolute;
                bottom: 16px;
                right: 16px;
                background-color: #10b981;
                color: white;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                z-index: 90;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s ease;
            }
            .avatar-ready-indicator.visible {
                opacity: 1;
                transform: translateY(0);
            }
            .avatar-ready-indicator i {
                margin-right: 6px;
            }
        `;
        document.head.appendChild(style);
        
        // Make sure the container has position relative
        state.avatarContainer.style.position = 'relative';
        state.avatarContainer.innerHTML = '';
        state.avatarContainer.appendChild(loader);
    }
    
    loader.style.display = 'flex';
}

function hideAvatarLoading() {
    if (!state.avatarContainer) return;
    
    const loader = state.avatarContainer.querySelector('.avatar-loader');
    if (loader) {
        // Fade out animation
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            
            // Show "Avatar Ready" indicator
            showAvatarReadyIndicator();
        }, 500);
    }
}

// Add a ready indicator when the avatar is fully loaded
function showAvatarReadyIndicator() {
    if (!state.avatarContainer) return;
    
    let indicator = state.avatarContainer.querySelector('.avatar-ready-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'avatar-ready-indicator';
        indicator.innerHTML = '<i class="fas fa-check-circle"></i> Avatar Ready';
        state.avatarContainer.appendChild(indicator);
    }
    
    // Make it visible with animation
    setTimeout(() => {
        indicator.classList.add('visible');
        
        // Hide after 5 seconds
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 5000);
    }, 100);
}

// Initialize the avatar greeting functionality
async function initializeAvatarGreeting(greetingText) {
    try {
        // Show loading animations
        showLoadingState("Initializing avatar session...");
        showAvatarLoading();
        
        // Get avatar ID from URL
        const avatarId = getAvatarIdFromUrl();
        
        // Create avatar session with retry logic but only for the same avatar
        let credentials = null;
        let lastError = null;
        let lastErrorCode = null;
        
        for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
            try {
                if (attempt > 0) {
                    // Don't retry immediately if avatar is busy (error code 1218)
                    if (lastErrorCode === 1218) {
                        showErrorState(`Avatar "${getAvatarName(avatarId)}" is currently busy. Please try another avatar or try again later.`, false);
                        addLog(`Not retrying busy avatar (${avatarId})`, true);
                        break;
                    }
                    
                    const delay = getBackoffDelay(attempt);
                    addLog(`Retry attempt ${attempt + 1}/${RECONNECT_ATTEMPTS} after ${delay}ms delay...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                credentials = await createAvatarSession(greetingText, avatarId);
                if (credentials) break;
            } catch (error) {
                lastError = error;
                // Check if this is an avatar busy error (code 1218)
                if (error.code === 1218) {
                    lastErrorCode = 1218;
                    showErrorState(`Avatar "${getAvatarName(avatarId)}" is currently busy. Please try another avatar or try again later.`, false);
                    addLog(`Avatar ${avatarId} is busy - not retrying`, true);
                    break;
                }
                addLog(`Attempt ${attempt + 1} failed: ${error.message}`, true);
            }
        }
        
        if (!credentials) {
            // If avatar is busy, show a specific message
            if (lastErrorCode === 1218) {
                throw new Error(`Avatar "${getAvatarName(avatarId)}" is currently busy. Please try again later or select another avatar.`);
            } else {
                throw new Error(lastError?.message || "Failed to create avatar session after multiple attempts");
            }
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
        
        // Check for avatar busy error in the message
        const isBusyError = error.message && error.message.toLowerCase().includes("busy");
        showErrorState(`Error: ${error.message}`, !isBusyError); // Only allow retry if not a busy error
        
        // Show retry button and option to try different avatar
        addChooseAvatarButton();
    }
}

// Helper function to add retry and choose avatar buttons to the UI
function addChooseAvatarButton() {
    // First add the standard retry button
    const retryButton = document.createElement('button');
    retryButton.className = 'btn';
    retryButton.style.marginRight = '10px';
    retryButton.innerHTML = '<i class="fas fa-sync-alt"></i> Try Again';
    retryButton.onclick = () => {
        // Reset reconnect attempts counter
        reconnectAttempts = 0;
        window.location.reload();
    };
    
    // Add a button to go back to avatar selection
    const chooseAvatarButton = document.createElement('button');
    chooseAvatarButton.className = 'btn';
    chooseAvatarButton.style.backgroundColor = '#4a5568';
    chooseAvatarButton.innerHTML = '<i class="fas fa-user-circle"></i> Choose Different Avatar';
    chooseAvatarButton.onclick = () => {
        window.location.href = 'index.html';
    };
    
    const statusContainer = document.getElementById('status-messages');
    if (statusContainer) {
        statusContainer.appendChild(document.createElement('br'));
        statusContainer.appendChild(retryButton);
        statusContainer.appendChild(chooseAvatarButton);
    }
}

// Helper function to get avatar name from ID
function getAvatarName(avatarId) {
    return AKOOL_AVATARS[avatarId]?.name || avatarId;
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
            const error = new Error(`Netlify function error (HTTP ${response.status}): ${data.error || data.msg || response.statusText || "Unknown error from function"}`);
            // Add the error code if available
            if (data.code) {
                error.code = data.code;
            }
            throw error;
        }

        // Akool specific success check (code 1000)
        if (data.code !== 1000) {
            const error = new Error(`Akool API Error (code ${data.code}): ${data.msg || "Unknown Akool API error"}`);
            error.code = data.code;
            throw error;
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
        showErrorState(`Error: Could not create avatar session. ${error.message}`, error.code !== 1218); // Only allow retry if not busy
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
                        // Create a wrapper for the video with positioning context
                        playerContainer.innerHTML = '<div class="avatar-container-wrapper"></div>';
                        const wrapper = playerContainer.querySelector('.avatar-container-wrapper');
                        
                        // Play the video in the wrapper
                        remoteVideoTrack.play(wrapper);
                        
                        // Wait a bit to ensure video is actually playing before hiding loader
                        setTimeout(() => {
                            // Check if video is actually playing
                            const videoElement = playerContainer.querySelector('video');
                            if (videoElement) {
                                // Listen for the video to be ready
                                videoElement.addEventListener('canplay', () => {
                                    hideAvatarLoading();
                                    avatarFullyLoaded = true;
                                    addLog("Avatar video confirmed playing and ready");
                                    showSuccessState("Avatar is ready! Preparing your greeting...");
                                    toast.show("Avatar connected successfully!", "success");
                                    
                                    // Only now initialize speech recognition
                                    initializeSpeechRecognition();
                                    
                                    // Enable any manual speech button
                                    const speakBtn = document.getElementById('speak-button');
                                    if (speakBtn) speakBtn.style.display = 'block';
                                    
                                    // Wait before sending greeting
                                    setTimeout(() => {
                                        const greetingText = getGreetingFromUrl();
                                        if (greetingText) {
                                            pushMessageToAvatar(greetingText);
                                        }
                                    }, GREETING_DELAY_MS);
                                }, { once: true });
                                
                                // Fallback in case canplay doesn't fire
                                setTimeout(() => {
                                    if (!avatarFullyLoaded) {
                                        hideAvatarLoading();
                                        avatarFullyLoaded = true;
                                        addLog("Avatar video ready (fallback timer)");
                                        showSuccessState("Avatar is live! Preparing your greeting...");
                                        
                                        // Initialize speech recognition
                                        initializeSpeechRecognition();
                                        
                                        // Wait before sending greeting
                                        setTimeout(() => {
                                            const greetingText = getGreetingFromUrl();
                                            if (greetingText) {
                                                pushMessageToAvatar(greetingText);
                                            }
                                        }, GREETING_DELAY_MS);
                                    }
                                }, 3000);
                            } else {
                                addLog("Video element not found after play", true);
                                hideAvatarLoading();
                            }
                        }, 1000);
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

// Initialize Web Speech API for speech recognition
function initializeSpeechRecognition() {
    // Only start if avatar is loaded and recognition not already enabled
    if (!avatarFullyLoaded || recognitionEnabled) {
        addLog("Speech recognition not started - avatar not ready or already enabled");
        return;
    }
    
    addLog("Initializing speech recognition now that avatar is ready");
    
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.lang = 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            // Start recognition
            recognition.start();
            recognitionEnabled = true;
            showLoadingState("Listening for your voice...");
            setListeningIndicator(true);
            addLog("Speech recognition started successfully");

            // Restart on end to keep listening continuously
            recognition.onend = () => {
                if (avatarFullyLoaded) {
                    recognition.start();
                    addLog("Restarted speech recognition");
                } else {
                    addLog("Not restarting speech recognition - avatar not ready");
                }
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.trim();
                addLog("Recognized speech: " + transcript);
                setListeningIndicator(false);
                showLoadingState("You said: " + transcript);
                pushMessageToAvatar(transcript);
            };

            recognition.onerror = (event) => {
                // Only show errors that aren't "no-speech" (which is a normal timeout)
                if (event.error !== 'no-speech') {
                    // Log but don't display to user for technical errors
                    if (event.error === 'network' || event.error === 'aborted') {
                        addLog("Speech recognition issue: " + event.error, true);
                        // Restart recognition after network errors
                        setTimeout(() => {
                            if (avatarFullyLoaded) recognition.start();
                        }, 1000);
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
            
            // Add a manual button to restart if needed
            addManualSpeechButton();
            
        } catch (error) {
            addLog(`Speech recognition initialization error: ${error.message}`, true);
            // Show manual start button as fallback
            addManualSpeechButton();
        }
    } else {
        addLog("Speech recognition not supported in this browser", true);
    }
}

// Add manual button to start speech recognition
function addManualSpeechButton() {
    if (!state.actionButtons) return;
    
    // Check if button already exists
    if (document.getElementById('speak-button')) return;
    
    const speakBtn = document.createElement('button');
    speakBtn.id = 'speak-button';
    speakBtn.className = 'btn';
    speakBtn.innerHTML = '<i class="fas fa-microphone"></i> Start Speaking';
    speakBtn.style.display = avatarFullyLoaded ? 'block' : 'none';
    
    speakBtn.addEventListener('click', () => {
        try {
            if (recognitionEnabled) return;
            
            if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.lang = 'en-US';
                recognition.start();
                recognitionEnabled = true;
                showLoadingState("Listening...");
                setListeningIndicator(true);
                addLog("Speech recognition started manually");
            }
        } catch (err) {
            showErrorState("Could not start speech recognition: " + err.message);
        }
    });
    
    state.actionButtons.appendChild(speakBtn);
}
