exports.handler = async function(event, context) {
    // IMPORTANT: Your Akool API Bearer Token should be set as an environment variable in Netlify
    // named AKOOL_API_BEARER_TOKEN. Do NOT hardcode it here.
    const AKOOL_API_TOKEN = process.env.AKOOL_API_BEARER_TOKEN;
    
    // Use the provided Avatar ID, or allow it to be passed as a query parameter for flexibility
    const defaultAvatarId = "dvp_Tristan_cloth2_1080P";
    const AVATAR_ID = event.queryStringParameters && event.queryStringParameters.avatarId ? event.queryStringParameters.avatarId : defaultAvatarId;

    if (!AKOOL_API_TOKEN) {
        console.error("Akool API token not configured in environment variables.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: Akool API token not found." }),
        };
    }

    const akoolApiUrl = "https://openapi.akool.com/v4/liveAvatar/session/create";

    try {
        console.log(`Requesting Akool session for avatar_id: ${AVATAR_ID}`);
        const response = await fetch(akoolApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${AKOOL_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                avatar_id: AVATAR_ID,
                // Add any other necessary parameters for session creation as per Akool API docs
                // e.g., quality: "1080P", voice_name: "en-US-Neural2-J" if not handled by JSSDK defaults
                // For now, we assume the JSSDK or Akool defaults are sufficient for these.
            }),
        });

        const responseBodyText = await response.text(); // Read body once as text for robust parsing

        if (!response.ok) {
            console.error(`Akool API Error (Status: ${response.status}): ${responseBodyText}`);
            return {
                statusCode: response.status,
                body: JSON.stringify({ 
                    error: "Failed to create Akool session.", 
                    details: responseBodyText 
                }),
            };
        }
        
        let sessionData;
        try {
            sessionData = JSON.parse(responseBodyText); // Parse the text to JSON
        } catch (parseError) {
            console.error("Failed to parse Akool API response:", parseError);
            console.error("Raw Akool API response body:", responseBodyText);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Failed to parse Akool API response.", details: responseBodyText }),
            };
        }

        // According to Akool API docs, the successful response contains a "data" object
        // with Agora credentials (app_id, channel, token, uid, etc.)
        if (sessionData && sessionData.data) {
            console.log("Successfully created Akool session. Returning session data to client.");
            return {
                statusCode: 200,
                body: JSON.stringify(sessionData.data), 
            };
        } else {
            console.error("Akool API response does not contain expected 'data' field.", sessionData);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Unexpected response structure from Akool API.", details: sessionData }),
            };
        }

    } catch (error) {
        console.error("Error in Netlify function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error.", details: error.message }),
        };
    }
};
