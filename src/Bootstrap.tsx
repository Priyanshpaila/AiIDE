import { useEffect, useState } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { download } from "@tauri-apps/plugin-upload";
import { Command } from "@tauri-apps/plugin-shell";
import "./Bootstrap.css";

const LLAMA_FILE = "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf";
const WHISPER_FILE = "ggml-base.en.bin";

const LLAMA_URL = `https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/${LLAMA_FILE}`;
const WHISPER_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_FILE}`;

interface Props {
  onBootstrapped: () => void;
}

export default function Bootstrap({ onBootstrapped }: Props) {
  const [status, setStatus] = useState("Initializing VoiceIDE...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function bootstrap() {
      try {
        // Detect if we're running inside Tauri by checking for the IPC object
        // @ts-ignore
        const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;
        
        if (!isTauri) {
          setStatus("Browser Detected: Mocking AI model downloads...");
          setProgress(0);
          
          // Mock download progress for browser
          for (let i = 0; i <= 100; i += 20) {
            setProgress(i);
            await new Promise(res => setTimeout(res, 500));
          }
          
          setStatus("Browser Detected: Mocking AI Servers...");
          await new Promise(res => setTimeout(res, 1000));
          onBootstrapped();
          return;
        }

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
        
        // Spawn sidecars
        const llamaCmd = Command.sidecar("bin/llama-server", ["--port", "8080", "--model", llamaPath]);
        const whisperCmd = Command.sidecar("bin/whisper-server", ["--port", "8081", "--model", whisperPath]);

        await llamaCmd.spawn();
        await whisperCmd.spawn();

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
