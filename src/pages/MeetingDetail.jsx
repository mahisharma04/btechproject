import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Play, Pause, CheckCircle2, Square, ChevronDown, ChevronUp, Send, MessageSquare } from 'lucide-react';

const MeetingDetail = () => {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const fetchMeeting = async () => {
      const data = await api.getMeeting(id);
      setMeeting(data);
      setLoading(false);
    };
    fetchMeeting();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMessage = { id: Date.now().toString(), role: 'user', text: chatInput.trim(), timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true);

    const response = await api.sendChatMessage(id, userMessage.text);
    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      text: response.text,
      sources: response.sources,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, assistantMessage]);
    setIsTyping(false);
  };

  const toggleActionItem = (actionId) => {
    setMeeting(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item =>
        item.id === actionId ? { ...item, completed: !item.completed } : item
      )
    }));
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-[#111113] rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-48 bg-[#111113] rounded-xl" />
              <div className="h-64 bg-[#111113] rounded-xl" />
            </div>
            <div className="h-96 bg-[#111113] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Player */}
      <div className="bg-[#111113] border border-gray-800 rounded-xl p-6 mb-8">
        <div className="flex items-center gap-4">
          <button className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-black">
            <Play size={20} className="ml-1" />
          </button>
          <div className="flex-1">
            <div className="w-full bg-gray-800 h-2 rounded-full">
              <div className="bg-primary w-1/3 h-2 rounded-full" />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-400">
              <span>5:32</span>
              <span>{meeting.duration}:00</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Summary */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            <p className="text-gray-300 leading-relaxed">{meeting.summary}</p>
          </div>

          {/* Action Items */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Action Items</h2>
            {meeting.actionItems.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Square size={32} className="mx-auto mb-3 opacity-50" />
                <p>No action items from this meeting</p>
              </div>
            ) : (
              <div className="space-y-4">
                {meeting.actionItems.map(item => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-4 p-4 rounded-lg border ${
                      item.completed ? 'border-gray-700 bg-gray-800/30' : 'border-gray-700'
                    }`}
                  >
                    <button
                      onClick={() => toggleActionItem(item.id)}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        item.completed ? 'bg-primary border-primary text-black' : 'border-gray-600 hover:border-primary'
                      }`}
                    >
                      {item.completed && <CheckCircle2 size={14} />}
                    </button>
                    <div className="flex-1">
                      <p className={`${item.completed ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                        {item.text}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
                            {item.owner.initials}
                          </div>
                          <span className="text-sm text-gray-400">{item.owner.name}</span>
                        </div>
                        <span className="text-sm text-gray-500">Due {item.dueDate}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key Decisions */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Key Decisions</h2>
            {meeting.keyDecisions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Square size={32} className="mx-auto mb-3 opacity-50" />
                <p>No key decisions from this meeting</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {meeting.keyDecisions.map(decision => (
                  <li key={decision.id} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                    <p className="text-gray-300">{decision.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Transcript */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl">
            <button
              onClick={() => setTranscriptOpen(!transcriptOpen)}
              className="w-full p-6 flex items-center justify-between"
            >
              <h2 className="text-lg font-semibold">Transcript</h2>
              {transcriptOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            {transcriptOpen && (
              <div className="border-t border-gray-800 p-6">
                <p className="text-gray-400 leading-relaxed">{meeting.transcript}</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Column */}
        <div className="bg-[#111113] border border-gray-800 rounded-xl flex flex-col h-[calc(100vh-200px)]">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" />
              Ask about this meeting
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Ask questions about this meeting</p>
                <p className="text-sm mt-2">e.g., "What decisions were made?"</p>
              </div>
            ) : (
              chatMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 ${
                      msg.role === 'user' ? 'bg-primary text-black rounded-tr-sm' : 'bg-gray-800 rounded-tl-sm'
                    }`}
                  >
                    <p>{msg.text}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-gray-500 mb-2">Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((source, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-1 bg-gray-700 rounded-full text-gray-300"
                            >
                              {source.meetingTitle}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl rounded-tl-sm p-4">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask a question..."
                className="flex-1 bg-[#0a0a0b] border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-primary"
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isTyping}
                className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingDetail;
