
# Syncora - Technical Architecture
## 1. Tech Stack
| Category | Technology |
|----------|------------|
| Framework | React + Vite |
| Language | JavaScript |
| Styling | Tailwind CSS |
| Routing | React Router |
| Charts | Recharts |
| Icons | Lucide React |
| Build Tool | Vite |

## 2. File Structure
```
btechproject/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Page components
│   ├── services/         # API service layer
│   ├── context/          # React context (e.g., AuthContext)
│   ├── hooks/            # Custom hooks
│   ├── utils/            # Utilities
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
├── package.json
└── vite.config.js
```

## 3. Data Structures
### Meeting
```javascript
{
  id: string
  title: string
  date: string (ISO 8601)
  duration: number (minutes)
  status: 'processing' | 'ready' | 'failed'
  failureReason?: string
  summary: string
  actionItems: Array<{
    id: string
    text: string
    owner: { name: string, initials: string }
    dueDate: string
    completed: boolean
  }>
  keyDecisions: Array<{ id: string, text: string }>
  transcript: string
}
```

### Message (Chat)
```javascript
{
  id: string
  role: 'user' | 'assistant'
  text: string
  sources?: Array<{ meetingId: string, meetingTitle: string }>
  timestamp: string
}
```

## 4. API Layer
- All API calls go through /src/services/api.js
- Mock data is used for now
- Real endpoints can be swapped easily later

## 5. Key Technical Decisions
- Dark theme only, no toggle
- Left sidebar navigation, top bar for page title
- Modular, reusable components
- Generous whitespace, minimalistic design
