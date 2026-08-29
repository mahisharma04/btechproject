import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Search } from 'lucide-react';
import { api } from '../services/api';

const SearchChat = () => {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMessage = { id: Date.now().toString(), role: 'user', text: chatInput.trim(), timestamp: new Date().toISOString() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true);

    const response = await api.sendChatMessage(null, userMessage.text);
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

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="bg-[#111113] border border-gray-800 rounded-xl flex flex-col flex-1 max-w-4xl mx-auto w-full">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold flex items-center gap-3">
            <Search size={24} className="text-primary" />
            Search & Chat Across All Meetings
          </h2>
          <p className="text-gray-400 text-sm mt-2">Ask questions and find information from all your past meetings</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {chatMessages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
                <MessageSquare size={40} className="text-gray-500" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Start a conversation</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-6">
                Ask questions like "What did we decide about the Q3 budget?" or "Show me all action items from last week"
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => setChatInput("What are all pending action items?")}
                  className="px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  What are all pending action items?
                </button>
                <button
                  onClick={() => setChatInput("Summarize our last planning meeting")}
                  className="px-4 py-2 bg-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Summarize our last planning meeting
                </button>
              </div>
            </div>
          ) : (
            chatMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-5 ${
                    msg.role === 'user' ? 'bg-primary text-black rounded-tr-sm' : 'bg-gray-800 rounded-tl-sm'
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <p className="text-xs text-gray-500 mb-2">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.sources.map((source, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-3 py-1.5 bg-gray-700 rounded-full text-gray-300"
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
              <div className="bg-gray-800 rounded-2xl rounded-tl-sm p-5">
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

        <div className="p-6 border-t border-gray-800">
          <div className="flex gap-4">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Ask anything about your meetings..."
              className="flex-1 bg-[#0a0a0b] border border-gray-700 rounded-xl py-4 px-5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-lg"
            />
            <button
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || isTyping}
              className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-400 transition-colors"
            >
              <Send size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchChat;
