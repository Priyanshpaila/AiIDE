import { useRef, useState, useEffect } from "react";
import Editor, { DiffEditor, OnMount, loader } from "@monaco-editor/react";
import { useVoiceToCode, streamAIPrompt } from "./hooks/useVoiceToCode";
import Bootstrap from "./Bootstrap";
import TerminalComponent from "./components/Terminal";
import FileTree from "./components/FileTree";
import * as monaco from "monaco-editor";

// Configure Monaco to use the locally bundled version instead of the CDN
loader.config({ monaco });

import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Terminal as XTerm } from "@xterm/xterm";
import { 
  Play, Mic, FolderOpen, Settings, Bell, 
  ChevronDown, Search, Plus, TerminalSquare, 
  Bug, Zap, Languages, BookOpen, Minus, X
} from "lucide-react";
import "./App.css";

type Tab = {
  id: string;
  name: string;
  path: string;
  content: string;
  lang: string;
};

function App() {
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [folderPaths, setFolderPaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_folders");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const [activeFolderPath, setActiveFolderPath] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem("voiceide_active_folder");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });
  
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try {
      const saved = localStorage.getItem("voiceide_tabs");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("voiceide_active_tab");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return "";
  });
  const [showDiff, setShowDiff] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  
  const [activeBottomTab, setActiveBottomTab] = useState<"problems"|"output"|"terminal"|"debug">("terminal");
  const [problems, setProblems] = useState<monaco.editor.IMarker[]>([]);
  const [outputLogs, setOutputLogs] = useState<string[]>(["VoiceIDE Output initialized..."]);
  const [debugLogs, setDebugLogs] = useState<string[]>(["VoiceIDE Debug Console ready..."]);

  // Multiple Terminals
  const [terminals, setTerminals] = useState<{id: string, name: string}[]>([{ id: "term-1", name: "1: Terminal" }]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>("term-1");
  const terminalRefs = useRef<Record<string, XTerm>>({});

  const getActiveTerminal = () => terminalRefs.current[activeTerminalId];

  const createNewTerminal = () => {
    const newId = `term-${Date.now()}`;
    const newName = `${terminals.length + 1}: Node`;
    setTerminals(prev => [...prev, { id: newId, name: newName }]);
    setActiveTerminalId(newId);
    setActiveBottomTab("terminal");
  };

  const deleteTerminal = () => {
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== activeTerminalId);
      if (filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      }
      return filtered.length > 0 ? filtered : [{ id: `term-${Date.now()}`, name: "1: Terminal" }];
    });
    delete terminalRefs.current[activeTerminalId];
  };

  useEffect(() => {
    const disposable = monaco.editor.onDidChangeMarkers(() => {
      setProblems(monaco.editor.getModelMarkers({}));
    });
    return () => disposable.dispose();
  }, []);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args) => {
      setDebugLogs(prev => [...prev, `[LOG] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalLog(...args);
    };
    console.error = (...args) => {
      setDebugLogs(prev => [...prev, `[ERR] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalError(...args);
    };
    console.warn = (...args) => {
      setDebugLogs(prev => [...prev, `[WARN] ${args.map(a => a instanceof Error ? a.message : (typeof a === 'object' ? JSON.stringify(a) : a)).join(" ")}`]);
      originalWarn(...args);
    };
    
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const appendOutput = (msg: string) => {
    setOutputLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    localStorage.setItem("voiceide_folders", JSON.stringify(folderPaths));
    localStorage.setItem("voiceide_tabs", JSON.stringify(tabs));
    localStorage.setItem("voiceide_active_tab", JSON.stringify(activeTabId));
    localStorage.setItem("voiceide_active_folder", JSON.stringify(activeFolderPath));
  }, [folderPaths, tabs, activeTabId, activeFolderPath]);
  
  const activeTab = tabs.find(t => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : undefined);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const streamBufferRef = useRef<string>("");

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleDiffEditorDidMount: OnMount = (editor) => {
    diffEditorRef.current = editor as any;
  };

  // Update tab content on edit
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, content: value } : t));
  };

  const createNewTab = (lang: string, content: string, path: string = "", name?: string) => {
    const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : lang;
    const newId = `scratch-${Date.now()}`;
    const newTab = {
      id: newId,
      name: name || `scratch.${ext}`,
      path,
      content,
      lang
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const openNewFileModal = () => {
    setNewFileName("");
    setShowNewFileModal(true);
  };

  const submitNewFile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newFileName.trim()) return;

    let fileName = newFileName.trim();
    const ext = activeTab?.lang === 'python' ? 'py' : activeTab?.lang === 'javascript' ? 'js' : activeTab?.lang === 'cpp' ? 'cpp' : activeTab?.lang === 'c' ? 'c' : activeTab?.lang || 'txt';
    
    if (!fileName.includes('.')) {
      fileName += `.${ext}`;
    }
    
    setShowNewFileModal(false);

    if (folderPaths.length > 0) {
      let targetFolder = activeFolderPath || folderPaths[0];

      try {
        const { join } = await import("@tauri-apps/api/path");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const newPath = await join(targetFolder, fileName);
        await writeTextFile(newPath, "");
        setRefreshTrigger(prev => prev + 1);
        createNewTab(activeTab?.lang || 'python', "", newPath, fileName);
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    } else {
      createNewTab(activeTab?.lang || 'python', "", "", fileName);
    }
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const defaultTab = { id: "scratch-1", name: "scratch.py", path: "", content: "", lang: "python" };
      setTabs([defaultTab]);
      setActiveTabId("scratch-1");
    } else {
      setTabs(newTabs);
      if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const handleAIGeneratedChunk = (code: string, isComplete?: boolean, isStart?: boolean) => {
    if (isStart) {
      streamBufferRef.current = "";
      setShowDiff(true);
    }

    streamBufferRef.current += code;

    if (isComplete) {
      let finalCode = streamBufferRef.current;
      
      const match = finalCode.match(/```([a-zA-Z0-9+-]+)(?:\r?\n)/);
      let detectedLang = activeTab?.lang;
      if (match && match[1]) {
        detectedLang = match[1].toLowerCase();
      }
      
      const cleaned = finalCode.replace(/```[a-zA-Z0-9+-]*\r?\n?/g, "").replace(/```/g, "");
      
      if (detectedLang !== activeTab?.lang) {
        setShowDiff(false);
        createNewTab(detectedLang, cleaned);
      } else {
        setTabs(prevTabs => prevTabs.map(t => 
          t.id === activeTabIdRef.current ? { ...t, content: cleaned } : t
        ));
        setShowDiff(false);
        
        if (editorRef.current) {
           const model = editorRef.current.getModel();
           if (model) {
               editorRef.current.executeEdits("ai-edit", [{
                   range: model.getFullModelRange(),
                   text: cleaned,
                   forceMoveMarkers: true
               }]);
           }
        }
      }
      return;
    }
    
    if (diffEditorRef.current) {
       const modifiedModel = diffEditorRef.current.getModel()?.modified;
       if (modifiedModel) {
          modifiedModel.setValue(streamBufferRef.current);
       }
    }
  };

  const { isRecording, status, toggleRecording } = useVoiceToCode(
    () => activeTab?.content || '',
    handleAIGeneratedChunk
  );

  const handleDebug = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    setActiveBottomTab("output");
    appendOutput(`Starting AI Debug process for ${activeTab?.name || ''}...`);
    const sysPrompt = "You are an expert debugger. Fix any errors or logical bugs in the provided code. Output ONLY the raw corrected code wrapped in a markdown code block (e.g. ```python). Keep the same language. Ensure the output runs flawlessly.";
    const userPrompt = `Debug and fix the following code:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleOptimize = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    setActiveBottomTab("output");
    appendOutput(`Starting AI Optimization process for ${activeTab?.name || ''}...`);
    const sysPrompt = "You are an expert performance optimizer. Rewrite the provided code to be significantly more efficient (e.g., O(1) instead of O(n^2)) while maintaining the exact same logic and functionality. Output ONLY the raw optimized code wrapped in a markdown code block. Keep the same language.";
    const userPrompt = `Optimize the following code for better performance and time/space complexity:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleTranslate = async () => {
    if (!activeTab || !(activeTab?.content || '').trim()) return;
    const targetLang = prompt("Enter target programming language (e.g., c++, python, rust):");
    if (!targetLang) return;
    
    setActiveBottomTab("output");
    appendOutput(`Starting AI Translation to ${targetLang} for ${activeTab?.name || ''}...`);
    const sysPrompt = `You are an expert code translator. Translate the provided code into ${targetLang} without changing the underlying logic or functionality. Use idiomatic patterns for ${targetLang}. Output ONLY the raw translated code wrapped in a markdown code block (e.g. \`\`\`${targetLang}).`;
    const userPrompt = `Translate the following code to ${targetLang}:\n\n${activeTab?.content || ''}`;
    await streamAIPrompt(sysPrompt, userPrompt, handleAIGeneratedChunk);
  };

  const handleDocumentation = async () => {
    if (folderPaths.length === 0 && (!activeTab || !(activeTab?.content || '').trim())) {
      alert("Please open a folder or write some code to generate documentation.");
      return;
    }
    
    setActiveBottomTab("output");
    appendOutput(`Initializing Documentation generation...`);
    
    if (getActiveTerminal()) {
      getActiveTerminal().writeln(`\r\n\x1b[1;36m> Generating project documentation...\x1b[0m`);
    }
    
    let combinedCode = "";
    let targetFolder = folderPaths.length > 0 ? (activeFolderPath || folderPaths[0]) : null;
    
    if (targetFolder) {
      try {
        const { readDir, readTextFile } = await import("@tauri-apps/plugin-fs");
        const { join } = await import("@tauri-apps/api/path");
        
        const readFolderRecursive = async (path: string, depth = 0) => {
          if (depth > 3) return; // Prevent infinite/massive trees
          const entries = await readDir(path);
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name.includes('scratch.bat') || entry.name.endsWith('.exe')) continue;
            
            const fullPath = await join(path, entry.name);
            if (entry.isDirectory) {
              await readFolderRecursive(fullPath, depth + 1);
            } else {
              if (entry.name.match(/\.(py|cpp|c|js|ts|jsx|tsx|html|css|json|md|txt)$/)) {
                 const content = await readTextFile(fullPath);
                 combinedCode += `\n\n--- File: ${entry.name} ---\n${content}`;
              }
            }
          }
        };
        await readFolderRecursive(targetFolder);
      } catch (e) {
        console.error("Failed to read project files for documentation:", e);
      }
    } else {
      combinedCode = `\n\n--- File: ${activeTab?.name || ''} ---\n${activeTab?.content || ''}`;
    }
    
    const sysPrompt = "You are an expert technical writer. Analyze the provided project files and generate a clean, comprehensive README.md documentation explaining what the project is, its structure, and how it works. Output ONLY the raw markdown wrapped in a ```markdown block.";
    const userPrompt = `Generate documentation for this project based on these files:\n${combinedCode.substring(0, 15000)}`;
    
    let newTabId = "";
    let docBuffer = "";
    let readmePath = "";
    
    if (targetFolder) {
      try {
        const { join } = await import("@tauri-apps/api/path");
        readmePath = await join(targetFolder, "README.md");
      } catch (e) {}
    }
    
    await streamAIPrompt(sysPrompt, userPrompt, async (code, isComplete, isStart) => {
      if (isStart) {
        newTabId = `doc-${Date.now()}`;
        setTabs(prev => [...prev, {
          id: newTabId, name: 'README.md', path: readmePath, content: '', lang: 'markdown'
        }]);
        setActiveTabId(newTabId);
        
        if (readmePath) {
          try {
            const { writeTextFile } = await import("@tauri-apps/plugin-fs");
            await writeTextFile(readmePath, "");
            setRefreshTrigger(prev => prev + 1);
          } catch(e) {}
        }
      }
      docBuffer += code;
      const cleaned = docBuffer.replace(/```[a-zA-Z0-9+-]*\r?\n?/g, "").replace(/```/g, "");
      setTabs(prev => prev.map(t => t.id === newTabId ? { ...t, content: cleaned } : t));
      
      if (isComplete && readmePath) {
         try {
           const { writeTextFile } = await import("@tauri-apps/plugin-fs");
           await writeTextFile(readmePath, cleaned);
         } catch(e) {}
      }
    });
  };

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: true });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      setFolderPaths(prev => {
        const newPaths = [...prev];
        paths.forEach(p => {
          if (!newPaths.includes(p)) newPaths.push(p);
        });
        if (!activeFolderPath && newPaths.length > 0) {
          setActiveFolderPath(newPaths[0]);
        }
        return newPaths;
      });
    }
  };

  const handleFileClick = async (filePath: string) => {
    try {
      const matchingFolder = folderPaths.find(p => filePath.startsWith(p));
      if (matchingFolder) setActiveFolderPath(matchingFolder);

      const content = await readTextFile(filePath);
      const name = filePath.split(/[/\\]/).pop() || "file";
      const ext = name.split('.').pop() || "";
      const lang = ext === "py" ? "python" : ext === "js" ? "javascript" : ext === "cpp" ? "cpp" : ext === "c" ? "c" : "plaintext";
      
      const existing = tabs.find(t => t.path === filePath);
      if (existing) {
        setActiveTabId(existing.id);
      } else {
        const newId = `file-${Date.now()}`;
        setTabs([...tabs, { id: newId, name, path: filePath, content, lang }]);
        setActiveTabId(newId);
      }
    } catch (err) {
      console.error("Failed to read file", err);
    }
  };

  const activeProcessRef = useRef<any>(null);
  const terminalInputHandlerRef = useRef<any>(null);

  const handleRun = async () => {
    setActiveBottomTab("terminal");
    appendOutput(`Executing ${(activeTab?.lang || 'python')} script...`);
    if (getActiveTerminal()) {
      const term = getActiveTerminal();
      term.writeln(`\x1b[1;33m> Executing ${(activeTab?.lang || 'python')} script...\x1b[0m`);
      
      if (!activeTab) return;
      let code = activeTab?.content || '';
      
      try {
        const { appDataDir, join, dirname, basename } = await import("@tauri-apps/api/path");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const { Command } = await import("@tauri-apps/plugin-shell");
        
        // Kill previous running instance and zombies
        if (activeProcessRef.current) {
          try { await activeProcessRef.current.kill(); } catch (e) {}
          activeProcessRef.current = null;
        }
        if (terminalInputHandlerRef.current) {
          terminalInputHandlerRef.current.dispose();
          terminalInputHandlerRef.current = null;
        }
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.cpp' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.c' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        await Command.create("powershell", ["-Command", "Stop-Process -Name 'scratch.go' -Force -ErrorAction SilentlyContinue"]).execute().catch(() => {});
        
        let executionPath = activeTab?.path;
        const lang = activeTab?.lang;
        if (!executionPath) {
            const appData = await appDataDir();
            const ext = lang === 'python' ? 'py' : lang === 'javascript' ? 'js' : lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : 'txt';
            executionPath = await join(appData, `scratch.${ext}`);
        }
        await writeTextFile(executionPath, code);
        
        const dir = await dirname(executionPath);
        const file = await basename(executionPath);
        
        let batContent = `@echo off\r\ncd /d "%~dp0"\r\n`;

        if (lang.includes("py")) {
          batContent += `python -u ${file}\r\n`;
        } else if (lang.includes("js") || lang.includes("node")) {
          batContent += `node ${file}\r\n`;
        } else if (lang.includes("rb") || lang.includes("ruby")) {
          batContent += `ruby ${file}\r\n`;
        } else if (lang.includes("go")) {
          batContent += `go run ${file}\r\n`;
        } else if (lang === "c" || lang === "cpp" || lang === "c++") {
          const compiler = lang === "c" ? "gcc" : "g++";
          batContent += `${compiler} ${file} -o ${file}.exe\r\nif %errorlevel% neq 0 ( pause & exit /b %errorlevel% )\r\n${file}.exe\r\n`;
        } else {
          batContent += `${lang} ${file}\r\n`;
        }
        
        batContent += `\r\necho.\r\npause\r\n`;
        
        const batPath = await join(dir, "scratch.bat");
        await writeTextFile(batPath, batContent);
        
        term.writeln(`\r\n\x1b[1;36m> Launching external native terminal for interactive execution...\x1b[0m`);
        
        // Use Windows 'start' to pop open a native cmd window
        const cmd = Command.create("cmd", ["/c", "start", `VoiceIDE Execution`, "cmd", "/c", batPath]);
        
        cmd.on('error', error => term.writeln(`\r\n\x1b[1;31mError launching terminal:\x1b[0m ${error}`));
        
        await cmd.spawn();
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31mExecution setup failed:\x1b[0m ${err}`);
      }
    }
  };

  if (!isBootstrapped) {
    return <Bootstrap onBootstrapped={() => setIsBootstrapped(true)} />;
  }

  return (
    <div className="app-container">
      {/* TITLE BAR */}
      <header className="title-bar">
        <div className="window-controls">
          <div className="dot red"></div>
          <div className="dot yellow"></div>
          <div className="dot green"></div>
          <Plus size={14} className="window-add" onClick={openNewFileModal} />
        </div>
        <div className="tabs-container">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`tab ${activeTabId === tab.id ? 'active' : 'inactive'}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className={`tab-icon ${tab.lang}`}></span>
              {tab.name}
              <X size={12} className="tab-close" onClick={(e) => closeTab(tab.id, e)} />
            </div>
          ))}
        </div>
        <div className="title-actions">
          <div className="toggle-diff" onClick={() => setShowDiff(!showDiff)} style={{cursor: 'pointer'}}>
            <span className="text">Show difference</span>
            <div className={`toggle-switch ${showDiff ? 'on' : 'off'}`}></div>
          </div>
          <button className="invite-btn">Invite</button>
          <div className="icon-btn"><Bell size={14} /></div>
          <div className="icon-btn"><Settings size={14} /></div>
          <div className="avatar-btn">J</div>
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="home-btn" onClick={handleOpenFolder}>
            <FolderOpen size={14} />
            <ChevronDown size={12} style={{marginLeft: 4}} />
          </div>
          <div className="toolbar-actions">
            <button className="action-btn" onClick={handleRun}>
              <Play size={12} style={{marginRight: 6}} /> Run Code
            </button>
            <button className="action-btn" onClick={handleDebug}>
              <Bug size={12} style={{marginRight: 6}} /> Debug
            </button>
            <button className="action-btn" onClick={handleOptimize}>
              <Zap size={12} style={{marginRight: 6}} /> Optimize
            </button>
            <button className="action-btn" onClick={handleTranslate}>
              <Languages size={12} style={{marginRight: 6}} /> Translate
            </button>
            <button className="action-btn" onClick={handleDocumentation}>
              <BookOpen size={12} style={{marginRight: 6}} /> Documentation
            </button>
            <button 
              className={`action-btn record-action ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={status === "processing"}
            >
              <Mic size={12} style={{marginRight: 6}} /> 
              {status === "idle" ? "Generate Voice Code" : status === "recording" ? "Recording..." : "Processing..."}
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <select 
            className="language-select" 
            value={activeTab?.lang || 'python'} 
            onChange={(e) => {
              const newLang = e.target.value;
              const newExt = newLang === 'python' ? 'py' : newLang === 'javascript' ? 'js' : newLang === 'cpp' ? 'cpp' : newLang === 'c' ? 'c' : newLang;
              setTabs(tabs.map(t => {
                if (t.id === activeTabId) {
                  return {
                    ...t, 
                    lang: newLang,
                    name: !t.path ? `scratch.${newExt}` : t.name
                  };
                }
                return t;
              }));
            }}
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="go">Go</option>
            <option value="ruby">Ruby</option>
            <option value="rust">Rust</option>
          </select>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-top">
            <button className="create-file-btn" onClick={openNewFileModal}>
              <Plus size={14} style={{marginRight: 6}} /> Create new file
            </button>
            <button className="search-btn"><Search size={14} /></button>
          </div>
          <div className="sidebar-section">
            <div className="section-header">
              <span>Explorer</span>
              <span className="dots">...</span>
            </div>
            <div className="sidebar-tree">
              {folderPaths.length > 0 ? (
                <div className="file-tree root">
                  {folderPaths.map((path, idx) => (
                    <div 
                      key={path} 
                      className={`folder-root-container ${activeFolderPath === path ? 'active-folder' : ''}`}
                      onClickCapture={() => setActiveFolderPath(path)}
                    >
                      <FileTree 
                        path={path} 
                        onFileClick={handleFileClick} 
                        refreshTrigger={refreshTrigger} 
                        isRoot={false}
                        startsExpanded={idx === 0} 
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-sidebar">No folder opened</div>
              )}
            </div>
          </div>
        </aside>
        
        {/* EDITOR & TERMINAL */}
        <div className="editor-terminal-split">
          <div className="editor-pane">
            {activeTab ? (
              <>
                <div className="breadcrumb">
                  project &gt; {activeTab?.path || activeTab?.name || ''}
                </div>
                <div className="editor-wrapper">
                  <div style={{ display: showDiff ? "block" : "none", height: "100%" }}>
                     <DiffEditor
                       height="100%"
                       language={(activeTab?.lang || 'python')}
                       original={activeTab?.content || ''}
                       modified={streamBufferRef.current}
                       theme="vs-dark"
                       onMount={handleDiffEditorDidMount}
                       options={{
                         minimap: { enabled: false },
                         automaticLayout: true,
                         fontSize: 14,
                         lineHeight: 24,
                         padding: { top: 16 }
                       }}
                     />
                  </div>
                  <div style={{ display: showDiff ? "none" : "block", height: "100%" }}>
                     <Editor
                       height="100%"
                       language={(activeTab?.lang || 'python')}
                       value={activeTab?.content || ''}
                       onChange={handleEditorChange}
                       theme="vs-dark"
                       onMount={handleEditorDidMount}
                       options={{
                         minimap: { enabled: false },
                         automaticLayout: true,
                         fontSize: 14,
                         wordWrap: "on",
                         lineHeight: 24,
                         padding: { top: 16 }
                       }}
                     />
                  </div>
                </div>
              </>
            ) : (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <h1 className="welcome-title">VoiceIDE</h1>
                  <p className="welcome-subtitle">Advanced AI Coding Environment</p>
                  <div className="welcome-actions">
                    <button className="welcome-btn" onClick={openNewFileModal}>
                      <Plus size={16} /> New File
                    </button>
                    <button className="welcome-btn" onClick={handleOpenFolder}>
                      <FolderOpen size={16} /> Open Folder
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="terminal-pane">
            <div className="terminal-tabs-bar">
              <div className="terminal-tabs">
                <div 
                  className={`term-tab ${activeBottomTab === 'problems' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('problems')}
                >
                  PROBLEMS {problems.length > 0 && <span className="badge">{problems.length}</span>}
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'output' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('output')}
                >
                  OUTPUT
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('terminal')}
                >
                  TERMINAL
                </div>
                <div 
                  className={`term-tab ${activeBottomTab === 'debug' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('debug')}
                >
                  DEBUG CONSOLE
                </div>
              </div>
              <div className="terminal-actions">
                <div className="terminal-dropdown-container">
                  <select 
                    className="term-dropdown-select"
                    value={activeTerminalId}
                    onChange={(e) => {
                       setActiveTerminalId(e.target.value);
                       setActiveBottomTab("terminal");
                    }}
                  >
                    {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <Plus size={14} className="term-icon" onClick={createNewTerminal}  />
                <TerminalSquare size={14} className="term-icon" />
                <Minus size={14} className="term-icon" onClick={deleteTerminal}  />
                <X size={14} className="term-icon" />
              </div>
            </div>
            <div className="terminal-content">
              {/* TERMINAL */}
              <div style={{ display: activeBottomTab === "terminal" ? "block" : "none", height: "100%" }}>
                {terminals.map(term => (
                   <div key={term.id} style={{ display: activeTerminalId === term.id ? "block" : "none", height: "100%" }}>
                     <TerminalComponent onRef={(t) => (terminalRefs.current[term.id] = t)} />
                   </div>
                ))}
              </div>
              
              {/* PROBLEMS */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "problems" ? "block" : "none" }}>
                {problems.length === 0 ? (
                  <div className="empty-panel">No problems have been detected in the workspace.</div>
                ) : (
                  problems.map((p, i) => (
                    <div key={i} className="problem-row">
                      <span className={`severity-${p.severity}`}>
                        {p.severity === 8 ? "🔴" : p.severity === 4 ? "🟡" : "🔵"}
                      </span>
                      <span className="problem-msg">{p.message}</span>
                      <span className="problem-loc">
                        [{p.startLineNumber}, {p.startColumn}]
                      </span>
                    </div>
                  ))
                )}
              </div>
              
              {/* OUTPUT */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "output" ? "block" : "none" }}>
                {outputLogs.map((log, i) => (
                  <div key={i} className="output-row">{log}</div>
                ))}
              </div>
              
              {/* DEBUG CONSOLE */}
              <div className="bottom-panel-content" style={{ display: activeBottomTab === "debug" ? "block" : "none" }}>
                {debugLogs.map((log, i) => (
                  <div key={i} className={`debug-row ${log.startsWith('[ERR]') ? 'error' : log.startsWith('[WARN]') ? 'warn' : ''}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {showNewFileModal && (
        <div className="modal-overlay" onClick={() => setShowNewFileModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create New File</h3>
            <form onSubmit={submitNewFile} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <input 
                type="text" 
                className="modal-input" 
                placeholder={`e.g. main.${activeTab?.lang === 'python' ? 'py' : activeTab?.lang === 'cpp' ? 'cpp' : 'js'}`}
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowNewFileModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* STATUS BAR */}
      <footer className="status-bar">
        <div className="status-left">
          <span className="status-item">0 ⚠ 4 ⓧ 0</span>
          <span className="status-item">Live share</span>
        </div>
        <div className="status-middle">
          Auto saved: just now &nbsp;&nbsp;&nbsp; {(activeTab?.lang || 'python').toUpperCase()} 64-bit
        </div>
        <div className="status-right">
          Spaces: 4 &nbsp;&nbsp; UTF-8 &nbsp;&nbsp; CRLF &nbsp;&nbsp; {activeTab?.lang || 'python'}
        </div>
      </footer>
    </div>
  );
}

export default App;










