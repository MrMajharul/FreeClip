import { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [outputUrl, setOutputUrl] = useState(null);
  const [logs, setLogs] = useState([]);
  
  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef(null);

  // 1. Initialize FFmpeg and load the WebAssembly cores
  useEffect(() => {
    const load = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpeg = ffmpegRef.current;
      
      // Listen to FFmpeg logs for debugging
      ffmpeg.on('log', ({ message }) => {
        setLogs(prev => [...prev.slice(-10), message]);
      });

      // Load the multi-threaded core (requires the SharedArrayBuffer headers we set in Step 2)
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setLoaded(true);
    };
    load();
  }, []);

  // 2. Handle File Selection
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setOutputUrl(null); // Clear previous output
    }
  };

  // 3. The Processing Engine
  const processVideo = async () => {
    if (!videoRef.current) return;
    
    setIsLoading(true);
    setLogs([]);
    const ffmpeg = ffmpegRef.current;

    try {
      // Write the input file to FFmpeg's virtual memory filesystem
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoUrl));

      // THE MAGIC: Construct the FFmpeg command
      // Example: Trim to first 5 seconds, crop to 640x360 starting at x:100, y:50
      // Syntax: -i input -ss start -t duration -vf "crop=w:h:x:y" output
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-ss', '0',         // Start at 0 seconds
        '-t', '5',          // Duration of 5 seconds
        '-vf', 'crop=640:360:100:50', // Width:640, Height:360, X:100, Y:50
        '-c:v', 'libx264',  // Video codec
        'output.mp4'        // Output filename
      ]);

      // Read the result from FFmpeg's virtual memory
      const data = await ffmpeg.readFile('output.mp4');
      
      // Create a Blob and generate a URL for the HTML5 video player
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);

    } catch (error) {
      console.error("FFmpeg Error:", error);
      setLogs(prev => [...prev, `ERROR: ${error.message}`]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1>FreeClip - Phase 2 Engine</h1>
      
      {!loaded ? (
        <p>Loading FFmpeg WebAssembly... (This takes a few seconds)</p>
      ) : (
        <>
          <input type="file" accept="video/*" onChange={handleFileUpload} />
          
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={processVideo} disabled={isLoading || !videoUrl}>
              {isLoading ? 'Processing...' : 'Crop & Trim (5s, 640x360)'}
            </button>
          </div>

          <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h3>Original Input</h3>
              {videoUrl && <video ref={videoRef} src={videoUrl} controls width="100%" />}
            </div>
            <div>
              <h3>Processed Output</h3>
              {outputUrl && <video src={outputUrl} controls width="100%" />}
              {outputUrl && (
                <a href={outputUrl} download="freeclip-output.mp4" style={{ display: 'block', marginTop: '0.5rem' }}>
                  Download Video
                </a>
              )}
            </div>
          </div>

          <div style={{ marginTop: '2rem', background: '#1e1e1e', color: '#0f0', padding: '1rem', borderRadius: '5px', fontFamily: 'monospace', fontSize: '12px', height: '150px', overflowY: 'auto' }}>
            <strong>FFmpeg Logs:</strong>
            {logs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        </>
      )}
    </div>
  );
}

export default App;