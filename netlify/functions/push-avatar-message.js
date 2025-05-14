const fetch = require("node-fetch");

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { session_id, text, type = "text", interrupt = false } = JSON.parse(event.body);
    const AKOOL_BEARER_TOKEN = process.env.AKOOL_BEARER_TOKEN;

    if (!AKOOL_BEARER_TOKEN) {
        return { statusCode: 500, body: JSON.stringify({ error: "Akool API token is not configured." }) };
    }

    if (!session_id || !text) {
        return { statusCode: 400, body: JSON.stringify({ error: "session_id and text are required." }) };
    }

    try {
        const response = await fetch("https://openapi.akool.com/api/open/v4/liveAvatar/session/push", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${AKOOL_BEARER_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ session_id, type, text, interrupt })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Akool API Error (push-message):", data);
            return { statusCode: response.status, body: JSON.stringify(data) };
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Error pushing message to Akool session:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to push message to Akool session.", details: error.message })
        };
    }
};

