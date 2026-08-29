
# Syncora - Product Requirements Document
## 1. Product Overview
Syncora is an AI-powered meeting intelligence platform that transforms meeting recordings into actionable insights. The platform transcribes audio/video recordings, generates summaries, extracts action items and key decisions, and enables natural language search across meeting history.

### Purpose
To help teams efficiently manage and leverage the content of their meetings, saving time and ensuring important decisions and follow-ups are tracked.
### Target Audience
Teams and organizations that conduct regular meetings and want to extract maximum value from meeting recordings.

## 2. Core Features
### 2.1 User Roles
| Role | Registration Method | Core Permissions |
|------|---------------------|-------------------|
| Regular User | Email/Password or Google | Upload meetings, view dashboard, meeting details, search/chat across meetings, access settings |

### 2.2 Feature Modules
#### Landing/Login Page
- Centered auth card with email/password fields
- "Continue with Google" placeholder button
- Syncora logo and tagline
#### Dashboard (Home After Login)
- List/grid of past meetings with status indicators ("Processing" / "Ready" / "Failed")
- Prominent "Upload Meeting" button/dropzone
- Stats row (total meetings, pending action items, hours saved)
- Onboarding empty state if no meetings
#### Upload Flow
- Drag-and-drop area for audio/video files (mp3, wav, mp4, mov)
- Max file size: 500MB
- Upload progress indicator
- Processing state step indicator (transcribing → summarizing → ready) with estimated time remaining
#### Meeting Detail Page
- AI-generated summary
- Action items with owner, due date, status (empty state if none)
- Key decisions (empty state if none)
- Chatbot interface for specific meeting questions (shows "I couldn't find anything relevant" if no answer)
- Audio/video player
- Collapsible raw transcript
#### Global Search/Chatbot Page
- Chat interface for querying all past meetings
- Meeting citations in chat responses
- Shows "I couldn't find anything relevant" if no answer
#### Settings Page
- Profile info
- Team/org management placeholder (non-functional)

## 3. Non-Functional Requirements
- Supported upload formats: mp3, wav, mp4, mov
- Max file size: 500MB
- Language: English only
- Show estimated time remaining during processing (mock)
- No silent failures; all errors show messages with retry options

## 4. Error & Empty States
- Meeting status: 'processing' | 'ready' | 'failed'
- Upload failure: show inline error + retry
- Processing failure: mark as "Failed" with reason + retry on card
- No action items/decisions: friendly empty state
- No chat answer: "I couldn't find anything relevant"
- No meetings on dashboard: onboarding empty state

## 5. Out of Scope
- Team/org management (only visual placeholder)
- Real-time/live in-meeting transcription
- Native mobile apps
- Multilingual transcription
- Third-party integrations
- Speaker emotion/sentiment analytics

## 6. User Flows
### Main User Flows
1. **Landing → Login → Dashboard → Upload Meeting → View Meeting Detail → Chat with Meeting → Search Across All Meetings**
2. **Landing → Login → Dashboard → Settings**

## 7. UI/UX Requirements
### Design System
- Theme: Dark only
- Color palette: Deep charcoal (#0A0A0B background, dark gray cards, soft teal accent)
- Typography: Clean sans-serif (Inter)
- Layout: Left sidebar navigation + top bar
- Responsive: Desktop-first, tablet support
- Interactions: Subtle hover states, smooth transitions

### Key Pages
1. Landing/Login: Simple centered auth card
2. Dashboard: Clean grid/list of meetings, stats, upload button
3. Upload Flow: Drag-drop, progress steps
4. Meeting Detail: Split layout summary/action items + chat
5. Global Chat: Chat bubbles, citations
6. Settings: Profile, team placeholders
