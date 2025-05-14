exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST")  {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { avatar_id } = JSON.parse(event.body);
    const AKOOL_BEARER_TOKEN = process.env.AKOOL_BEARER_TOKEN;

    if (!AKOOL_BEARER_TOKEN) {
        console.error("Akool API token environment variable is not configured.");
        return { statusCode: 500, body: JSON.stringify({ error: "Akool API token is not configured." }) };
    }

    if (!avatar_id) {
        return { statusCode: 400, body: JSON.stringify({ error: "avatar_id is required." }) };
    }

    try {
        const response = await fetch("https://openapi.akool.com/api/open/v4/liveAvatar/session/create", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${AKOOL_BEARER_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ avatar_id }) 
        });

        const data = await response.json();

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
        console.error("Error creating Akool session:", error.toString());
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to create Akool session.", details: error.message })
        };
    }
};
