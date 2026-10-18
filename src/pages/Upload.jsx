import { useState } from 'react';
import { Upload, CheckCircle2, FileVideo, FileAudio, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api';

const UploadPage = () => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, error, success
  const [errorMessage, setErrorMessage] = useState('');
  const [processingStep, setProcessingStep] = useState(0); // 0..2
  const navigate = useNavigate();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;

    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'video/mp4', 'video/quicktime'];
    const allowedExtensions = ['.mp3', '.wav', '.mp4', '.mov'];
    const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.includes(fileExtension)) {
      setStatus('error');
      setErrorMessage('Invalid file type. Please upload MP3, WAV, MP4, or MOV.');
      return;
    }

    if (selectedFile.size > 500 * 1024 * 1024) {
      setStatus('error');
      setErrorMessage('File too large. Maximum size is 500MB.');
      return;
    }

    setFile(selectedFile);
    if (!title) {
      const base = selectedFile.name.replace(/\.[^.]+$/, '');
      const pretty = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      setTitle(pretty);
    }
    setStatus('idle');
    setErrorMessage('');
  };

  const startUpload = async () => {
    if (!file) return;
    if (!title.trim()) {
      setStatus('error');
      setErrorMessage('Please provide a meeting title.');
      return;
    }

    setStatus('uploading');
    setUploadProgress(0);

    try {
      let pollId = null;
      await api.uploadMeeting({
        file,
        title: title.trim(),
        date: new Date(),
        onProgress: (p) => {
          setUploadProgress(p);
        },
      });

      setStatus('processing');
      setProcessingStep(0);

      // Simulate processing steps with delays so user knows AI is working
      const steps = [
        { delay: 1500, label: 'Transcribing audio' },
        { delay: 3500, label: 'Summarizing & extracting insights' },
        { delay: 6000, label: 'Finalizing' },
      ];
      for (let i = 0; i < steps.length; i++) {
        await new Promise(res => setTimeout(res, 500));
        setProcessingStep(i);
        if (i < steps.length - 1) {
          await new Promise(res => setTimeout(res, 1500));
        }
      }

      setStatus('success');
      await new Promise(r => setTimeout(r, 900));
      navigate('/dashboard');
    } catch (err) {
      setStatus('error');
      setErrorMessage(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      pollId && clearTimeout(pollId);
    }
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setUploadProgress(0);
    setErrorMessage('');
    setProcessingStep(0);
  };

  const processingSteps = [
    { name: 'Transcribing', icon: FileAudio },
    { name: 'Summarizing', icon: FileVideo },
    { name: 'Ready', icon: CheckCircle2 }
  ];

  const isAudio = file?.type?.startsWith('audio') || file?.name?.endsWith('.mp3') || file?.name?.endsWith('.wav');

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        {status === 'idle' && !file && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
              <Upload size={32} className="text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Drag & drop your meeting recording</h3>
            <p className="text-gray-400 mb-6">or click to browse files</p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".mp3,.wav,.mp4,.mov"
              onChange={handleFileSelect}
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center gap-2 bg-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-cyan-400 transition-colors cursor-pointer"
            >
              Browse Files
            </label>
            <p className="text-xs text-gray-500 mt-4">MP3, WAV, MP4, or MOV • Max 500MB</p>
          </div>
        )}

        {status === 'idle' && file && (
          <div className="bg-[#111113] rounded-xl border border-gray-800 p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center">
                {isAudio ? <FileAudio size={24} className="text-primary" /> : <FileVideo size={24} className="text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
              <button onClick={reset} className="p-2 text-gray-400 hover:text-white">
                <XCircle size={20} />
              </button>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-300 mb-2">Meeting title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="e.g., Sprint Planning - Week 4"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-3 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={startUpload}
                disabled={!title.trim()}
                className="flex-1 bg-primary text-black font-semibold py-3 rounded-lg hover:bg-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Upload size={18} />
                Upload
              </button>
            </div>
          </div>
        )}

        {(status === 'uploading' || status === 'processing' || status === 'success') && (
          <div className="bg-[#111113] rounded-xl border border-gray-800 p-8 text-center">
            {status === 'uploading' && (
              <>
                <Loader2 className="w-12 h-12 mx-auto mb-6 text-primary animate-spin" />
                <h3 className="text-xl font-semibold mb-2">Uploading...</h3>
                <div className="w-full max-w-md mx-auto bg-gray-800 rounded-full h-2 mb-2 overflow-hidden">
                  <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-gray-400">{uploadProgress}% complete</p>
              </>
            )}
            {(status === 'processing' || status === 'success') && (
              <>
                <div className={`w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center ${status === 'success' ? 'bg-green-500/20 text-green-400' : 'text-primary'}`}>
                  {status === 'success' ? <CheckCircle2 size={32} /> : <Loader2 className="w-12 h-12 animate-spin" />}
                </div>
                <h3 className="text-xl font-semibold mb-6">
                  {status === 'success' ? 'Meeting uploaded!' : 'AI is processing your meeting'}
                </h3>
                <div className="flex items-center justify-center gap-6 mb-8">
                  {processingSteps.map((step, idx) => {
                    const active = status === 'success' ? true : idx <= processingStep;
                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-colors ${
                          active ? 'bg-primary text-black' : 'bg-gray-800 text-gray-500'
                        }`}>
                          <step.icon size={20} />
                        </div>
                        <p className={`text-sm ${active ? 'text-white' : 'text-gray-500'}`}>{step.name}</p>
                      </div>
                    );
                  })}
                </div>
                {status === 'success' ? (
                  <p className="text-gray-400">Taking you to the dashboard...</p>
                ) : (
                  <div className="flex items-start justify-center gap-2 text-xs text-gray-500 max-w-md mx-auto">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <p className="text-left">
                      This happens in the background. You can safely navigate away — check the dashboard in a few minutes for results.
                    </p>
                  </div>
                )}
                {status === 'processing' && (
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="mt-6 text-primary hover:text-cyan-300 text-sm font-medium"
                  >
                    ← Go to dashboard and continue waiting
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-950/20 border border-red-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <XCircle className="text-red-500" size={24} />
              <h3 className="text-lg font-semibold text-red-400">Upload failed</h3>
            </div>
            <p className="text-red-300 mb-6">{errorMessage}</p>
            <button
              onClick={reset}
              className="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPage;
