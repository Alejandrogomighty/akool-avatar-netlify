exports.handler = async function(event, context) {
    const AKOOL_API_TOKEN = process.env.AKOOL_API_BEARER_TOKEN;
    const defaultAvatarId = "dvp_Tristan_cloth2_1080P";
    const AVATAR_ID = event.queryStringParameters && event.queryStringParameters.avatarId ? event.queryStringParameters.avatarId : defaultAvatarId;

    if (!AKOOL_API_TOKEN) {
        console.error("Akool API token not configured in environment variables.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: Akool API token not found." }),
        };
    }

    // UPDATED Akool API URL
    const akoolApiUrl = "https://openapi.akool.com/v1/liveAvatar/agora/acquire";

    try {
        console.log(`Requesting Akool session for avatar_id: ${AVATAR_ID} from endpoint: ${akoolApiUrl}`) ;
        const response = await fetch(akoolApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${AKOOL_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                avatar_id: AVATAR_ID,
            }),
        });

        const responseBodyText = await response.text();

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
            sessionData = JSON.parse(responseBodyText);
        } catch (parseError) {
            console.error("Failed to parse Akool API response:", parseError);
            console.error("Raw Akool API response body:", responseBodyText);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Failed to parse Akool API response.", details: responseBodyText }),
            };
        }

        // The v1/liveAvatar/agora/acquire endpoint might return the data directly, or within a "data" field.
        // We will assume for now it returns the credentials object directly as per some JSSDK examples.
        // If it's nested under "data", we'll adjust.
        if (sessionData && sessionData.app_id) { // Check for a key field like app_id to validate structure
            console.log("Successfully created Akool session. Returning session data to client.");
            return {
                statusCode: 200,
                body: JSON.stringify(sessionData), 
            };
        } else if (sessionData && sessionData.data && sessionData.data.app_id) { // Check if nested under data
             console.log("Successfully created Akool session (data nested). Returning session data to client.");
            return {
                statusCode: 200,
                body: JSON.stringify(sessionData.data), 
            };
        }else {
            console.error("Akool API response does not contain expected session credential fields.", sessionData);
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
