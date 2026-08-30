import { useState, useCallback, useRef } from "react";

export async function streamAIPrompt(
  systemPrompt: string,
  userPrompt: string,
  onCodeGenerated: (codeChunk: string, isComplete?: boolean, isStart?: boolean) => void,
  onStatusUpdate?: (status: "processing" | "idle") => void
) {
  try {
    if (onStatusUpdate) onStatusUpdate("processing");
    const llamaRes = await fetch("http://127.0.0.1:8080/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        stream: true,
      }),
    });

    if (!llamaRes.ok || !llamaRes.body) {
      throw new Error("Llama failed. Are the servers running?");
    }

    const reader = llamaRes.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let isFirstChunk = true;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          const dataStr = line.replace("data: ", "");
          try {
            const data = JSON.parse(dataStr);
            const content = data.choices[0]?.delta?.content;
            if (content) {
              onCodeGenerated(content, false, isFirstChunk);
              isFirstChunk = false;
            }
          } catch (e) {
            // ignore partial parse errors
          }
        }
      }
    }
    onCodeGenerated("", true);
    if (onStatusUpdate) onStatusUpdate("idle");
  } catch (err) {
    console.error("AI processing error:", err);
    const mockCode = "\n// [ERROR] " + (err instanceof Error ? err.message : String(err)) + "\n";
    let i = 0;
    const interval = setInterval(() => {
      if (i < mockCode.length) {
        onCodeGenerated(mockCode[i]);
        i++;
      } else {
        clearInterval(interval);
        if (onStatusUpdate) onStatusUpdate("idle");
      }
    }, 10);
  }
}

export function useVoiceToCode(
  getEditorContext: () => string,
  onCodeGenerated: (codeChunk: string, isComplete?: boolean, isStart?: boolean) => void
) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setStatus("processing");
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("recording");
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setStatus("idle");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const wavBuffer = new ArrayBuffer(44 + channelData.length * 2);
      const view = new DataView(wavBuffer);
      
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };
      
      writeString(0, "RIFF");
      view.setUint32(4, 36 + channelData.length * 2, true);
      writeString(8, "WAVE");
      writeString(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 16000, true);
      view.setUint32(28, 16000 * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, "data");
      view.setUint32(40, channelData.length * 2, true);
      
      let offset = 44;
      for (let i = 0; i < channelData.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      
      const wavBlob = new Blob([view], { type: "audio/wav" });

      const formData = new FormData();
      formData.append("file", wavBlob, "audio.wav");
      formData.append("model", "whisper-1");

      const whisperRes = await fetch("http://127.0.0.1:8081/inference", {
        method: "POST",
        body: formData,
      });

      if (!whisperRes.ok) {
        const errorText = await whisperRes.text().catch(() => "No response body");
        throw new Error("Whisper failed with status " + whisperRes.status + ": " + errorText);
      }

      const whisperData = await whisperRes.json();
      const transcript = whisperData.text;
      console.log("Transcript:", transcript);

      if (!transcript || transcript.trim().length === 0) {
        console.log("No speech detected.");
        setStatus("idle");
        return;
      }

      const currentCode = getEditorContext();
      
      let systemPrompt = "You are a strict code generator. Output ONLY the raw code wrapped in a markdown code block (e.g. `python, `cpp). No explanations. IMPORTANT: Since this code runs over OS pipes, you MUST explicitly flush standard output before taking input (e.g., use std::endl or std::flush in C++, or flush=True in Python) so the terminal doesn't freeze! Always include example execution at the bottom if appropriate.";
      let userPrompt = "Instruction: " + transcript;
      
      if (currentCode.trim().length > 0 && !currentCode.includes("Welcome to VoiceIDE")) {
        userPrompt = "Here is the current code in the editor:\n\n" + currentCode + "\n\nUpdate the code above to fulfill this instruction: " + transcript + ". Output the ENTIRE updated script wrapped in a markdown code block.";
      }

      await streamAIPrompt(systemPrompt, userPrompt, onCodeGenerated, setStatus);
    } catch (err) {
      console.error("AI processing error:", err);
      const mockCode = "\n// [ERROR] " + (err instanceof Error ? err.message : String(err)) + "\n";
      let i = 0;
      const interval = setInterval(() => {
        if (i < mockCode.length) {
          onCodeGenerated(mockCode[i]);
          i++;
        } else {
          clearInterval(interval);
          setStatus("idle");
        }
      }, 10);
    }
  };

  const toggleRecording = useCallback(() => {
    if (status === "idle") {
      startRecording();
    } else if (status === "recording") {
      stopRecording();
    }
  }, [status]);

  return {
    isRecording,
    status,
    toggleRecording,
  };
}
