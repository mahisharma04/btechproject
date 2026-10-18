import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api';
import {
  Play, Pause, CheckCircle2, Square, ChevronDown, ChevronUp,
  Send, MessageSquare, Loader2, AlertCircle, RotateCcw, FileAudio, FileVideo
} from 'lucide-react';

const formatMMSS = (secs) => {
  if (!isFinite(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const MeetingDetail = () => {
  const { id } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  const mediaRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [currentSec, setCurrentSec] = useState(0);

  const fetchMeeting = async () => {
    try {
      const data = await api.getMeeting(id);
      setMeeting(data);
      setError('');
      return data;
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load meeting'));
      setMeeting(null);
    } finally {
      setLoading(false);
    }
    return null;
  };

  useEffect(() => {
    fetchMeeting();
  }, [id]);

  // Poll while processing
  useEffect(() => {
    if (!meeting || meeting.status !== 'processing') return;
    const timer = setInterval(fetchMeeting, 4000);
    return () => clearInterval(timer);
  }, [id, meeting?.status]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isTyping]);

  const mediaUrl = api.getMediaUrl(id);
  const mediaHeaders = api.getAuthHeader();

  const isAudioOnly = meeting?.mediaFilename
    ? /\.(mp3|wav)$/i.test(meeting.mediaFilename)
    : /\.(mp3|wav)$/i.test(meeting?.mediaFilename || '');

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      const playPromise = el.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    } else {
      el.pause();
    }
  };

  const onMediaTimeUpdate = () => {
    const el = mediaRef.current;
    if (!el) return;
    setCurrentSec(el.currentTime);
    if (el.duration && el.duration > 0) {
      setProgress(el.currentTime / el.duration);
    }
  };

  const onSeekClick = (e) => {
    const el = mediaRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * (el.duration || 0);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isTyping || meeting?.status !== 'ready') return;
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    const q = chatInput.trim();
    setChatInput('');
    setIsTyping(true);

    try {
      const response = await api.sendChatMessage(id, q);
      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.text,
        sources: response.sources,
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (e) {
      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Error: ${getErrorMessage(e, 'Failed to get response')}`,
        sources: [],
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const toggleActionItem = async (actionId) => {
    if (!meeting) return;
    const next = !meeting.actionItems.find(a => a.id === actionId)?.completed;
    // optimistic update
    setMeeting(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item =>
        item.id === actionId ? { ...item, completed: next } : item
      ),
    }));
    try {
      await api.toggleActionItem(id, actionId, next);
    } catch (e) {
      // rollback on error
      setMeeting(prev => ({
        ...prev,
        actionItems: prev.actionItems.map(item =>
          item.id === actionId ? { ...item, completed: !next } : item
        ),
      }));
    }
  };

  const handleRetry = async () => {
    try {
      await api.retryMeeting(id);
      setMeeting(prev => prev ? { ...prev, status: 'processing', failureReason: null } : prev);
    } catch (e) {
      alert(getErrorMessage(e, 'Failed to retry meeting'));
    }
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

  if (error || !meeting) {
    return (
      <div className="p-8">
        <div className="max-w-xl mx-auto bg-red-950/20 border border-red-900/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle size={24} className="text-red-500" />
            <h3 className="text-lg font-semibold">Could not load meeting</h3>
          </div>
          <p className="text-red-300">{error || 'Meeting not found'}</p>
        </div>
      </div>
    );
  }

  const duration = meeting.duration || 0;
  const ownerShape = (owner) => {
    if (owner?.initials) return owner;
    // back-compat with schema's ownerName/ownerInitials
    const ni = meeting.actionItems.find(a => a.ownerName || a.ownerInitials);
    if (ni) return { name: ni.ownerName || 'Unknown', initials: ni.ownerInitials || '?' };
    return null;
  };

  return (
    <div className="p-8">
      {meeting.status === 'processing' && (
        <div className="mb-8 bg-yellow-950/20 border border-yellow-800/60 rounded-xl p-5 flex items-start gap-4">
          <Loader2 className="text-yellow-500 animate-spin mt-0.5 flex-shrink-0" size={22} />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-300">Still processing…</h3>
            <p className="text-sm text-yellow-200/70 mt-1">
              AI is transcribing the recording and extracting insights. This page will automatically refresh every few seconds.
            </p>
          </div>
        </div>
      )}

      {meeting.status === 'failed' && (
        <div className="mb-8 bg-red-950/20 border border-red-900/60 rounded-xl p-5 flex items-start gap-4">
          <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={22} />
          <div className="flex-1">
            <h3 className="font-semibold text-red-300">Processing failed</h3>
            <p className="text-sm text-red-200/80 mt-1 mb-3">
              {meeting.failureReason || 'Unknown error'}
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 text-sm bg-red-800/50 hover:bg-red-800 text-white rounded-md px-3 py-2 transition-colors"
            >
              <RotateCcw size={14} />
              Retry processing
            </button>
          </div>
        </div>
      )}

      {/* Player */}
      <div className="bg-[#111113] border border-gray-800 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{meeting.title}</h2>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {isAudioOnly ? <FileAudio size={16} /> : <FileVideo size={16} />}
            {isAudioOnly ? 'Audio recording' : 'Video recording'}
          </div>
        </div>

        {meeting.status === 'ready' ? (
          <>
            {isAudioOnly ? (
              <audio
                ref={mediaRef}
                src={mediaUrl}
                className="hidden"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={onMediaTimeUpdate}
                onLoadedMetadata={onMediaTimeUpdate}
                crossOrigin="anonymous"
                preload="metadata"
              />
            ) : (
              <video
                ref={mediaRef}
                src={mediaUrl}
                className="w-full mb-4 rounded-lg bg-black"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={onMediaTimeUpdate}
                onLoadedMetadata={onMediaTimeUpdate}
                crossOrigin="anonymous"
                controls={false}
                preload="metadata"
                playsInline
              />
            )}

            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-black hover:bg-cyan-400 transition-colors"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <div className="flex-1">
                <div
                  onClick={onSeekClick}
                  className="w-full bg-gray-800 h-2 rounded-full cursor-pointer relative overflow-hidden"
                >
                  <div
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-sm text-gray-400">
                  <span>{formatMMSS(currentSec)}</span>
                  <span>{formatMMSS((mediaRef.current?.duration || duration * 60))}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="h-24 flex items-center justify-center text-gray-500">
            {meeting.status === 'processing' ? (
              <div className="flex items-center gap-3">
                <Loader2 className="animate-spin" size={20} />
                Media player will be available once processing completes
              </div>
            ) : (
              <span>Media player unavailable</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Summary */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Summary</h2>
            {meeting.status === 'ready' ? (
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{meeting.summary || 'No summary provided.'}</p>
            ) : (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-800 rounded w-full" />
                <div className="h-4 bg-gray-800 rounded w-5/6" />
                <div className="h-4 bg-gray-800 rounded w-4/6" />
              </div>
            )}
          </div>

          {/* Action Items */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              Action Items
              {meeting.actionItems?.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({meeting.actionItems.filter(a => a.completed).length}/{meeting.actionItems.length} complete)
                </span>
              )}
            </h2>
            {!meeting.actionItems?.length ? (
              <div className="text-center py-8 text-gray-400">
                <Square size={32} className="mx-auto mb-3 opacity-50" />
                <p>{meeting.status === 'processing' ? 'Extracting action items…' : 'No action items from this meeting'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {meeting.actionItems.map(item => {
                  const owner = ownerShape(item.owner) || (item.ownerName ? { name: item.ownerName, initials: item.ownerInitials } : null);
                  return (
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
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          {owner && (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
                                {owner.initials || '??'}
                              </div>
                              <span className="text-sm text-gray-400">{owner.name}</span>
                            </div>
                          )}
                          {item.dueDate && (
                            <span className="text-sm text-gray-500">Due {String(item.dueDate).slice(0, 10)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Key Decisions */}
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Key Decisions</h2>
            {!meeting.keyDecisions?.length ? (
              <div className="text-center py-8 text-gray-400">
                <Square size={32} className="mx-auto mb-3 opacity-50" />
                <p>{meeting.status === 'processing' ? 'Extracting decisions…' : 'No key decisions from this meeting'}</p>
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
                {meeting.status === 'ready' ? (
                  <p className="text-gray-400 leading-relaxed whitespace-pre-wrap">{meeting.transcript || 'No transcript available.'}</p>
                ) : (
                  <div className="animate-pulse space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="h-3 bg-gray-800 rounded w-full" />
                    ))}
                  </div>
                )}
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
            {meeting.status !== 'ready' && (
              <p className="text-xs text-yellow-500 mt-2">Waiting for processing to finish…</p>
            )}
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
                placeholder={meeting.status === 'ready' ? 'Ask a question...' : 'Waiting for processing…'}
                disabled={meeting.status !== 'ready' || isTyping}
                className="flex-1 bg-[#0a0a0b] border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isTyping || meeting.status !== 'ready'}
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
