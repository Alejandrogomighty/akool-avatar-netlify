require('dotenv').config();
const fetch = require('node-fetch');
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  const { session_id } = JSON.parse(event.body);
  if (!session_id) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'session_id is required.' }) };
  }

  const AKOOL_CLIENT_ID = process.env.AKOOL_CLIENT_ID;
  const AKOOL_CLIENT_SECRET = process.env.AKOOL_CLIENT_SECRET;
  if (!AKOOL_CLIENT_ID || !AKOOL_CLIENT_SECRET) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Akool credentials not configured.' }) };
  }

  try {
    // Obtain fresh access token
    const tokenRes = await fetch('https://openapi.akool.com/api/open/v3/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: AKOOL_CLIENT_ID, clientSecret: AKOOL_CLIENT_SECRET })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.token) {
      throw new Error('Failed to obtain access token');
    }
    const accessToken = tokenData.token;

    // Call end-session endpoint
    const endRes = await fetch('https://openapi.akool.com/api/open/v4/liveAvatar/session/end', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ session_id })
    });
    const endData = await endRes.json();

    if (!endRes.ok) {
      return { statusCode: endRes.status, headers: corsHeaders, body: JSON.stringify(endData) };
    }
    return { statusCode: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(endData) };

  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error ending session', details: err.message }) };
  }
}; 