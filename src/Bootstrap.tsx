import { useEffect, useState, useRef } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { download } from "@tauri-apps/plugin-upload";
import { Command } from "@tauri-apps/plugin-shell";
import "./Bootstrap.css";

const LLAMA_FILE = "qwen2.5-coder-1.5b.gguf";
const WHISPER_FILE = "whisper-base.en.bin";

const LLAMA_URL = `https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/${LLAMA_FILE}`;
const WHISPER_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_FILE}`;

interface Props {
  onBootstrapped: () => void;
}

export default function Bootstrap({ onBootstrapped }: Props) {
  const [status, setStatus] = useState("Initializing VoiceIDE...");
  const [progress, setProgress] = useState(0);

  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    async function bootstrap() {
      try {
        const appData = await appDataDir();
        // Ensure app data dir exists
        const dirExists = await exists(appData);
        if (!dirExists) {
          await mkdir(appData, { recursive: true });
        }

        const llamaPath = await join(appData, "qwen2.5-coder-1.5b.gguf");
        const whisperPath = await join(appData, "whisper-base.en.bin");

        const llamaExists = await exists(llamaPath);
        if (!llamaExists) {
          setStatus("Downloading AI Code Model...");
          await download(LLAMA_URL, llamaPath, (p) => {
            setProgress(Math.round((p.progress / p.progressTotal) * 100));
          });
        }

        const whisperExists = await exists(whisperPath);
        if (!whisperExists) {
          setStatus("Downloading AI Voice Model...");
          setProgress(0);
          await download(WHISPER_URL, whisperPath, (p) => {
            setProgress(Math.round((p.progress / p.progressTotal) * 100));
          });
        }

        setStatus("Starting AI Servers...");
        
                // Kill any existing ghost servers
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'llama-server*' -ErrorAction SilentlyContinue; Stop-Process -Name 'llama-server' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'whisper-server*' -ErrorAction SilentlyContinue; Stop-Process -Name 'whisper-server' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});

        // Spawn sidecars
        const llamaCmd = Command.sidecar("bin/llama-server", ["--port", "8080", "--model", llamaPath]);
        const whisperCmd = Command.sidecar("bin/whisper-server", ["--port", "8081", "--model", whisperPath]);

        llamaCmd.on('error', error => console.error('llama-server error:', error));
        llamaCmd.stdout.on('data', line => console.log('llama-server:', line));
        llamaCmd.stderr.on('data', line => console.log('[AI Engine]:', line));

        whisperCmd.on('error', error => console.error('whisper-server error:', error));
        whisperCmd.stdout.on('data', line => console.log('whisper-server:', line));
        whisperCmd.stderr.on('data', line => console.log('[Audio Engine]:', line));

        whisperCmd.on('error', error => console.error('whisper-server error:', error));
        whisperCmd.stdout.on('data', line => console.log('whisper-server:', line));
        whisperCmd.stderr.on('data', line => console.error('whisper-server err:', line));

        await llamaCmd.spawn();
        await whisperCmd.spawn();

        setStatus("Waiting for AI Engines to warm up...");
        
        // Ping servers until they are ready
        const pingServer = async (port: number) => {
            while (true) {
                try {
                    const res = await fetch(`http://127.0.0.1:${port}/health`);
                    if (res.ok) break;
                } catch (e) {}
                await new Promise(r => setTimeout(r, 500));
            }
        };

        // Wait for both to be healthy, timeout after 15 seconds
        await Promise.race([
            Promise.all([pingServer(8080), pingServer(8081)]),
            new Promise(r => setTimeout(r, 15000))
        ]);

        onBootstrapped();
      } catch (error) {
        setStatus(`Bootstrap Failed: ${error}`);
      }
    }

    bootstrap();
  }, [onBootstrapped]);

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-content">
        <h1>VoiceIDE</h1>
        <p>{status}</p>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="progress-text">{progress}%</div>
      </div>
    </div>
  );
}

