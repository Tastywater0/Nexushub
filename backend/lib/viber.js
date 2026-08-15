// ═══════════════════════════════════════════════════════════════
// NexusHub Viber Bot Helper
// Sends notifications to branch managers via Viber Bot API
// ═══════════════════════════════════════════════════════════════

/**
 * Sends a text message alert to the Viber operations group chat.
 * @param {string} text - Message content to send
 * @returns {Promise<object|null>} JSON response from Viber API or null if disabled
 */
export async function sendViberAlert(text) {
  const token = process.env.VIBER_BOT_TOKEN
  const groupId = process.env.VIBER_GROUP_ID

  if (!token || !groupId) {
    console.warn('VIBER_BOT_TOKEN or VIBER_GROUP_ID is not configured. Skipping Viber notification.')
    return null
  }

  try {
    const res = await fetch('https://chatapi.viber.com/pa/send_message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token
      },
      body: JSON.stringify({
        receiver: groupId,
        min_api_version: 1,
        sender: {
          name: 'NexusHub Alerts'
        },
        type: 'text',
        text: text
      })
    })

    const body = await res.json()
    if (!res.ok || body.status !== 0) {
      throw new Error(`Viber API error status ${body.status}: ${body.status_message || 'Unknown error'}`)
    }

    return body
  } catch (err) {
    console.error('Failed to send Viber message:', err.message)
    // We do not crash the request; log the error and allow execution to continue
    return null
  }
}
