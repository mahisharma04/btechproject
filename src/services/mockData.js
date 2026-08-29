export const mockMeetings = [
  {
    id: '1',
    title: 'Q3 Planning Sync',
    date: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    duration: 60,
    status: 'ready',
    summary: "We discussed the Q3 roadmap and aligned on key priorities. The main focus areas are improving user onboarding, launching the new dashboard, and expanding our integrations. We also reviewed budget allocation and resource planning for the quarter.",
    actionItems: [
      { id: 'a1', text: 'Finalize onboarding flow wireframes', owner: { name: 'Alex Johnson', initials: 'AJ' }, dueDate: '2026-08-01', completed: false },
      { id: 'a2', text: 'Prepare budget proposal for new hires', owner: { name: 'Sam Lee', initials: 'SL' }, dueDate: '2026-07-28', completed: true },
      { id: 'a3', text: 'Schedule integration kickoff meeting', owner: { name: 'Taylor Kim', initials: 'TK' }, dueDate: '2026-07-30', completed: false }
    ],
    keyDecisions: [
      { id: 'd1', text: 'Prioritize dashboard launch over mobile app' },
      { id: 'd2', text: 'Allocate 20% of engineering time to technical debt' }
    ],
    transcript: "Alex: Okay, let's start the Q3 planning sync... Sam: I think we should prioritize the dashboard... Taylor: I agree, let's focus on that first..."
  },
  {
    id: '2',
    title: 'Product Sprint Review',
    date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    duration: 45,
    status: 'ready',
    summary: "We reviewed the sprint progress and demoed the new features. Most items are on track, with a few needing some extra time. We discussed feedback from the beta testers and planned adjustments.",
    actionItems: [
      { id: 'a4', text: 'Fix login page responsive issues', owner: { name: 'Jordan Smith', initials: 'JS' }, dueDate: '2026-07-27', completed: false }
    ],
    keyDecisions: [],
    transcript: "Jordan: Here's the demo of the login page... Alex: Looks good, but we need to fix the mobile view..."
  },
  {
    id: '3',
    title: 'Engineering Standup',
    date: new Date(Date.now() - 86400000 * 3).toISOString(),
    duration: 15,
    status: 'ready',
    summary: "Quick standup to go over blockers and progress. Everyone is on track with their tasks.",
    actionItems: [],
    keyDecisions: [
      { id: 'd3', text: 'Switch to daily morning standups' }
    ],
    transcript: "Sam: I finished the API endpoints... Taylor: Working on the frontend..."
  },
  {
    id: '4',
    title: 'Marketing Strategy Call',
    date: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
    duration: 30,
    status: 'processing',
    summary: '',
    actionItems: [],
    keyDecisions: [],
    transcript: ''
  },
  {
    id: '5',
    title: 'Failed Demo Recording',
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
    duration: 20,
    status: 'failed',
    failureReason: 'Audio quality too low to transcribe',
    summary: '',
    actionItems: [],
    keyDecisions: [],
    transcript: ''
  }
];

export const mockStats = {
  totalMeetings: 12,
  pendingActionItems: 8,
  hoursSaved: 24
};
