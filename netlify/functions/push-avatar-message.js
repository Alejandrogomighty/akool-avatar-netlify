exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { session_id, text, type = "text", interrupt = false } = JSON.parse(event.body);
    const AKOOL_CLIENT_ID = process.env.AKOOL_CLIENT_ID;
    const AKOOL_CLIENT_SECRET = process.env.AKOOL_CLIENT_SECRET;

    if (!AKOOL_CLIENT_ID || !AKOOL_CLIENT_SECRET) {
        console.error("Akool Client ID or Client Secret environment variables are not configured.");
        return { statusCode: 500, body: JSON.stringify({ error: "Akool client credentials are not configured." }) };
    }

    if (!session_id || !text) {
        return { statusCode: 400, body: JSON.stringify({ error: "session_id and text are required." }) };
    }

    let accessToken = null;
    try {
        const tokenResponse = await fetch("https://openapi.akool.com/api/open/v3/getToken", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: AKOOL_CLIENT_ID, clientSecret: AKOOL_CLIENT_SECRET })
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.data || !tokenData.data.access_token) {
            console.error("Failed to get Akool access token:", JSON.stringify(tokenData));
            return { statusCode: tokenResponse.status, body: JSON.stringify({ error: "Failed to obtain Akool access token.", details: tokenData }) };
        }
        accessToken = tokenData.data.access_token;
        console.log("Successfully obtained Akool access token for push message.");
    } catch (error) {
        console.error("Error obtaining Akool access token for push message:", error.toString());
        return { statusCode: 500, body: JSON.stringify({ error: "Error obtaining Akool access token for push message.", details: error.message }) };
    }

    try {
        const response = await fetch("https://openapi.akool.com/api/open/v4/liveAvatar/session/push", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id, type, text, interrupt })
        });

        const data = await response.json();

        if (!response.ok) {
            // The previous 404 error might have been due to the token, but let's keep robust logging
            console.error("Akool API Error (push-message):", JSON.stringify(data));
            return { statusCode: response.status, body: JSON.stringify(data) };
        }
        
        // Check for Akool's specific success codes if applicable for push, e.g., data.code === 1000 or data.status === 200
        // For now, assuming a 2xx HTTP response from our function and Akool's API means success if no specific error code is in data.
        // The previous log showed {"status":404,"msg":"Not Found"}, so a successful response should be different.
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Error pushing message to Akool session with new token:", error.toString());
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to push message to Akool session with new token.", details: error.message })
        };
    }
};
