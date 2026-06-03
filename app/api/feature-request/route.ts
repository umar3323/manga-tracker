import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  try {
    const { title, description, category } = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const sheetId   = process.env.GOOGLE_SHEET_ID
    const email     = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const key       = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

    if (!sheetId || !email || !key) {
      return NextResponse.json({ error: 'Google Sheets not configured' }, { status: 500 })
    }

    const auth = new google.auth.JWT({
      email,
      key,
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
    console.error('[feature-request]', err)
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 })
  }
}
