import { useState } from 'react';
import { Upload, CheckCircle2, FileVideo, FileAudio, XCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const UploadPage = () => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // idle, uploading, processing, error
  const [errorMessage, setErrorMessage] = useState('');
  const [processingStep, setProcessingStep] = useState(0); // 0: transcribing, 1: summarizing, 2: ready
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

    // Check file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'video/mp4', 'video/quicktime'];
    const allowedExtensions = ['.mp3', '.wav', '.mp4', '.mov'];
    const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();

    if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.includes(fileExtension)) {
      setStatus('error');
      setErrorMessage('Invalid file type. Please upload MP3, WAV, MP4, or MOV.');
      return;
    }

    // Check file size (500MB)
    if (selectedFile.size > 500 * 1024 * 1024) {
      setStatus('error');
      setErrorMessage('File too large. Maximum size is 500MB.');
      return;
    }

    setFile(selectedFile);
    setStatus('idle');
    setErrorMessage('');
  };

  const startUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setUploadProgress(0);

    // Simulate upload progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setUploadProgress(i);
    }

    // Upload complete, start processing
    setStatus('processing');
    setProcessingStep(0);

    // Simulate processing steps
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProcessingStep(i);
    }

    // Done!
    await api.uploadMeeting(file);
    navigate('/dashboard');
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setUploadProgress(0);
    setErrorMessage('');
  };

  const processingSteps = [
    { name: 'Transcribing', icon: FileAudio },
    { name: 'Summarizing', icon: FileVideo },
    { name: 'Ready', icon: CheckCircle2 }
  ];

  const isAudio = file?.type.startsWith('audio') || file?.name.endsWith('.mp3') || file?.name.endsWith('.wav');

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
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center">
                {isAudio ? <FileAudio size={24} className="text-primary" /> : <FileVideo size={24} className="text-primary" />}
              </div>
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
              <button
                onClick={reset}
                className="p-2 text-gray-400 hover:text-white"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 py-3 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startUpload}
                className="flex-1 bg-primary text-black font-semibold py-3 rounded-lg hover:bg-cyan-400 transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div className="bg-[#111113] rounded-xl border border-gray-800 p-8 text-center">
            {status === 'uploading' && (
              <>
                <Loader2 className="w-12 h-12 mx-auto mb-6 text-primary animate-spin" />
                <h3 className="text-xl font-semibold mb-2">Uploading...</h3>
                <div className="w-full max-w-md mx-auto bg-gray-800 rounded-full h-2 mb-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-gray-400">{uploadProgress}% • {Math.round((100 - uploadProgress) * 0.3)}s remaining</p>
              </>
            )}
            {status === 'processing' && (
              <>
                <div className="flex items-center justify-center gap-6 mb-8">
                  {processingSteps.map((step, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-colors ${
                        idx <= processingStep ? 'bg-primary text-black' : 'bg-gray-800 text-gray-500'
                      }`}>
                        <step.icon size={20} />
                      </div>
                      <p className={`text-sm ${idx <= processingStep ? 'text-white' : 'text-gray-500'}`}>
                        {step.name}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400">Estimated time remaining: {30 - processingStep * 10}s</p>
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
