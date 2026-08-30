import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./Terminal.css";

interface Props {
  onRef?: (terminal: XTerm) => void;
}

export default function Terminal({ onRef }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
      },
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 14,
      cursorBlink: true,
    });
    
    xtermInstance.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln("\x1b[1;32mVoiceIDE Terminal Initialized\x1b[0m");
    term.writeln("Ready to execute commands.");

    if (onRef) {
      onRef(term);
    }

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, [onRef]);

  return <div className="terminal-container" ref={terminalRef}></div>;
}
