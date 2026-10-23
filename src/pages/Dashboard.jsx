import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../services/api';
import { Clock, Calendar, CheckCircle2, AlertCircle, Play, RotateCcw, Upload, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const [meetings, setMeetings] = useState([]);
  const [stats, setStats] = useState({
    totalMeetings: 0,
    pendingActionItems: 0,
    hoursSaved: 0,
    processingMeetings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const [meetingsData, statsData] = await Promise.all([
        api.getMeetings(),
        api.getStats(),
      ]);
      setMeetings(meetingsData);
      setStats(statsData);
      setError('');
      return meetingsData;
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load dashboard'));
    } finally {
      setLoading(false);
    }
    return [];
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const hasProcessing = meetings.some(m => m.status === 'processing');
    if (!hasProcessing) return;

    const timer = setInterval(async () => {
      const updated = await fetchData();
      if (updated.every(m => m.status !== 'processing')) {
        clearInterval(timer);
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [meetings.some(m => m.status === 'processing')]);

  const handleRetry = async (id) => {
    try {
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, status: 'processing', failureReason: null } : m));
      await api.retryMeeting(id);
    } catch (e) {
      alert(getErrorMessage(e, 'Failed to retry meeting'));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this meeting? This permanently removes the recording, transcript, and all AI insights.')) {
      return;
    }
    try {
      await api.deleteMeeting(id);
      setMeetings(prev => prev.filter(m => m.id !== id));
      fetchData();
    } catch (e) {
      alert(getErrorMessage(e, 'Failed to delete meeting'));
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#111113] rounded-xl p-6 h-32"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-[#111113] rounded-xl h-48"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-950/20 border border-red-900/50 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-[#111113] rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm mb-2">Total Meetings</p>
          <p className="text-3xl font-semibold">{stats.totalMeetings ?? 0}</p>
          {stats.processingMeetings > 0 && (
            <p className="text-xs text-yellow-500 mt-2">
              ⏳ {stats.processingMeetings} processing in background
            </p>
          )}
        </div>
        <div className="bg-[#111113] rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm mb-2">Pending Action Items</p>
          <p className="text-3xl font-semibold">{stats.pendingActionItems ?? 0}</p>
        </div>
        <div className="bg-[#111113] rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm mb-2">Hours Saved</p>
          <p className="text-3xl font-semibold">{stats.hoursSaved ?? 0}</p>
          {stats.totalDurationMinutes > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              From {stats.totalDurationMinutes} minutes of meetings
            </p>
          )}
        </div>
      </div>

      {/* Empty state */}
      {meetings.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-800 mb-6">
            <Upload size={40} className="text-gray-500" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">No meetings yet</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Upload your first meeting recording to get started with AI-powered insights.
          </p>
          <button
            onClick={() => navigate('/upload')}
            className="bg-primary text-black font-semibold py-3 px-8 rounded-lg hover:bg-cyan-400 transition-colors"
          >
            Upload Meeting
          </button>
        </div>
      ) : (
        /* Meetings Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.map(meeting => (
            <div
              key={meeting.id}
              onClick={() => meeting.status === 'ready' && navigate(`/meetings/${meeting.id}`)}
              className={`bg-[#111113] rounded-xl border border-gray-800 p-6 transition-all ${
                meeting.status === 'ready'
                  ? 'cursor-pointer hover:border-gray-700 hover:shadow-lg hover:shadow-black/40'
                  : 'cursor-default'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-semibold text-lg line-clamp-2 pr-3">{meeting.title}</h3>
                {meeting.status === 'processing' && (
                  <span className="flex items-center gap-1.5 text-yellow-500 text-xs bg-yellow-500/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                    Processing
                  </span>
                )}
                {meeting.status === 'ready' && (
                  <span className="flex items-center gap-1.5 text-green-500 text-xs bg-green-500/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    <CheckCircle2 size={12} />
                    Ready
                  </span>
                )}
                {meeting.status === 'failed' && (
                  <span className="flex items-center gap-1.5 text-red-500 text-xs bg-red-500/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    <AlertCircle size={12} />
                    Failed
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {formatDate(meeting.date)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {meeting.duration} min
                </div>
              </div>

              {meeting.status === 'failed' && (
                <div className="text-sm text-red-400 mb-4 line-clamp-2">
                  {meeting.failureReason}
                </div>
              )}

              <div className="flex items-center justify-between">
                {meeting.status === 'ready' && (
                  <button className="flex items-center gap-2 text-primary hover:text-cyan-300 text-sm font-medium">
                    View Details <Play size={14} />
                  </button>
                )}
                {meeting.status === 'processing' && (
                  <span className="text-xs text-gray-500">
                    Please wait — AI is transcribing
                  </span>
                )}
                {meeting.status === 'failed' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry(meeting.id);
                    }}
                    className="flex items-center gap-2 text-gray-400 hover:text-white text-sm"
                  >
                    <RotateCcw size={14} />
                    Retry
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(meeting.id);
                  }}
                  title="Delete meeting"
                  aria-label="Delete meeting"
                  className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 text-sm transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
