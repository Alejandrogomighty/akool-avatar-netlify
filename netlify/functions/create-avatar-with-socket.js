require('dotenv').config();
const fetch = require('node-fetch');
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

// List of allowed avatar IDs
const ALLOWED_AVATARS = [
    "dvp_Tristan_cloth2_1080P",
    "dvp_Emma_cloth2_1080P",
    "dvp_Sarah_cloth2_1080P",
    "dvp_Michael_cloth2_1080P"
];

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
        const requestedAvatarId = payload.avatar_id || "dvp_Tristan_cloth2_1080P";
        
        // Create a list of avatars to try, starting with the requested one
        let avatarsToTry = [requestedAvatarId];
        
        // Add other avatars as fallbacks, but don't duplicate the requested one
        ALLOWED_AVATARS.forEach(avatarId => {
            if (avatarId !== requestedAvatarId) {
                avatarsToTry.push(avatarId);
            }
        });
        
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
        const sessionDuration = (process.env.NODE_ENV === 'development') ? 60 : 3600;

        // Try each avatar in the list until one works
        let lastError = null;
        let data = null;
        
        for (const avatarId of avatarsToTry) {
            try {
                console.log(`Trying to create session with avatar: ${avatarId}`);
                
                const response = await fetch('https://openapi.akool.com/api/open/v4/liveAvatar/session/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}` // Use the fetched token
                    },
                    body: JSON.stringify({
                        avatar_id: avatarId,
                        duration: sessionDuration // session duration in seconds
                    })
                });
                
                // Parse the API response
                data = await response.json();
                
                // Check for successful response from the Akool API
                if (data.code === 1000) {
                    console.log(`Successfully created session with avatar: ${avatarId}`);
                    
                    // If the avatar we used is different from what was requested, inform the client
                    if (avatarId !== requestedAvatarId) {
                        data.fallback_used = true;
                        data.original_avatar_id = requestedAvatarId;
                        data.msg = `Requested avatar was busy. Using ${avatarId} instead.`;
                    }
                    
                    // Store the greeting message with the session for later use
                    data.data.greetingText = greetingText;
                    
                    // Return the session data to the client
                    return {
                        statusCode: 200,
                        headers: corsHeaders,
                        body: JSON.stringify(data)
                    };
                }
                
                // If the avatar is busy (code 1218), try the next one
                if (data.code === 1218) {
                    console.log(`Avatar ${avatarId} is busy, trying next option...`);
                    lastError = data;
                    continue;
                }
                
                // For any other error, return it immediately
                console.error('Akool API error:', data);
                return {
                    statusCode: 502,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        code: data.code,
                        msg: data.msg || 'Error from the Akool API',
                        error: 'Failed to create avatar session with Akool'
                    })
                };
            } catch (error) {
                console.error(`Error trying avatar ${avatarId}:`, error);
                lastError = { 
                    code: 1500, 
                    msg: error.message || 'Unknown error' 
                };
            }
        }
        
        // If we reach here, all avatars were busy or failed
        console.error('All avatars are busy or unavailable:', lastError);
        return {
            statusCode: 502,
            headers: corsHeaders,
            body: JSON.stringify({
                code: lastError?.code || 1218,
                msg: lastError?.msg || 'All avatars are currently busy. Please try again later.',
                error: 'All avatars are currently busy',
                tried_avatars: avatarsToTry
            })
        };
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
