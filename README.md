# TN Property Tax Lookup Tool

Govt portal (tnurbanepay.tn.gov.in) மூலம் property tax details fetch பண்றதுக்கான tool.

## Requirements
- Node.js (https://nodejs.org) — install பண்ணி இருக்கணும்

## Setup (ஒரே ஒரு முறை)

```bash
# 1. இந்த folder-ல் terminal திற
cd proxy-server

# 2. Server start பண்ணு
node server.js
```

Terminal-ல் இப்படி வரும்:
```
✅ TN Property Tax Proxy running at http://localhost:3000
```

## Use பண்றது

1. `server.js` run ஆகும்போது `index.html` browser-ல் திற (double-click போதும்)
2. Assessment Number போட்டு **Search** click பண்ணு
3. Real govt site-ல் இருந்து live data வரும்!

## Bulk Lookup

`index.html`-ல் கீழே "Bulk Lookup" section இருக்கு —
ஒவ்வொரு line-ல் ஒரு number போட்டு "Search All" click பண்ணா எல்லாத்தையும் fetch பண்ணும்.

## API (Direct curl)

```bash
curl -X POST http://localhost:3000/fetch-property \
     -H 'Content-Type: application/json' \
     -d '{"ref":"082/001/900540"}'
```

Response:
```json
{
  "ref": "082/001/900540",
  "found": true,
  "owner": "...",
  "payments": [
    {
      "receipt": "082/CP/24-25/0014204",
      "assessmentNo": "082/001/900540",
      "oldAssessmentNo": "082/122917",
      "receiptDate": "24-02-2025 19:00:15",
      "amount": "1971.00",
      "usage": "RESIDENTIAL",
      "status": "SUCCESS"
    }
  ]
}
```

## Files
- `server.js` — Node.js proxy (CORS bypass + govt site fetch)
- `index.html` — Govt portal UI clone (open in browser)
