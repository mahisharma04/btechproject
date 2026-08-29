import { mockMeetings, mockStats } from './mockData';

// Mock API service - swap with real endpoints later
export const api = {
  async getMeetings() {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockMeetings;
  },

  async getMeeting(id) {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockMeetings.find(m => m.id === id);
  },

  async getStats() {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockStats;
  },

  async uploadMeeting(file) {
    // Simulate upload
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { id: 'new-meeting-id', status: 'processing' };
  },

  async retryMeeting(id) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true };
  },

  async sendChatMessage(meetingId, message) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (meetingId) {
      // Chat for specific meeting
      const meeting = mockMeetings.find(m => m.id === meetingId);
      if (!meeting || meeting.status !== 'ready') {
        return { text: "I couldn't find anything relevant.", sources: [] };
      }
      return {
        text: `Based on the "${meeting.title}" meeting, here's what I found...`,
        sources: [{ meetingId, meetingTitle: meeting.title }]
      };
    } else {
      // Global chat
      return {
        text: "Here's what I found across your meetings...",
        sources: mockMeetings.filter(m => m.status === 'ready').map(m => ({
          meetingId: m.id,
          meetingTitle: m.title
        })).slice(0, 2)
      };
    }
  }
};
