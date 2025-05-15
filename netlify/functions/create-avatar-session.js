exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { avatar_id } = JSON.parse(event.body);
    const AKOOL_CLIENT_ID = process.env.AKOOL_CLIENT_ID;
    const AKOOL_CLIENT_SECRET = process.env.AKOOL_CLIENT_SECRET;

    if (!AKOOL_CLIENT_ID || !AKOOL_CLIENT_SECRET) {
        console.error("Akool Client ID or Client Secret environment variables are not configured.");
        return { statusCode: 500, body: JSON.stringify({ error: "Akool client credentials are not configured." }) };
    }

    if (!avatar_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "avatar_id is required." }) };
    }

    let accessToken = null;
    try {
        console.log("Attempting to get Akool access token...");
        const tokenResponse = await fetch("https://openapi.akool.com/api/open/v3/getToken", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: AKOOL_CLIENT_ID, clientSecret: AKOOL_CLIENT_SECRET })
        });
        const tokenData = await tokenResponse.json();
        console.log("Raw response from /v3/getToken:", JSON.stringify(tokenData));

        // Corrected token extraction: check for tokenData.token directly
        if (!tokenResponse.ok || !tokenData.token) { 
            console.error("Failed to get Akool access token. Response:", JSON.stringify(tokenData));
            return { statusCode: tokenResponse.status, body: JSON.stringify({ error: "Failed to obtain Akool access token.", details: tokenData }) };
        }
        accessToken = tokenData.token; // Corrected: use tokenData.token
        console.log("Successfully obtained Akool access token.");
    } catch (error) {
        console.error("Error obtaining Akool access token:", error.toString());
        return { statusCode: 500, body: JSON.stringify({ error: "Error obtaining Akool access token.", details: error.message }) };
    }

    try {
        console.log("Attempting to create Akool session with new token...");
        const response = await fetch("https://openapi.akool.com/api/open/v4/liveAvatar/session/create", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ avatar_id })
        });

        const data = await response.json();
        console.log("Raw response from /v4/liveAvatar/session/create:", JSON.stringify(data));

        if (!response.ok) {
            console.error("Akool API Error (create-session):", JSON.stringify(data));
            return { statusCode: response.status, body: JSON.stringify(data) };
        }
        
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data) 
        };
    } catch (error) {
        console.error("Error creating Akool session with new token:", error.toString());
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to create Akool session with new token.", details: error.message })
        };
    }
};
