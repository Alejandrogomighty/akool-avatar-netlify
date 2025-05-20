const fetch = require('node-fetch');
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event, context) {
    // Handle CORS preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    try {
        const { session_id, text, type = "text", interrupt = false } = JSON.parse(event.body);
        const AKOOL_CLIENT_ID = process.env.AKOOL_CLIENT_ID;
        const AKOOL_CLIENT_SECRET = process.env.AKOOL_CLIENT_SECRET;

        // Validate required inputs
        if (!session_id) {
            return { 
                statusCode: 400, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "session_id is required", 
                    code: 1003 
                }) 
            };
        }

        if (!text) {
            return { 
                statusCode: 400, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "text message is required", 
                    code: 1003 
                }) 
            };
        }

        // Validate API credentials
        if (!AKOOL_CLIENT_ID || !AKOOL_CLIENT_SECRET) {
            console.error("Akool Client ID or Client Secret environment variables are not configured.");
            return { 
                statusCode: 500, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "Akool API credentials not configured", 
                    code: 1110 
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

        // Push message to Akool Session
        try {
            // Create stream message
            const streamMessage = {
                v: 2,
                type: "chat",
                mid: `msg-${Date.now()}`,
                idx: 0,
                fin: true,
                pld: {
                    text: text
                }
            };

            // Send message
            const response = await fetch(`https://openapi.akool.com/api/open/v4/liveAvatar/stream/message?id=${session_id}`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(streamMessage)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("Akool API Error (push-message):", data);
                return { 
                    statusCode: response.status || 502, 
                    headers: corsHeaders, 
                    body: JSON.stringify({ 
                        error: "Error pushing message to avatar", 
                        details: data,
                        code: data.code || 1502
                    }) 
                };
            }

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(data)
            };
        } catch (error) {
            console.error("Error pushing message to avatar:", error);
            return { 
                statusCode: 500, 
                headers: corsHeaders, 
                body: JSON.stringify({ 
                    error: "Failed to push message to avatar", 
                    details: error.message,
                    code: 1500
                }) 
            };
        }
    } catch (error) {
        console.error("Unexpected error in push-avatar-message:", error);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ 
                error: "Unexpected server error", 
                details: error.message,
                code: 1500
            }) 
        };
    }
};
