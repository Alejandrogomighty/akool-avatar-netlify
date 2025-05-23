require('dotenv').config();
const fetch = require('node-fetch');
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

// List of allowed avatar IDs
const ALLOWED_AVATARS = [
    "8dBR2uAlPd1vAg7GcQzKI", // Put Bobby first to prioritize it
    "dvp_Tristan_cloth2_1080P",
    "dvp_Emma_cloth2_1080P",
    "dvp_Sarah_cloth2_1080P",
    "dvp_Michael_cloth2_1080P"
];

// Increased timeout for API calls
const API_TIMEOUT_MS = 15000;

exports.handler = async function(event, context) {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    // Only accept POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ 
                code: 1100,
                msg: 'Method Not Allowed',
                error: 'Only POST requests are accepted'
            })
        };
    }

    try {
        // Parse the request body
        const payload = JSON.parse(event.body);
        
        // Get the requested avatar ID with fallback to default
        const requestedAvatarId = payload.avatar_id || "8dBR2uAlPd1vAg7GcQzKI";
        
        // Check if the requested avatar is in the allowed list
        if (!ALLOWED_AVATARS.includes(requestedAvatarId)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    code: 1003,
                    msg: 'Invalid avatar ID requested',
                    error: 'The requested avatar ID is not allowed'
                })
            };
        }
        
        // Get greeting message from the payload
        const greetingText = payload.greetingText || "Hello! Welcome to our service.";
        
        // Get Akool API credentials from environment variables
        const AKOOL_CLIENT_ID = process.env.AKOOL_CLIENT_ID;
        const AKOOL_CLIENT_SECRET = process.env.AKOOL_CLIENT_SECRET;
        
        // Validate Akool API credentials
        if (!AKOOL_CLIENT_ID || !AKOOL_CLIENT_SECRET) {
            console.error('Akool API credentials missing');
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({
                    code: 1110,
                    msg: 'Server Configuration Error',
                    error: 'Akool API credentials are missing'
                })
            };
        }

        // Get access token
        let accessToken = null;
        try {
            const tokenResponse = await fetch("https://openapi.akool.com/api/open/v3/getToken", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId: AKOOL_CLIENT_ID, clientSecret: AKOOL_CLIENT_SECRET })
            });
            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok || !tokenData.token) {
                console.error("Failed to get Akool access token:", tokenData);
                return { 
                    statusCode: tokenResponse.status || 502, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ 
                        error: "Failed to obtain Akool access token", 
                        details: tokenData,
                        code: 1101 
                    }) 
                };
            }
            accessToken = tokenData.token;
        } catch (error) {
            console.error("Error obtaining Akool access token:", error);
            return { 
                statusCode: 500, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "Error obtaining Akool access token", 
                    details: error.message,
                    code: 1500
                }) 
            };
        }
        
        // Determine session duration (shorter in development to prevent busy avatars)
        const sessionDuration = (process.env.NODE_ENV === 'development') ? 60 : 1800; // Reduced from 3600 to 1800

        // Try only the requested avatar without fallbacks
        try {
            console.log(`Trying to create session with avatar: ${requestedAvatarId}`);
            
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Akool API timeout')), API_TIMEOUT_MS));
            
            // Create the API call promise
            const apiCallPromise = fetch('https://openapi.akool.com/api/open/v4/liveAvatar/session/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    avatar_id: requestedAvatarId,
                    duration: sessionDuration
                })
            });
            
            // Race the API call against the timeout
            const response = await Promise.race([apiCallPromise, timeoutPromise]);
            
            // Parse the API response
            const data = await response.json();
            
            // Check for successful response from the Akool API
            if (data.code === 1000) {
                console.log(`Successfully created session with avatar: ${requestedAvatarId}`);
                
                // Store the greeting message with the session for later use
                data.data.greetingText = greetingText;
                
                // Return the session data to the client
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(data)
                };
            }
            
            // If the avatar is busy or any other error, return the exact error to the client
            console.error('Akool API error:', data);
            return {
                statusCode: data.code === 1218 ? 503 : 502, // 503 Service Unavailable for busy avatar
                headers: corsHeaders,
                body: JSON.stringify({
                    code: data.code,
                    msg: data.msg || 'Error from the Akool API',
                    error: data.code === 1218 ? 
                        `The avatar "${requestedAvatarId}" is currently busy. Please try again later.` : 
                        'Failed to create avatar session with Akool',
                    avatar_id: requestedAvatarId
                })
            };
            
        } catch (error) {
            console.error(`Error trying avatar ${requestedAvatarId}:`, error);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    code: 1500, 
                    msg: error.message || 'Unknown error',
                    avatar_id: requestedAvatarId
                })
            };
        }
        
    } catch (error) {
        console.error('Error creating avatar session:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                code: 1500,
                msg: 'Server Error',
                error: error.message || 'An unknown error occurred'
            })
        };
    }
};
