import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  try {
    const { title, description, category } = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const sheetId = process.env.Google_Sheet_ID ?? process.env.GOOGLE_SHEET_ID

    // Prefer full service account JSON if available (most reliable)
    let credentials: { client_email: string; private_key: string } | null = null

    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson)
        credentials = { client_email: parsed.client_email, private_key: parsed.private_key }
      } catch { /* fall through to individual vars */ }
    }

    if (!credentials) {
      const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      let rawKey = process.env.GOOGLE_PRIVATE_KEY ?? ''
      if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
        rawKey = rawKey.slice(1, -1)
      }
      rawKey = rawKey.replace(/\\n/g, '\n').replace(/\\r/g, '')
      if (email && rawKey) credentials = { client_email: email, private_key: rawKey }
    }

    if (!sheetId || !credentials) {
      return NextResponse.json({ error: 'Google Sheets not configured — set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY' }, { status: 500 })
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { type: 'service_account', ...credentials },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })

    const sheets = google.sheets({ version: 'v4', auth })

    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'UTC', hour12: false })

    // Append a row: [Timestamp, Category, Title, Description, Status]
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp + ' UTC', category || 'General', title.trim(), description?.trim() || '', 'New']],
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[feature-request]', err)
    return NextResponse.json({ error: 'Failed to submit request', detail: msg }, { status: 500 })
  }
}
